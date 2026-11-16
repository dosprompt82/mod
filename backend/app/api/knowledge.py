"""Search, Knowledge (second brain) and the writing profile."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai.workflows import run_writing_profile
from ..db import get_db
from ..models import (Analysis, Attachment, DocumentChunk, Draft, KnowledgeItem, Workspace, WritingProfile, jdump, jload)
from ..services import search
from ..services.audit import audit
from ..services.jobs import start_run
from .common import err, knowledge_dict, profile_dict, run_dict
from .deps import require_ai_ready

router = APIRouter()

CATEGORIES = ("reference", "previous_analysis", "decision", "writing_example", "project", "preference")
PROVENANCE = ("user_fact", "user_approved", "source_document", "ai_draft", "ai_interpretation")


@router.get("/search")
def search_all(q: str = "", kinds: str | None = None, provenance: str | None = None, workspace_id: str | None = None,
               date_from: str | None = None, date_to: str | None = None, tag: str | None = None, doctype: str | None = None,
               limit: int = Query(30, le=200), db: Session = Depends(get_db)):
    args = dict(kinds=kinds.split(",") if kinds else None, provenance=provenance.split(",") if provenance else None,
                workspace_id=workspace_id, date_from=date_from, date_to=date_to, tag=tag, doctype=doctype, limit=limit)
    hits = search.search(db, q, **args)
    relaxed = False
    if not hits and q.strip():
        hits, relaxed = search.search(db, q, match="any", **args), True
    ws_titles = {w.id: w.title for w in db.query(Workspace).filter(Workspace.id.in_({h["workspace_id"] for h in hits if h["workspace_id"]}))}
    out = []
    for h in hits:
        item = {"kind": h["kind"], "id": h["ref_id"], "title": h["title"], "excerpt": h["snip"], "provenance": h["provenance"],
                "workspace_id": h["workspace_id"] or None, "workspace_title": ws_titles.get(h["workspace_id"]), "created_at": h["created"]}
        if h["kind"] == "chunk":
            c = db.get(DocumentChunk, int(h["ref_id"]))
            if c is None:
                continue
            item.update({"attachment_id": c.attachment_id, "page": c.page_number, "section": c.section, "text_source": c.text_source,
                         "doctype": c.attachment.kind})
        elif h["kind"] == "knowledge":
            k = db.get(KnowledgeItem, h["ref_id"])
            if k is None:
                continue
            item.update({"category": k.category, "tags": jload(k.tags, [])})
        elif h["kind"] == "analysis":
            a = db.get(Analysis, h["ref_id"])
            if a is None:
                continue
            item["workflow"] = a.workflow
        elif h["kind"] == "draft":
            d = db.get(Draft, h["ref_id"])
            if d is None:
                continue
            item["draft_kind"] = d.kind
        out.append(item)
    return {"results": out, "query": q, "relaxed": relaxed and bool(out)}


class KnowledgeIn(BaseModel):
    category: Literal[CATEGORIES] = "reference"  # type: ignore[valid-type]
    title: str = Field(..., min_length=1, max_length=300)
    body: str = Field(..., min_length=1, max_length=200_000)
    tags: list[str] = Field(default_factory=list)
    provenance: Literal[PROVENANCE] = "user_fact"  # type: ignore[valid-type]
    workspace_id: str | None = None
    source_ref: dict = Field(default_factory=dict)


class KnowledgePatch(BaseModel):
    category: Literal[CATEGORIES] | None = None  # type: ignore[valid-type]
    title: str | None = Field(None, min_length=1, max_length=300)
    body: str | None = Field(None, min_length=1, max_length=200_000)
    tags: list[str] | None = None


def _index_k(db: Session, k: KnowledgeItem) -> None:
    search.index(db, "knowledge", k.id, k.workspace_id, k.provenance, k.title, k.body, " ".join(jload(k.tags, [])) + f" category:{k.category}", k.created_at)


def _tags(tags: list[str]) -> str:
    return jdump(sorted({t.strip().lower()[:40] for t in tags if t.strip()}))


@router.get("/knowledge")
def list_knowledge(category: str | None = None, provenance: str | None = None, q: str | None = None, limit: int = Query(200, le=1000), db: Session = Depends(get_db)):
    query = db.query(KnowledgeItem)
    if category:
        query = query.filter_by(category=category)
    if provenance:
        query = query.filter_by(provenance=provenance)
    if q:
        ids = [h["ref_id"] for h in search.search(db, q, kinds=["knowledge"], limit=500)]
        query = query.filter(KnowledgeItem.id.in_(ids))
    return {"items": [knowledge_dict(k) for k in query.order_by(KnowledgeItem.updated_at.desc()).limit(limit)]}


@router.post("/knowledge", status_code=201)
def create_knowledge(body: KnowledgeIn, db: Session = Depends(get_db)):
    if body.workspace_id and db.get(Workspace, body.workspace_id) is None:
        raise err(404, "Workspace not found.", "not_found")
    k = KnowledgeItem(category=body.category, title=body.title.strip(), body=body.body, tags=_tags(body.tags), provenance=body.provenance,
                      workspace_id=body.workspace_id, source_ref=jdump(body.source_ref))
    db.add(k)
    db.flush()
    _index_k(db, k)
    audit(db, "knowledge_saved", "knowledge", k.id, category=k.category, provenance=k.provenance)
    db.commit()
    return knowledge_dict(k)


class SaveResultIn(BaseModel):
    source_type: Literal["analysis", "draft", "review"]
    source_id: str
    category: Literal[CATEGORIES] | None = None  # type: ignore[valid-type]
    title: str | None = None
    tags: list[str] = Field(default_factory=list)


@router.post("/knowledge/from-result", status_code=201)
def save_result(body: SaveResultIn, db: Session = Depends(get_db)):
    """'Save to Knowledge': the user explicitly approves an AI result. Provenance records both facts."""
    from ..models import Review

    if body.source_type == "analysis":
        a = db.get(Analysis, body.source_id)
        if a is None:
            raise err(404, "Analysis not found.", "not_found")
        a.approved = True
        title, text, ws_id = a.title, a.markdown, a.workspace_id
        category = body.category or ("decision" if a.workflow == "strategy" else "previous_analysis")
    elif body.source_type == "draft":
        d = db.get(Draft, body.source_id)
        if d is None:
            raise err(404, "Draft not found.", "not_found")
        v = d.versions[-1]
        title, text, ws_id = d.title, (f"Subject: {v.subject}\n\n" if v.subject else "") + v.body, d.workspace_id
        category = body.category or ("writing_example" if v.author == "user" else "previous_analysis")
    else:
        r = db.get(Review, body.source_id)
        if r is None:
            raise err(404, "Review not found.", "not_found")
        title, text, ws_id, category = "Critical review", r.markdown, r.workspace_id, body.category or "previous_analysis"
    k = KnowledgeItem(category=category, title=(body.title or title)[:300], body=text, tags=_tags(body.tags), provenance="user_approved",
                      workspace_id=ws_id, source_ref=jdump({"type": body.source_type, "id": body.source_id, "origin": "ai_generated"}))
    db.add(k)
    db.flush()
    _index_k(db, k)
    audit(db, "knowledge_saved", "knowledge", k.id, from_type=body.source_type)
    db.commit()
    return knowledge_dict(k)


@router.get("/knowledge/export")
def export_knowledge(format: Literal["json", "md"] = "json", db: Session = Depends(get_db)):
    items = [knowledge_dict(k) for k in db.query(KnowledgeItem).order_by(KnowledgeItem.category, KnowledgeItem.title)]
    profiles = [profile_dict(p) for p in db.query(WritingProfile).filter(WritingProfile.status == "approved")]
    stamp = datetime.now().strftime("%Y%m%d")
    audit(db, "knowledge_exported", "knowledge", None, count=len(items), format=format)
    db.commit()
    if format == "json":
        data = json.dumps({"exported_at": datetime.now(UTC).isoformat(), "items": items, "writing_profiles": profiles}, indent=2, ensure_ascii=False)
        return Response(data, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="knowledge-{stamp}.json"'})
    lines = ["# Knowledge export", ""]
    for i in items:
        lines += [f"## {i['title']}", "", f"*{i['category']} · {i['provenance']} · tags: {', '.join(i['tags']) or 'none'} · updated {i['updated_at'][:10]}*", "", i["body"], ""]
    return Response("\n".join(lines), media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="knowledge-{stamp}.md"'})


@router.get("/knowledge/{kid}")
def get_knowledge(kid: str, db: Session = Depends(get_db)):
    k = db.get(KnowledgeItem, kid)
    if k is None:
        raise err(404, "Knowledge item not found.", "not_found")
    return knowledge_dict(k)


@router.patch("/knowledge/{kid}")
def update_knowledge(kid: str, body: KnowledgePatch, db: Session = Depends(get_db)):
    k = db.get(KnowledgeItem, kid)
    if k is None:
        raise err(404, "Knowledge item not found.", "not_found")
    if body.category is not None:
        k.category = body.category
    if body.title is not None:
        k.title = body.title.strip()
    if body.body is not None:
        k.body = body.body
        if k.provenance in ("ai_draft", "ai_interpretation"):
            k.provenance = "user_approved"  # the user has now edited and kept it
    if body.tags is not None:
        k.tags = _tags(body.tags)
    k.updated_at = datetime.now(UTC)
    _index_k(db, k)
    audit(db, "knowledge_updated", "knowledge", k.id)
    db.commit()
    return knowledge_dict(k)


@router.delete("/knowledge/{kid}")
def delete_knowledge(kid: str, db: Session = Depends(get_db)):
    k = db.get(KnowledgeItem, kid)
    if k is None:
        raise err(404, "Knowledge item not found.", "not_found")
    search.remove(db, "knowledge", k.id)
    db.delete(k)
    audit(db, "knowledge_deleted", "knowledge", kid)
    db.commit()
    return {"deleted": kid}


# ---- writing profile ------------------------------------------------------------------------

class ProfileProposeIn(BaseModel):
    text: str | None = Field(None, max_length=100_000)
    knowledge_ids: list[str] = Field(default_factory=list)
    attachment_ids: list[str] = Field(default_factory=list)


@router.get("/writing-profile")
def get_profiles(db: Session = Depends(get_db)):
    approved = db.query(WritingProfile).filter_by(status="approved").order_by(WritingProfile.approved_at.desc()).first()
    proposed = db.query(WritingProfile).filter_by(status="proposed").order_by(WritingProfile.created_at.desc()).first()
    return {"approved": profile_dict(approved) if approved else None, "proposed": profile_dict(proposed) if proposed else None}


@router.post("/writing-profile/propose", status_code=202)
def propose_profile(body: ProfileProposeIn, db: Session = Depends(get_db)):
    samples: list[tuple[str, str]] = []
    if body.text and body.text.strip():
        samples.append(("Pasted sample", body.text.strip()))
    for kid in body.knowledge_ids:
        k = db.get(KnowledgeItem, kid)
        if k:
            samples.append((k.title, k.body))
    for aid in body.attachment_ids:
        a = db.get(Attachment, aid)
        if a and a.chunks:
            samples.append((a.original_filename, "\n\n".join(c.text for c in a.chunks)))
    if sum(len(t) for _, t in samples) < 300:
        raise err(400, "Provide at least a few paragraphs of your own writing (300+ characters).", "too_short")
    require_ai_ready(db)

    def job(r):
        r.results.append(run_writing_profile(r, samples))

    run = start_run(db, workflow="writing_profile", steps=["writing_profile"], workspace_id=None, summary=f"{len(samples)} sample(s)", job=job)
    return {"run": run_dict(run)}


class ProfilePatch(BaseModel):
    profile: dict


@router.put("/writing-profile/{pid}")
def edit_profile(pid: str, body: ProfilePatch, db: Session = Depends(get_db)):
    p = db.get(WritingProfile, pid)
    if p is None:
        raise err(404, "Profile not found.", "not_found")
    allowed = {"summary", "sentence_length", "tone", "structure", "vocabulary", "technical_depth", "directness", "formatting", "do", "avoid", "characteristic_phrases"}
    clean = {k: v for k, v in body.profile.items() if k in allowed}
    p.profile_json = jdump({**jload(p.profile_json, {}), **clean})
    db.commit()
    return profile_dict(p)


@router.post("/writing-profile/{pid}/approve")
def approve_profile(pid: str, db: Session = Depends(get_db)):
    p = db.get(WritingProfile, pid)
    if p is None:
        raise err(404, "Profile not found.", "not_found")
    for old in db.query(WritingProfile).filter_by(status="approved"):
        old.status = "superseded"
    p.status, p.approved_at = "approved", datetime.now(UTC)
    audit(db, "writing_profile_approved", "writing_profile", p.id)
    db.commit()
    return profile_dict(p)


@router.delete("/writing-profile/{pid}")
def delete_profile(pid: str, db: Session = Depends(get_db)):
    p = db.get(WritingProfile, pid)
    if p is None:
        raise err(404, "Profile not found.", "not_found")
    db.delete(p)
    db.commit()
    return {"deleted": pid}
