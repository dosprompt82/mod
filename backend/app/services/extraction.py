"""Text extraction. PDF text by page (image-only pages flagged for vision), DOCX paragraphs/tables with
heading structure, plain text/markdown, and image metadata. Results are chunked for evidence and search."""
from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from ..models import Attachment, DocumentChunk, DocumentPage
from . import search
from .storage import stored_path

log = logging.getLogger(__name__)

CHUNK_CHARS = 1400
MIN_PAGE_TEXT = 25  # fewer characters than this on a page with images => image-only page

_HEADING_RE = re.compile(
    r"^(?:(?:article|section|schedule|exhibit|part)\s+[\dIVXLC]+[.:]?(?:\s.*)?|\d{1,2}(?:\.\d{1,2}){0,2}\.?\s+[A-Z][^.]{2,80}|[A-Z][A-Z0-9 ,&'()/-]{3,70})$",
    re.IGNORECASE,
)


@dataclass
class Block:
    text: str
    page: int | None
    section: str | None


def _looks_like_heading(line: str) -> bool:
    line = line.strip()
    if not (3 <= len(line) <= 90) or line.endswith((",", ";")):
        return False
    if line.isupper() and any(c.isalpha() for c in line):
        return True
    return bool(_HEADING_RE.match(line)) and len(line.split()) <= 12 and not line.endswith(".")


def _blocks_from_text(text: str, page: int | None, section: str | None, markdown: bool = False) -> tuple[list[Block], str | None]:
    blocks: list[Block] = []
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        first = para.splitlines()[0].strip()
        if markdown and first.startswith("#"):
            section = first.lstrip("#").strip()[:300] or section
        elif not markdown and _looks_like_heading(first):
            section = first[:300]
        blocks.append(Block(para, page, section))
    return blocks, section


def _chunk(blocks: list[Block]) -> list[Block]:
    chunks: list[Block] = []
    cur: list[str] = []
    cur_page = cur_section = None
    size = 0

    def flush():
        nonlocal cur, size
        if cur:
            chunks.append(Block("\n\n".join(cur), cur_page, cur_section))
        cur, size = [], 0

    for b in blocks:
        if cur and (b.page != cur_page or b.section != cur_section or size + len(b.text) > CHUNK_CHARS):
            flush()
        if not cur:
            cur_page, cur_section = b.page, b.section
        # Very long paragraphs are split on sentence boundaries.
        if len(b.text) > CHUNK_CHARS:
            parts = re.split(r"(?<=[.!?])\s+", b.text)
            piece = ""
            for s in parts:
                if piece and len(piece) + len(s) > CHUNK_CHARS:
                    cur.append(piece)
                    flush()
                    cur_page, cur_section = b.page, b.section
                    piece = ""
                piece = f"{piece} {s}".strip()
            if piece:
                cur.append(piece)
                size += len(piece)
            continue
        cur.append(b.text)
        size += len(b.text)
    flush()
    return chunks


def _extract_pdf(data: bytes) -> tuple[list[tuple[int, str, bool]], int]:
    import pymupdf

    pages: list[tuple[int, str, bool]] = []
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        if doc.needs_pass:
            raise ValueError("This PDF is password-protected.")
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text").replace("\x00", "")
            has_images = bool(page.get_images(full=False))
            needs_vision = len(text.strip()) < MIN_PAGE_TEXT and (has_images or not text.strip())
            pages.append((i, text, needs_vision))
        return pages, doc.page_count


def _extract_docx(data: bytes) -> list[Block]:
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    d = docx.Document(io.BytesIO(data))
    blocks: list[Block] = []
    section: str | None = None
    for el in d.element.body.iterchildren():
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(el, d)
            text = p.text.strip()
            if not text:
                continue
            style = (p.style.name if p.style is not None else "") or ""
            if style.lower().startswith(("heading", "title")):
                section = text[:300]
                blocks.append(Block(text, None, section))
            elif style.lower().startswith("list"):
                blocks.append(Block(f"• {text}", None, section))
            else:
                blocks.append(Block(text, None, section))
        elif tag == "tbl":
            t = Table(el, d)
            rows = []
            for row in t.rows:
                cells = []
                for c in row.cells:
                    v = c.text.strip().replace("\n", " ")
                    if not cells or cells[-1] != v:  # merged cells repeat
                        cells.append(v)
                rows.append(" | ".join(cells))
            if rows:
                blocks.append(Block("\n".join(rows), None, section))
    # Merge consecutive short list items into one block so chunks stay readable.
    return blocks


def _decode_text(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252")


def extract(db: Session, att: Attachment) -> None:
    """Populate pages and chunks for an attachment and index them. Sets status honestly."""
    att.status = "extracting"
    att.error = None
    db.commit()
    try:
        data = stored_path(att.stored_name).read_bytes()
        for p in list(att.pages):
            db.delete(p)
        for c in list(att.chunks):
            db.delete(c)
        db.flush()
        blocks: list[Block] = []
        if att.kind == "pdf":
            pages, count = _extract_pdf(data)
            att.page_count = count
            section = None
            vision_pages = 0
            for num, text, needs_vision in pages:
                db.add(DocumentPage(attachment_id=att.id, page_number=num, text=text, needs_vision=needs_vision))
                vision_pages += needs_vision
                if text.strip():
                    bs, section = _blocks_from_text(text, num, section)
                    blocks.extend(bs)
            if not blocks and vision_pages:
                att.status = "needs_vision"
            elif not blocks:
                raise ValueError("No text could be extracted from this PDF.")
            else:
                att.status = "ready"
        elif att.kind == "docx":
            blocks = _extract_docx(data)
            text = "\n\n".join(b.text for b in blocks)
            db.add(DocumentPage(attachment_id=att.id, page_number=None, text=text))
            if not blocks:
                raise ValueError("The Word document contains no text.")
            att.status = "ready"
        elif att.kind in ("txt", "md"):
            text = _decode_text(data)
            db.add(DocumentPage(attachment_id=att.id, page_number=None, text=text))
            blocks, _ = _blocks_from_text(text, None, None, markdown=att.kind == "md")
            if not blocks:
                raise ValueError("The file is empty.")
            att.status = "ready"
        elif att.kind == "image":
            from PIL import Image

            with Image.open(io.BytesIO(data)) as im:
                im.verify()
            with Image.open(io.BytesIO(data)) as im:
                att.width, att.height = im.size
            att.page_count = 1
            # Images have no machine-readable text until the vision model transcribes them.
            att.status = "needs_vision"
        else:
            raise ValueError(f"Unsupported kind {att.kind}")

        save_chunks(db, att, _chunk(blocks), text_source="extracted")
        db.commit()
    except Exception as e:  # noqa: BLE001 - report any extraction failure to the user honestly
        db.rollback()
        log.warning("extraction failed for %s: %s", att.id, type(e).__name__)
        att = db.get(Attachment, att.id)
        if att is not None:
            att.status = "failed"
            msg = str(e) if isinstance(e, ValueError) else "The file could not be read. It may be damaged or in an unsupported variant."
            att.error = msg[:500]
            db.commit()


def save_chunks(db: Session, att: Attachment, chunks: list[Block], text_source: str) -> None:
    start = max((c.ordinal for c in att.chunks), default=-1) + 1
    total = att.text_chars or 0
    for i, b in enumerate(chunks):
        ch = DocumentChunk(attachment_id=att.id, ordinal=start + i, page_number=b.page, section=b.section, text=b.text, text_source=text_source)
        db.add(ch)
        db.flush()
        total += len(b.text)
        if att.workspace_id:
            search.index(db, "chunk", str(ch.id), att.workspace_id, "source_document" if text_source == "extracted" else "ai_interpretation",
                         att.original_filename, b.text, f"doctype:{att.kind}", att.created_at)
    att.text_chars = total


def add_vision_transcription(db: Session, att: Attachment, text: str, page_number: int | None = None) -> None:
    """Store an AI vision transcription of an image (or image-only PDF page) as clearly-labelled text."""
    text = (text or "").strip()
    if not text:
        return
    page_no = page_number if att.kind == "pdf" else None
    existing = next((p for p in att.pages if p.page_number == page_no and p.text_source == "vision"), None)
    if existing:
        return  # keep the first transcription; avoids duplicate chunks on follow-ups
    db.add(DocumentPage(attachment_id=att.id, page_number=page_no, text=text, text_source="vision"))
    blocks, _ = _blocks_from_text(text, page_no, None)
    save_chunks(db, att, _chunk(blocks), text_source="vision")
    if att.status == "needs_vision":
        att.status = "ready"


def index_attachment_chunks(db: Session, att: Attachment) -> None:
    """(Re)index chunks once a staged attachment joins a workspace."""
    search.remove_many(db, "chunk", [str(c.id) for c in att.chunks])
    for c in att.chunks:
        search.index(db, "chunk", str(c.id), att.workspace_id, "source_document" if c.text_source == "extracted" else "ai_interpretation",
                     att.original_filename, c.text, f"doctype:{att.kind}", att.created_at)
