"""Shared API helpers: user-facing errors and serializers."""
from __future__ import annotations

from fastapi import HTTPException

from ..models import (Analysis, Attachment, Decision, Draft, DraftVersion, KnowledgeItem, Message, ModelRun, Review,
                      SourceReference, Task, Workspace, WritingProfile, jload)


def err(status: int, message: str, code: str = "error") -> HTTPException:
    return HTTPException(status_code=status, detail={"message": message, "code": code})


def iso(dt):
    return dt.isoformat() if dt else None


def attachment_dict(a: Attachment) -> dict:
    vision_pages = sum(1 for p in a.pages if p.needs_vision and p.text_source == "extracted")
    transcribed = any(p.text_source == "vision" for p in a.pages)
    return {
        "id": a.id, "workspace_id": a.workspace_id, "filename": a.original_filename, "kind": a.kind, "mime_type": a.mime_type,
        "size_bytes": a.size_bytes, "checksum": a.checksum_sha256, "duplicate_of": a.duplicate_of, "status": a.status, "error": a.error,
        "page_count": a.page_count, "text_chars": a.text_chars, "vision_pages": vision_pages, "transcribed": transcribed,
        "width": a.width, "height": a.height, "created_at": iso(a.created_at), "doc_meta": jload(a.doc_meta, {}),
    }


def source_dict(s: SourceReference) -> dict:
    return {"id": s.id, "label": s.label, "attachment_id": s.attachment_id, "chunk_id": s.chunk_id, "filename": s.original_filename,
            "page": s.page_number, "section": s.section, "quote": s.quote, "explanation": s.explanation,
            "verification": s.verification, "location": jload(s.location, {})}


def message_dict(m: Message) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "workflow": m.workflow, "attachment_ids": jload(m.attachment_ids, []),
            "run_id": m.run_id, "result_type": m.result_type, "result_id": m.result_id, "created_at": iso(m.created_at)}


def analysis_dict(a: Analysis) -> dict:
    return {"id": a.id, "workspace_id": a.workspace_id, "workflow": a.workflow, "title": a.title, "summary": a.summary,
            "content": jload(a.content_json, {}), "markdown": a.markdown, "structured": a.structured, "provider": a.provider,
            "parent_analysis_id": a.parent_analysis_id, "approved": a.approved, "created_at": iso(a.created_at),
            "sources": [source_dict(s) for s in a.sources]}


def review_dict(r: Review) -> dict:
    return {"id": r.id, "workspace_id": r.workspace_id, "target_type": r.target_type, "target_id": r.target_id,
            "target_version": r.target_version, "content": jload(r.content_json, {}), "markdown": r.markdown, "provider": r.provider,
            "created_at": iso(r.created_at), "sources": [source_dict(s) for s in r.sources]}


def version_dict(v: DraftVersion) -> dict:
    return {"version": v.version_number, "subject": v.subject, "body": v.body, "note": v.note, "author": v.author,
            "provider": v.provider, "created_at": iso(v.created_at)}


def draft_dict(d: Draft, versions: bool = True) -> dict:
    cur = d.versions[-1] if d.versions else None
    out = {"id": d.id, "workspace_id": d.workspace_id, "title": d.title, "kind": d.kind, "status": d.status,
           "source_analysis_id": d.source_analysis_id, "current_version": d.current_version, "created_at": iso(d.created_at),
           "updated_at": iso(d.updated_at), "subject": cur.subject if cur else None, "body": cur.body if cur else "",
           "version_count": len(d.versions)}
    if versions:
        out["versions"] = [version_dict(v) for v in d.versions]
    return out


def run_dict(r: ModelRun) -> dict:
    return {"id": r.id, "workspace_id": r.workspace_id, "workflow": r.workflow, "steps": jload(r.steps, []), "status": r.status,
            "step_label": r.step_label, "provider": r.provider, "model": r.model, "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens, "cost_estimate": r.cost_estimate, "duration_ms": r.duration_ms, "calls": r.calls,
            "error": r.error_message, "result_type": r.result_type, "result_id": r.result_id, "message_id": r.message_id,
            "created_at": iso(r.created_at), "finished_at": iso(r.finished_at)}


def task_dict(t: Task) -> dict:
    return {"id": t.id, "workspace_id": t.workspace_id, "title": t.title, "details": t.details, "kind": t.kind, "status": t.status,
            "due_date": t.due_date, "owner": t.owner, "source": t.source, "source_excerpt": t.source_excerpt,
            "created_at": iso(t.created_at), "completed_at": iso(t.completed_at)}


def decision_dict(d: Decision) -> dict:
    return {"id": d.id, "workspace_id": d.workspace_id, "title": d.title, "context": d.context, "options": jload(d.options, []),
            "recommendation": d.recommendation, "status": d.status, "outcome": d.outcome, "rationale": d.rationale,
            "due_date": d.due_date, "source": d.source, "created_at": iso(d.created_at), "decided_at": iso(d.decided_at)}


def knowledge_dict(k: KnowledgeItem) -> dict:
    return {"id": k.id, "category": k.category, "title": k.title, "body": k.body, "tags": jload(k.tags, []),
            "provenance": k.provenance, "workspace_id": k.workspace_id, "source_ref": jload(k.source_ref, {}),
            "created_at": iso(k.created_at), "updated_at": iso(k.updated_at)}


def profile_dict(p: WritingProfile) -> dict:
    return {"id": p.id, "status": p.status, "profile": jload(p.profile_json, {}), "sample_excerpt": p.sample_excerpt,
            "provider": p.provider, "created_at": iso(p.created_at), "approved_at": iso(p.approved_at)}


def workspace_summary(w: Workspace) -> dict:
    return {"id": w.id, "title": w.title, "description": w.description, "status": w.status, "tags": jload(w.tags, []),
            "created_at": iso(w.created_at), "updated_at": iso(w.updated_at), "file_count": len(w.attachments),
            "message_count": len(w.messages)}
