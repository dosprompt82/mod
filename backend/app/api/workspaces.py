"""Workspaces, conversation runs and workspace export."""
from __future__ import annotations

import io
import json
import time
import zipfile
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai.workflows import ACTIONS, WORKFLOW_LABELS, StepInput, default_instruction, plan, run_step
from ..db import get_db
from ..models import (Analysis, Attachment, Decision, Draft, KnowledgeItem, Message, ModelRun, Review, Task, Workspace,
                      jdump, jload)
from ..security import sanitize_filename, slugify_title
from ..services import search
from ..services.audit import audit
from ..services.extraction import index_attachment_chunks
from ..services.jobs import start_run
from ..services.storage import stored_path
from .common import (analysis_dict, attachment_dict, decision_dict, draft_dict, err, knowledge_dict, message_dict, review_dict,
                     run_dict, task_dict, workspace_summary)
from .deps import require_ai_ready

router = APIRouter()


def get_ws(db: Session, ws_id: str) -> Workspace:
    ws = db.get(Workspace, ws_id)
    if ws is None:
        raise err(404, "Workspace not found.", "not_found")
    return ws


class WorkspaceIn(BaseModel):
    title: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=5000)


class WorkspacePatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = Field(None, max_length=5000)
    status: Literal["active", "waiting", "completed", "archived"] | None = None
    tags: list[str] | None = None


@router.get("/workspaces")
def list_workspaces(status: str | None = None, q: str | None = None, limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    query = db.query(Workspace)
    if status == "open":
        query = query.filter(Workspace.status != "archived")
    elif status:
        query = query.filter(Workspace.status == status)
    if q:
        query = query.filter(Workspace.title.ilike(f"%{q}%"))
    return {"workspaces": [workspace_summary(w) for w in query.order_by(Workspace.updated_at.desc()).limit(limit)]}


@router.post("/workspaces", status_code=201)
def create_workspace(body: WorkspaceIn, db: Session = Depends(get_db)):
    ws = Workspace(title=(body.title or "Untitled workspace").strip(), title_is_auto=not body.title, description=body.description or "")
    db.add(ws)
    db.flush()
    audit(db, "workspace_created", "workspace", ws.id)
    db.commit()
    return workspace_summary(ws)


@router.get("/workspaces/{ws_id}")
def get_workspace(ws_id: str, db: Session = Depends(get_db)):
    ws = get_ws(db, ws_id)
    analyses = db.query(Analysis).filter_by(workspace_id=ws.id).order_by(Analysis.created_at).all()
    reviews = db.query(Review).filter_by(workspace_id=ws.id).order_by(Review.created_at).all()
    drafts = db.query(Draft).filter_by(workspace_id=ws.id).order_by(Draft.created_at).all()
    runs = db.query(ModelRun).filter_by(workspace_id=ws.id).order_by(ModelRun.created_at).all()
    return {
        **workspace_summary(ws),
        "messages": [message_dict(m) for m in ws.messages],
        "attachments": [attachment_dict(a) for a in ws.attachments],
        "analyses": [analysis_dict(a) for a in analyses],
        "reviews": [review_dict(r) for r in reviews],
        "drafts": [draft_dict(d) for d in drafts],
        "tasks": [task_dict(t) for t in db.query(Task).filter_by(workspace_id=ws.id).order_by(Task.created_at)],
        "decisions": [decision_dict(d) for d in db.query(Decision).filter_by(workspace_id=ws.id).order_by(Decision.created_at)],
        "knowledge": [knowledge_dict(k) for k in db.query(KnowledgeItem).filter_by(workspace_id=ws.id)],
        "runs": [run_dict(r) for r in runs],
    }


@router.patch("/workspaces/{ws_id}")
def update_workspace(ws_id: str, body: WorkspacePatch, db: Session = Depends(get_db)):
    ws = get_ws(db, ws_id)
    if body.title is not None:
        ws.title, ws.title_is_auto = body.title.strip(), False
    if body.description is not None:
        ws.description = body.description
    if body.status is not None:
        ws.status = body.status
    if body.tags is not None:
        ws.tags = jdump(sorted({t.strip()[:40] for t in body.tags if t.strip()}))
    audit(db, "workspace_updated", "workspace", ws.id, fields=[k for k, v in body.model_dump().items() if v is not None])
    db.commit()
    return workspace_summary(ws)


@router.delete("/workspaces/{ws_id}")
def delete_workspace(ws_id: str, confirm: bool = False, db: Session = Depends(get_db)):
    """Deletes the workspace, its conversation, uploaded files, analyses and reviews.
    Drafts, tasks, decisions and saved knowledge are kept and simply unlinked."""
    if not confirm:
        raise err(400, "Deleting a workspace requires confirmation.", "confirm_required")
    ws = get_ws(db, ws_id)
    files = [a.stored_name for a in ws.attachments]
    chunk_ids = [str(c.id) for a in ws.attachments for c in a.chunks]
    search.remove_many(db, "chunk", chunk_ids)
    search.remove_workspace(db, ws.id, ("analysis",))
    db.delete(ws)
    audit(db, "workspace_deleted", "workspace", ws_id, files=len(files))
    db.commit()
    for name in files:
        try:
            stored_path(name).unlink(missing_ok=True)
        except OSError:
            pass
    return {"deleted": ws_id}


class RunIn(BaseModel):
    instruction: str = Field("", max_length=20000)
    attachment_ids: list[str] = Field(default_factory=list, max_length=40)
    action: str | None = None
    workflow: str | None = None
    target_type: Literal["analysis", "draft"] | None = None
    target_id: str | None = None
    draft_kind: str | None = Field(None, max_length=40)


@router.post("/workspaces/{ws_id}/runs", status_code=202)
def create_run(ws_id: str, body: RunIn, db: Session = Depends(get_db)):
    ws = get_ws(db, ws_id)
    require_ai_ready(db)
    if body.action and body.action not in ACTIONS:
        raise err(400, f"Unknown action '{body.action}'.", "bad_request")
    focus: list[Attachment] = []
    for aid in body.attachment_ids:
        att = db.get(Attachment, aid)
        if att is None:
            raise err(404, "One of the attachments no longer exists. Remove it and try again.", "not_found")
        if att.workspace_id not in (None, ws.id):
            raise err(400, "That attachment belongs to another workspace.", "bad_request")
        if att.status == "failed":
            raise err(400, f"'{att.original_filename}' could not be read ({att.error}). Remove it and try again.", "bad_request")
        if att.workspace_id is None:
            att.workspace_id = ws.id  # its text is indexed by the background job, not in this request
        focus.append(att)
    pool = focus or list(ws.attachments)
    has_images = any(a.kind == "image" for a in pool)
    has_docs = any(a.kind != "image" for a in pool)
    has_prior = db.query(Analysis).filter_by(workspace_id=ws.id).count() > 0 or db.query(Draft).filter_by(workspace_id=ws.id).count() > 0
    typed = body.instruction.strip()
    instruction = typed or default_instruction(body.action, has_images, has_docs)
    from ..ai.provider import AIError

    try:
        steps = plan(instruction, body.action, body.workflow, has_docs, has_images, has_prior, has_target=bool(body.target_id))
    except AIError as e:
        raise err(400, e.user_message, e.code) from None
    if steps[0] == "review" and not (body.target_id or has_prior):
        raise err(400, "There is nothing to challenge yet. Ask for an analysis or a draft first.", "bad_request")
    msg = Message(workspace_id=ws.id, role="user", content=typed or f"{instruction}", workflow=steps[0],
                  attachment_ids=jdump([a.id for a in focus]))
    db.add(msg)
    ws.updated_at = datetime.now(UTC)
    if ws.status in ("completed", "archived"):
        ws.status = "active"
    db.commit()
    focus_ids = [a.id for a in focus]

    def job(r):
        # Wait (bounded) for extraction of files attached to this request.
        deadline = time.monotonic() + 900  # very large PDFs (e.g. 1,000-page guides) can take a while
        while True:
            pending = [a for a in (r.db.get(Attachment, i) for i in focus_ids) if a is not None and a.status in ("uploaded", "extracting")]
            if not pending or time.monotonic() > deadline:
                break
            r.step(f"Reading {pending[0].original_filename}")
            r.db.expire_all()
            if r.cancel.wait(0.5):
                from ..ai.provider import CancelledRun

                raise CancelledRun()
        for i in focus_ids:
            a = r.db.get(Attachment, i)
            if a is not None:
                r.db.refresh(a)
                if len(a.chunks) > 200:
                    r.step(f"Preparing {a.original_filename} for search")
                index_attachment_chunks(r.db, a, commit=True)
        r.db.commit()
        w = r.db.get(Workspace, ws.id)
        for step in steps:
            inp = StepInput(w, instruction, focus_ids, body.target_type, body.target_id, body.draft_kind, previous=list(r.results))
            r.results.append(run_step(r, step, inp))
            r.run.result_type, r.run.result_id = r.results[-1]
            r.db.commit()

    run = start_run(db, workflow=steps[0], steps=steps, workspace_id=ws.id, summary=f"{len(focus)} file(s); steps={steps}", job=job, message_id=msg.id)
    msg.run_id = run.id
    db.commit()
    return {"run": run_dict(run), "message": message_dict(msg), "steps": steps, "labels": [WORKFLOW_LABELS.get(s, s) for s in steps]}


@router.get("/workspaces/{ws_id}/related")
def related_knowledge(ws_id: str, db: Session = Depends(get_db)):
    """Prior knowledge relevant to this workspace (keyword search on its title and latest request)."""
    ws = get_ws(db, ws_id)
    last = next((m.content for m in reversed(ws.messages) if m.role == "user"), "")
    q = " ".join(f"{ws.title} {last}".split()[:12])
    hits = search.search(db, q, kinds=["knowledge", "analysis", "draft"], exclude_workspace=ws.id, limit=8, match="any") if q.strip() else []
    return {"items": hits[:8]}


@router.get("/workspaces/{ws_id}/export")
def export_workspace(ws_id: str, db: Session = Depends(get_db)):
    """Portable export: JSON of everything in the workspace, Markdown of results, and the original files."""
    data = get_workspace(ws_id, db)
    ws = get_ws(db, ws_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("workspace.json", json.dumps(data, indent=2, ensure_ascii=False))
        for a in data["analyses"]:
            z.writestr(f"analyses/{slugify_title(a['title'])}-{a['id'][:6]}.md", f"# {a['title']}\n\n{a['markdown']}")
        for r in data["reviews"]:
            z.writestr(f"reviews/review-{r['id'][:6]}.md", f"# Critical review\n\n{r['markdown']}")
        for d in data["drafts"]:
            body = (f"Subject: {d['subject']}\n\n" if d["subject"] else "") + d["body"]
            z.writestr(f"drafts/{slugify_title(d['title'])}-{d['id'][:6]}.md", f"# {d['title']}\n\n{body}")
        for a in ws.attachments:
            try:
                z.write(stored_path(a.stored_name), f"files/{a.id[:6]}-{sanitize_filename(a.original_filename)}")
            except OSError:
                pass
    audit(db, "workspace_exported", "workspace", ws_id)
    db.commit()
    buf.seek(0)
    name = f"{slugify_title(ws.title, 'workspace')}.zip"
    return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})


_ = jload  # re-exported for type checkers
