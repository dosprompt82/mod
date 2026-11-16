"""Text extraction. PDF text by page (image-only pages flagged for vision), DOCX paragraphs/tables with
heading structure, plain text/markdown, and image metadata. Results are chunked for evidence and search."""
from __future__ import annotations

import io
import json
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


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _w_text(el) -> str:
    """Text of a Word element as it reads with tracked changes accepted: includes insertions, hyperlinks and
    fields (w:t) and excludes deletions (w:delText). python-docx's paragraph.text drops tracked insertions."""
    out = []
    for node in el.iter():
        if node.tag == W + "t":
            out.append(node.text or "")
        elif node.tag == W + "tab":
            out.append("\t")
        elif node.tag in (W + "br", W + "cr"):
            out.append("\n")
    return "".join(out)


def _extract_docx(data: bytes) -> tuple[list[Block], dict, list[Block]]:
    import zipfile

    import docx
    from docx.text.paragraph import Paragraph
    from lxml import etree

    d = docx.Document(io.BytesIO(data))
    body = d.element.body
    blocks: list[Block] = []
    section: str | None = None
    anchors: dict[str, str] = {}
    for el in body.iterchildren():
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = _w_text(el).strip()
            for ref in list(el.iter(W + "commentReference")) + list(el.iter(W + "commentRangeStart")):
                anchors.setdefault(ref.get(W + "id"), text[:200])
            if not text:
                continue
            p = Paragraph(el, d)
            style = (p.style.name if p.style is not None else "") or ""
            if style.lower().startswith(("heading", "title")):
                section = text[:300]
                blocks.append(Block(text, None, section))
            elif style.lower().startswith("list"):
                blocks.append(Block(f"• {text}", None, section))
            else:
                blocks.append(Block(text, None, section))
        elif tag == "tbl":
            rows = []
            for tr in el.iter(W + "tr"):
                cells = [" ".join(_w_text(p).strip() for p in tc.iter(W + "p")).strip() for tc in tr.findall(W + "tc")]
                if any(cells):
                    rows.append(" | ".join(cells))
            for ref in list(el.iter(W + "commentReference")) + list(el.iter(W + "commentRangeStart")):
                anchors.setdefault(ref.get(W + "id"), "(in a table)")
            if rows:
                blocks.append(Block("\n".join(rows), None, section))

    meta: dict = {"comments": 0, "comment_authors": [], "tracked_insertions": 0, "tracked_deletions": 0,
                  "tracked_change_authors": [], "pages_as_saved": None}
    ins = list(body.iter(W + "ins"))
    dels = list(body.iter(W + "del"))
    meta["tracked_insertions"], meta["tracked_deletions"] = len(ins), len(dels)
    meta["tracked_change_authors"] = sorted({e.get(W + "author") for e in ins + dels if e.get(W + "author")})
    comment_blocks: list[Block] = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = set(z.namelist())
        if "docProps/app.xml" in names:
            m = re.search(rb"<Pages>(\d+)</Pages>", z.read("docProps/app.xml"))
            if m:
                meta["pages_as_saved"] = int(m.group(1))
        if "word/comments.xml" in names:
            root = etree.fromstring(z.read("word/comments.xml"))
            authors = set()
            for c in root.iter(W + "comment"):
                ctext = "\n".join(_w_text(p).strip() for p in c.iter(W + "p")).strip()
                if not ctext:
                    continue
                author = c.get(W + "author") or "Unknown"
                authors.add(author)
                date = (c.get(W + "date") or "")[:10]
                on = anchors.get(c.get(W + "id"))
                comment_blocks.append(Block(f"Comment by {author}{f' ({date})' if date else ''}: {ctext}"
                                            + (f"\n[On: “{on}”]" if on else ""), None, "Word comments"))
            meta["comments"], meta["comment_authors"] = len(comment_blocks), sorted(authors)
    return blocks, meta, comment_blocks


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
        comment_blocks: list[Block] = []
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
            blocks, meta, comment_blocks = _extract_docx(data)
            text = "\n\n".join(b.text for b in blocks)
            db.add(DocumentPage(attachment_id=att.id, page_number=None, text=text))
            if not blocks:
                raise ValueError("The Word document contains no text.")
            att.doc_meta = json.dumps(meta)
            att.page_count = meta.get("pages_as_saved")
            if comment_blocks:
                db.add(DocumentPage(attachment_id=att.id, page_number=None, text="\n\n".join(b.text for b in comment_blocks), text_source="comments"))
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
        if att.kind == "docx" and comment_blocks:
            save_chunks(db, att, comment_blocks, text_source="comments")
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
            search.index(db, "chunk", str(ch.id), att.workspace_id, "ai_interpretation" if text_source == "vision" else "source_document",
                         att.original_filename, b.text, f"doctype:{att.kind}", att.created_at, replace=False)
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
        search.index(db, "chunk", str(c.id), att.workspace_id, "ai_interpretation" if c.text_source == "vision" else "source_document",
                     att.original_filename, c.text, f"doctype:{att.kind}", att.created_at, replace=False)
