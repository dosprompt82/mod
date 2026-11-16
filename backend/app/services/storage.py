"""Upload validation and storage. Types are detected from content (magic bytes), not the filename."""
from __future__ import annotations

import hashlib
import io
import zipfile
from dataclasses import dataclass

from ..config import settings
from ..models import new_id
from ..security import safe_join


class UploadError(ValueError):
    pass


@dataclass
class DetectedType:
    kind: str  # pdf|docx|txt|md|image
    mime: str
    ext: str


EXT_KIND = {"pdf": "pdf", "docx": "docx", "txt": "txt", "md": "md", "markdown": "md", "png": "image", "jpg": "image", "jpeg": "image", "webp": "image"}
SUPPORTED_LABEL = "PDF, DOCX, TXT, MD, PNG, JPG, JPEG or WEBP"


def detect_type(data: bytes, filename: str) -> DetectedType:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    head = data[:16]
    if head.startswith(b"%PDF-"):
        return DetectedType("pdf", "application/pdf", "pdf")
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return DetectedType("image", "image/png", "png")
    if head.startswith(b"\xff\xd8\xff"):
        return DetectedType("image", "image/jpeg", "jpg")
    if head[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return DetectedType("image", "image/webp", "webp")
    if head.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = set(z.namelist())
        except zipfile.BadZipFile as e:
            raise UploadError("The file looks like a damaged archive.") from e
        if "word/document.xml" in names:
            return DetectedType("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx")
        raise UploadError(f"This archive is not a Word document. Supported types: {SUPPORTED_LABEL}.")
    if ext in ("txt", "md", "markdown"):
        if b"\x00" in data[:8192]:
            raise UploadError("This file has a text extension but contains binary data.")
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            try:
                data.decode("cp1252")
            except UnicodeDecodeError as e:
                raise UploadError("Text file is not valid UTF-8 or Windows-1252 text.") from e
        kind = "md" if ext in ("md", "markdown") else "txt"
        return DetectedType(kind, "text/markdown" if kind == "md" else "text/plain", kind)
    if ext in EXT_KIND:
        raise UploadError(f"The file's contents don't match its .{ext} extension.")
    raise UploadError(f"Unsupported file type{f' (.{ext})' if ext else ''}. Supported types: {SUPPORTED_LABEL}.")


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def store_bytes(data: bytes, ext: str) -> str:
    """Write under a generated name; the original filename is metadata only."""
    settings.ensure_dirs()
    stored = f"{new_id()}.{ext}"
    path = safe_join(settings.files_dir, stored)
    path.write_bytes(data)
    return stored


def stored_path(stored_name: str):
    return safe_join(settings.files_dir, stored_name)
