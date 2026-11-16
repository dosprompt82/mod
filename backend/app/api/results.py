"""Runs, analyses, reviews, drafts (with version history and rewrites) and exports."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai.prompts import REWRITE_PRESETS
from ..ai.workflows import StepInput, new_draft, run_rewrite, run_step
from ..config import settings
from ..db import get_db
from ..models import Analysis, Draft, DraftVersion, Export, ModelRun, Review, Workspace, jload
from ..security import safe_join, slugify_title
from ..services import exporter, search
from ..services.audit import audit
from ..services.jobs import cancel_run, start_run
from .common import analysis_dict, draft_dict, err, review_dict, run_dict
from .deps import require_ai_ready

router = APIRouter()


# ---- runs ------------------------------------------------------------------------------

@router.get("/runs")
def list_runs(workspace_id: str | None = None, active: bool = False, limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    q = db.query(ModelRun)
    if workspace_id:
        q = q.filter_by(workspace_id=workspace_id)
    if active:
        q = q.filter(ModelRun.status.in_(["queued", "running"]))
    return {"runs": [run_dict(r) for r in q.order_by(ModelRun.created_at.desc()).limit(limit)]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)):
    r = db.get(ModelRun, run_id)
    if r is None:
        raise err(404, "Run not found.", "not_found")
    return run_dict(r)


@router.post("/runs/{run_id}/cancel")
def cancel(run_id: str, db: Session = Depends(get_db)):
    r = db.get(ModelRun, run_id)
    if r is None:
        raise err(404, "Run not found.", "not_found")
    if r.status not in ("queued", "running"):
        return run_dict(r)
    if not cancel_run(run_id):
        r.status, r.step_label = "cancelled", "Cancelled"
        db.commit()
    return run_dict(r)


# ---- analyses & reviews -------------------------------------------------------------------

@router.get("/analyses")
def list_analyses(workflow: str | None = None, limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    q = db.query(Analysis)
    if workflow:
        q = q.filter_by(workflow=workflow)
    return {"analyses": [analysis_dict(a) for a in q.order_by(Analysis.created_at.desc()).limit(limit)]}


@router.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    a = db.get(Analysis, analysis_id)
    if a is None:
        raise err(404, "Analysis not found.", "not_found")
    out = analysis_dict(a)
    out["revisions"] = [analysis_dict(x) for x in db.query(Analysis).filter_by(parent_analysis_id=a.id).order_by(Analysis.created_at)]
    out["parent"] = analysis_dict(db.get(Analysis, a.parent_analysis_id)) if a.parent_analysis_id else None
    return out


@router.post("/analyses/{analysis_id}/revise", status_code=202)
def revise_analysis(analysis_id: str, db: Session = Depends(get_db)):
    """Create a revised analysis from the latest critical review. The original is never overwritten."""
    a = db.get(Analysis, analysis_id)
    if a is None:
        raise err(404, "Analysis not found.", "not_found")
    if db.query(Review).filter_by(target_type="analysis", target_id=a.id).count() == 0:
        raise err(400, "Challenge the analysis first; the revision addresses the review.", "bad_request")
    require_ai_ready(db)

    def job(r):
        r.results.append(run_step(r, "revise_analysis", StepInput(None, "Revise the analysis to address the review.", [], "analysis", analysis_id)))

    run = start_run(db, workflow="revise_analysis", steps=["revise_analysis"], workspace_id=a.workspace_id, summary="revise analysis", job=job)
    return {"run": run_dict(run)}


@router.get("/reviews/{review_id}")
def get_review(review_id: str, db: Session = Depends(get_db)):
    r = db.get(Review, review_id)
    if r is None:
        raise err(404, "Review not found.", "not_found")
    return review_dict(r)


# ---- drafts ---------------------------------------------------------------------------------

class DraftIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    kind: str = Field("document", max_length=40)
    subject: str | None = Field(None, max_length=500)
    body: str = Field("", max_length=500_000)
    workspace_id: str | None = None


class DraftUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    subject: str | None = Field(None, max_length=500)
    body: str | None = Field(None, max_length=500_000)
    status: Literal["draft", "final"] | None = None
    note: str | None = Field(None, max_length=200)


class RewriteIn(BaseModel):
    preset: str | None = None
    instruction: str | None = Field(None, max_length=4000)


def _draft(db: Session, draft_id: str) -> Draft:
    d = db.get(Draft, draft_id)
    if d is None:
        raise err(404, "Draft not found.", "not_found")
    return d


@router.get("/drafts")
def list_drafts(q: str | None = None, kind: str | None = None, workspace_id: str | None = None, limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    query = db.query(Draft)
    if kind:
        query = query.filter_by(kind=kind)
    if workspace_id:
        query = query.filter_by(workspace_id=workspace_id)
    if q:
        ids = [h["ref_id"] for h in search.search(db, q, kinds=["draft"], limit=200)]
        query = query.filter(Draft.id.in_(ids) | Draft.title.ilike(f"%{q}%"))
    drafts = query.order_by(Draft.updated_at.desc()).limit(limit).all()
    titles = {w.id: w.title for w in db.query(Workspace).filter(Workspace.id.in_({d.workspace_id for d in drafts if d.workspace_id}))}
    return {"drafts": [{**draft_dict(d, versions=False), "workspace_title": titles.get(d.workspace_id)} for d in drafts]}


@router.post("/drafts", status_code=201)
def create_draft(body: DraftIn, db: Session = Depends(get_db)):
    if body.workspace_id and db.get(Workspace, body.workspace_id) is None:
        raise err(404, "Workspace not found.", "not_found")
    d = new_draft(db, body.workspace_id, body.title, body.kind, body.subject, body.body, "Created", "", author="user")
    audit(db, "draft_created", "draft", d.id)
    db.commit()
    return draft_dict(d)


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: str, db: Session = Depends(get_db)):
    return draft_dict(_draft(db, draft_id))


@router.put("/drafts/{draft_id}")
def update_draft(draft_id: str, body: DraftUpdate, db: Session = Depends(get_db)):
    """Edits never overwrite history: a changed subject/body becomes a new version."""
    d = _draft(db, draft_id)
    cur = d.versions[-1]
    if body.title is not None:
        d.title = body.title.strip()
    if body.status is not None:
        d.status = body.status
    new_body = body.body if body.body is not None else cur.body
    new_subject = body.subject if body.subject is not None else cur.subject
    if new_body != cur.body or (new_subject or None) != (cur.subject or None):
        d.current_version = cur.version_number + 1
        db.add(DraftVersion(draft_id=d.id, version_number=d.current_version, subject=new_subject or None, body=new_body,
                            note=body.note or "Edited", author="user"))
        search.index(db, "draft", d.id, d.workspace_id, "ai_draft", d.title, f"{new_subject or ''}\n{new_body}", f"kind:{d.kind}", d.created_at)
    d.updated_at = datetime.now(UTC)
    audit(db, "draft_saved", "draft", d.id, version=d.current_version)
    db.commit()
    db.refresh(d)
    return draft_dict(d)


@router.post("/drafts/{draft_id}/restore/{version}")
def restore_version(draft_id: str, version: int, db: Session = Depends(get_db)):
    d = _draft(db, draft_id)
    v = next((x for x in d.versions if x.version_number == version), None)
    if v is None:
        raise err(404, "Version not found.", "not_found")
    d.current_version += 1
    db.add(DraftVersion(draft_id=d.id, version_number=d.current_version, subject=v.subject, body=v.body, note=f"Restored version {version}", author="user"))
    d.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(d)
    return draft_dict(d)


@router.post("/drafts/{draft_id}/rewrite", status_code=202)
def rewrite(draft_id: str, body: RewriteIn, db: Session = Depends(get_db)):
    d = _draft(db, draft_id)
    if body.preset and body.preset not in REWRITE_PRESETS:
        raise err(400, "Unknown rewrite option.", "bad_request")
    if not body.preset and not (body.instruction or "").strip():
        raise err(400, "Say how to revise the draft.", "bad_request")
    if body.preset == "my_style":
        from ..models import WritingProfile

        if not db.query(WritingProfile).filter_by(status="approved").count():
            raise err(400, "Create and approve a writing profile first (Settings → Writing).", "no_profile")
    require_ai_ready(db)

    def job(r):
        dd = r.db.get(Draft, draft_id)
        r.results.append(run_rewrite(r, dd, body.preset, (body.instruction or "").strip() or None))

    run = start_run(db, workflow="rewrite", steps=["rewrite"], workspace_id=d.workspace_id, summary=f"rewrite {body.preset or 'custom'}", job=job)
    return {"run": run_dict(run)}


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: str, db: Session = Depends(get_db)):
    d = _draft(db, draft_id)
    search.remove(db, "draft", d.id)
    db.delete(d)
    audit(db, "draft_deleted", "draft", draft_id)
    db.commit()
    return {"deleted": draft_id}


# ---- exports -----------------------------------------------------------------------------------

class ExportIn(BaseModel):
    source_type: Literal["draft", "analysis", "review"]
    source_id: str
    format: Literal["docx", "md", "txt", "pdf"]
    version: int | None = None


def _source_lines(a: Analysis | Review | None) -> list[str]:
    if a is None:
        return []
    out = []
    for s in a.sources:
        where = s.original_filename or s.label
        if s.page_number:
            where += f", p. {s.page_number}"
        if s.section:
            where += f", {s.section}"
        flag = {"vision": " (read from an image by AI)", "unverified": " (not found in the source text: unverified)"}.get(s.verification, "")
        out.append(f"{where}{flag}: “{s.quote.strip()}”")
    return out


def build_export_doc(db: Session, body: ExportIn) -> exporter.ExportDoc:
    if body.source_type == "draft":
        d = _draft(db, body.source_id)
        v = next((x for x in d.versions if x.version_number == body.version), d.versions[-1]) if body.version else d.versions[-1]
        is_email = d.kind == "email"
        text = (f"Subject: {v.subject}\n\n" if v.subject else "") + v.body if is_email else v.body
        src = db.get(Analysis, d.source_analysis_id) if d.source_analysis_id else None
        return exporter.ExportDoc(d.title, text, plain=is_email, numbered=d.kind == "memo", show_date=not is_email,
                                  sources=None if is_email else _source_lines(src) or None,
                                  subtitle=f"Version {v.version_number}" if len(d.versions) > 1 else None)
    if body.source_type == "analysis":
        a = db.get(Analysis, body.source_id)
        if a is None:
            raise err(404, "Analysis not found.", "not_found")
        return exporter.ExportDoc(a.title, a.markdown, subtitle="Analysis prepared with AI assistance; verify before relying on it")
    r = db.get(Review, body.source_id)
    if r is None:
        raise err(404, "Review not found.", "not_found")
    target = db.get(Analysis, r.target_id) if r.target_type == "analysis" else db.get(Draft, r.target_id)
    return exporter.ExportDoc(f"Critical review: {getattr(target, 'title', 'item')}", r.markdown)


@router.post("/exports", status_code=201)
def create_export(body: ExportIn, db: Session = Depends(get_db)):
    doc = build_export_doc(db, body)
    settings.ensure_dirs()
    exp = Export(source_type=body.source_type, source_id=body.source_id, format=body.format,
                 filename=f"{slugify_title(doc.title)}-{datetime.now().strftime('%Y%m%d')}.{body.format}", stored_name="")
    exp.stored_name = f"{exp.id or ''}"
    db.add(exp)
    db.flush()
    exp.stored_name = f"{exp.id}.{body.format}"
    path = safe_join(settings.exports_dir, exp.stored_name)
    try:
        if body.format == "docx":
            exporter.to_docx(doc, path)
        elif body.format == "pdf":
            exporter.to_pdf(doc, path)
        elif body.format == "md":
            path.write_text(exporter.to_markdown(doc), encoding="utf-8")
        else:
            path.write_text(exporter.to_text(doc), encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        db.rollback()
        raise err(500, f"The {body.format.upper()} file could not be generated.", "export_failed") from e
    exp.size_bytes = path.stat().st_size
    audit(db, "exported", body.source_type, body.source_id, format=body.format)
    db.commit()
    return {"id": exp.id, "filename": exp.filename, "format": exp.format, "size_bytes": exp.size_bytes, "url": f"/api/exports/{exp.id}/download"}


@router.get("/exports/{export_id}/download")
def download_export(export_id: str, db: Session = Depends(get_db)):
    exp = db.get(Export, export_id)
    if exp is None:
        raise err(404, "Export not found.", "not_found")
    path = safe_join(settings.exports_dir, exp.stored_name)
    if not path.exists():
        raise err(404, "The exported file is no longer on disk.", "missing_file")
    media = {"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "pdf": "application/pdf",
             "md": "text/markdown; charset=utf-8", "txt": "text/plain; charset=utf-8"}[exp.format]
    return FileResponse(path, media_type=media, filename=exp.filename, headers={"X-Content-Type-Options": "nosniff"})


_ = jload
