"""Uploads, previews and extracted text."""
from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Attachment, Workspace
from ..security import sanitize_filename
from ..services import search
from ..services.audit import audit
from ..services.jobs import submit_extraction
from ..services.storage import UploadError, checksum, detect_type, store_bytes, stored_path
from .common import attachment_dict, err

router = APIRouter()


async def _read_limited(f: UploadFile, limit: int) -> bytes | None:
    chunks, size = [], 0
    while True:
        part = await f.read(1024 * 1024)
        if not part:
            break
        size += len(part)
        if size > limit:
            return None
        chunks.append(part)
    return b"".join(chunks)


@router.post("/attachments", status_code=201)
async def upload(request: Request, files: list[UploadFile] = File(...), workspace_id: str | None = Form(None), db: Session = Depends(get_db)):
    if len(files) > settings.max_files_per_request:
        raise err(400, f"Upload at most {settings.max_files_per_request} files at a time.", "too_many_files")
    if workspace_id and db.get(Workspace, workspace_id) is None:
        raise err(404, "Workspace not found.", "not_found")
    limit_mb = settings.max_upload_bytes // (1024 * 1024)
    created: list[Attachment] = []
    errors: list[dict] = []
    for f in files:
        name = sanitize_filename(f.filename or "", default="pasted-image")
        data = await _read_limited(f, settings.max_upload_bytes)
        if data is None:
            errors.append({"filename": name, "message": f"'{name}' is larger than the {limit_mb} MB limit."})
            continue
        if not data:
            errors.append({"filename": name, "message": f"'{name}' is empty."})
            continue
        try:
            dt = detect_type(data, name)
        except UploadError as e:
            errors.append({"filename": name, "message": f"'{name}': {e}"})
            continue
        if "." not in name or name.rsplit(".", 1)[-1].lower() not in ("pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg", "webp"):
            name = f"{name}.{dt.ext}"  # e.g. clipboard images without an extension
        cs = checksum(data)
        dup = db.query(Attachment).filter_by(checksum_sha256=cs).order_by(Attachment.created_at).first()
        att = Attachment(workspace_id=workspace_id, original_filename=name, stored_name=store_bytes(data, dt.ext), kind=dt.kind,
                         mime_type=dt.mime, size_bytes=len(data), checksum_sha256=cs, duplicate_of=dup.id if dup else None, status="uploaded")
        db.add(att)
        db.flush()
        audit(db, "file_uploaded", "attachment", att.id, kind=dt.kind, size=len(data))
        created.append(att)
    if not created:
        db.rollback()
        raise err(400, " ".join(e["message"] for e in errors) or "No files were received.", "upload_rejected")
    db.commit()
    for a in created:
        submit_extraction(a.id)
    return {"attachments": [attachment_dict(a) for a in created], "errors": errors}


def _get(db: Session, att_id: str) -> Attachment:
    a = db.get(Attachment, att_id)
    if a is None:
        raise err(404, "File not found.", "not_found")
    return a


@router.get("/attachments/{att_id}")
def get_attachment(att_id: str, db: Session = Depends(get_db)):
    return attachment_dict(_get(db, att_id))


@router.get("/attachments/{att_id}/text")
def attachment_text(att_id: str, db: Session = Depends(get_db)):
    a = _get(db, att_id)
    return {"attachment": attachment_dict(a),
            "pages": [{"page": p.page_number, "text": p.text, "text_source": p.text_source, "needs_vision": p.needs_vision} for p in a.pages],
            "chunks": [{"id": c.id, "page": c.page_number, "section": c.section, "text": c.text, "text_source": c.text_source} for c in a.chunks]}


@router.get("/attachments/{att_id}/content")
def attachment_content(att_id: str, download: bool = False, db: Session = Depends(get_db)):
    """Serves an uploaded file by its id only (never by path). Office files are always downloaded."""
    a = _get(db, att_id)
    path = stored_path(a.stored_name)
    if not path.exists():
        raise err(404, "The stored file is missing.", "missing_file")
    inline = not download and a.kind in ("image", "pdf", "txt", "md")
    ascii_name = a.original_filename.encode("ascii", "ignore").decode().replace('"', "") or "file"
    disp = f"{'inline' if inline else 'attachment'}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(a.original_filename)}"
    mime = "text/plain; charset=utf-8" if a.kind in ("txt", "md") else a.mime_type
    return FileResponse(path, media_type=mime, headers={
        "Content-Disposition": disp, "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'",
        "Cache-Control": "private, max-age=3600"})


@router.post("/attachments/{att_id}/retry")
def retry_extraction(att_id: str, db: Session = Depends(get_db)):
    a = _get(db, att_id)
    a.status, a.error = "uploaded", None
    db.commit()
    submit_extraction(a.id)
    return attachment_dict(a)


@router.delete("/attachments/{att_id}")
def delete_attachment(att_id: str, db: Session = Depends(get_db)):
    """User-initiated removal of an uploaded file (and its extracted text)."""
    a = _get(db, att_id)
    search.remove_many(db, "chunk", [str(c.id) for c in a.chunks])
    name = a.stored_name
    db.delete(a)
    audit(db, "file_deleted", "attachment", att_id)
    db.commit()
    try:
        stored_path(name).unlink(missing_ok=True)
    except OSError:
        pass
    return {"deleted": att_id}
