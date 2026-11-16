"""Bounded context assembly. Sources are labelled (S1, IMG1, K1, R1) so that citations in model output
can be verified against stored text afterwards. Untrusted content is wrapped in tags (see prompts.BASE)."""
from __future__ import annotations

import base64
import io
import re
from dataclasses import dataclass, field
from datetime import date
from html import escape

from sqlalchemy.orm import Session

from ..models import Analysis, Attachment, DocumentChunk, Draft, KnowledgeItem, Message, Review, Workspace, jload
from ..services import search
from ..services.prefs import get_pref
from ..services.storage import stored_path
from .provider import ImagePart

TEXT_BUDGET = 120_000  # characters of source text per request (~35 pages)
PRIMARY_DOC_CHARS = 70_000  # documents up to ~20 pages are always sent in full
PRIMARY_TOTAL = 90_000  # ...as long as together they leave room for reference excerpts
# A document review must see the whole document (memos can run 30+ pages) plus room for guidance.
BUDGETS = {"doc_review": (230_000, 170_000, 180_000)}


def budgets(workflow: str) -> tuple[int, int, int]:
    return BUDGETS.get(workflow, (TEXT_BUDGET, PRIMARY_DOC_CHARS, PRIMARY_TOTAL))
MAX_IMAGES = 12
MAX_PDF_VISION_PAGES = 8
IMAGE_MAX_EDGE = 1568
TILE_HEIGHT = 1400
TILE_OVERLAP = 80


@dataclass
class Context:
    parts: list = field(default_factory=list)
    chunk_labels: dict[str, int] = field(default_factory=dict)
    image_labels: dict[str, tuple[str, int | None]] = field(default_factory=dict)  # label -> (attachment id, page)
    knowledge_labels: dict[str, str] = field(default_factory=dict)
    record_labels: dict[str, tuple[str, str]] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    mock_sources: list[dict] = field(default_factory=list)  # label/text/filename, for the offline mock only
    selection: dict | None = None  # what was sent in full vs excerpted when documents exceed the budget

    @property
    def source_chars(self) -> int:
        return sum(len(p) for p in self.parts if isinstance(p, str))

    @property
    def images(self) -> list[ImagePart]:
        return [p for p in self.parts if isinstance(p, ImagePart)]


def _attr(v) -> str:
    return escape(str(v), quote=True)


def _image_parts(data: bytes, label: str) -> list[ImagePart]:
    """Normalise an image for the API: tall screenshots are split into overlapping tiles so text stays
    legible after the API's own downscaling; very large images are reduced."""
    from PIL import Image

    out: list[ImagePart] = []
    with Image.open(io.BytesIO(data)) as im:
        im = im.convert("RGB") if im.mode not in ("RGB", "L") else im
        w, h = im.size
        tiles = []
        if h > 1.6 * w and h > IMAGE_MAX_EDGE:
            top, n = 0, 0
            while top < h and n < 6:
                tiles.append(im.crop((0, top, w, min(h, top + TILE_HEIGHT))))
                top += TILE_HEIGHT - TILE_OVERLAP
                n += 1
        else:
            tiles = [im]
        for i, t in enumerate(tiles, start=1):
            if max(t.size) > IMAGE_MAX_EDGE * 1.3:
                t = t.copy()
                t.thumbnail((IMAGE_MAX_EDGE * 1.3, IMAGE_MAX_EDGE * 1.3))
            buf = io.BytesIO()
            t.save(buf, format="PNG", optimize=True)
            if buf.tell() > 3_500_000:
                buf = io.BytesIO()
                t.save(buf, format="JPEG", quality=85)
                media = "image/jpeg"
            else:
                media = "image/png"
            part_label = label if len(tiles) == 1 else f"{label} (part {i} of {len(tiles)}, parts overlap slightly)"
            out.append(ImagePart(media, base64.b64encode(buf.getvalue()).decode(), part_label))
    return out


def _pdf_page_png(data: bytes, page_number: int) -> bytes:
    import pymupdf

    with pymupdf.open(stream=data, filetype="pdf") as doc:
        return doc[page_number - 1].get_pixmap(dpi=144).tobytes("png")


def _documents_block(atts: list[Attachment], selected: list, reference_ids: set[str]) -> str:
    """A factual inventory of the files: type, length, what was sent, Word comments and tracked changes."""
    sent: dict[str, int] = {}
    for c, a in selected:
        sent[a.id] = sent.get(a.id, 0) + 1
    lines = []
    for a in atts:
        bits = [a.kind.upper()]
        if a.page_count:
            bits.append(f"{a.page_count} pages" + (" (as last saved by Word)" if a.kind == "docx" else ""))
        if a.status == "failed":
            bits.append("could not be read")
        elif a.kind == "image":
            bits.append("image, sent for the model to read")
        elif a.id in reference_ids:
            bits.append(f"too long to send in full; {sent.get(a.id, 0)} relevant passages sent as reference excerpts")
        elif a.id in sent:
            bits.append("sent in full")
        if a.kind == "docx":
            m = jload(a.doc_meta, {})
            n_c, n_i, n_d = m.get("comments", 0), m.get("tracked_insertions", 0), m.get("tracked_deletions", 0)
            bits.append(f"{n_c} Word comment{'s' if n_c != 1 else ''}" + (f" (by {', '.join(m.get('comment_authors', []))})" if n_c else ""))
            bits.append("no tracked changes" if not (n_i or n_d) else f"tracked changes: {n_i} insertion(s), {n_d} deletion(s); text shown with changes accepted")
        lines.append(f"- {a.original_filename}: " + "; ".join(bits))
    return "<documents>\n" + "\n".join(lines) + "\n</documents>"


def _source_block(label: str, ch: DocumentChunk, att: Attachment, reference: bool = False) -> str:
    origin = {"vision": "AI transcription of an image (may contain errors)", "comments": "Word comment in the document"}.get(ch.text_source, "extracted text")
    attrs = f'label="{label}" document="{_attr(att.original_filename)}"'
    if reference:
        attrs += ' role="reference excerpt"'
    if ch.page_number:
        attrs += f' page="{ch.page_number}"'
    if ch.section:
        attrs += f' section="{_attr(ch.section)}"'
    return f"<source {attrs} origin=\"{origin}\">\n{ch.text}\n</source>"


def topic_terms(text: str, n: int = 30) -> list[str]:
    """The most frequent meaningful words of a document: used to find the passages of large reference
    documents (e.g. accounting guides) that relate to what the primary document is about."""
    counts: dict[str, int] = {}
    for w in re.findall(r"[A-Za-z][A-Za-z-]{3,}", text.lower()):
        if w not in search.STOPWORDS and w not in _GENERIC:
            counts[w] = counts.get(w, 0) + 1
    return [w for w, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:n]]


_GENERIC = set("""shall will would should could also such than then this that these those which with from have been being into upon under
within without other others between including include includes included based following page pages section sections paragraph example
however therefore because whether where there their they them were when what more most less only same each both above below year years
company entity date note notes table total amount amounts""".split())


def _select_within_budget(db: Session, ws: Workspace, atts: list[Attachment], chunks: list, instruction: str, ctx: "Context",
                          workflow: str = "document"):
    """When everything doesn't fit: send the shorter documents (the memo, letter or agreement being worked on)
    in full, then fill the rest with the passages of the long documents that best match the request and the
    topics of the documents sent in full."""
    budget_total, primary_doc, primary_total = budgets(workflow)
    sizes = {a.id: sum(len(c.text) for c in a.chunks) for a in atts}
    primary: list[Attachment] = []
    used = 0
    for a in sorted(atts, key=lambda a: sizes[a.id]):
        if sizes[a.id] <= primary_doc and used + sizes[a.id] <= primary_total:
            primary.append(a)
            used += sizes[a.id]
    primary_ids = {a.id for a in primary}
    keep = {c.id for a in primary for c in a.chunks}
    references = [a for a in atts if a.id not in primary_ids]
    primary_text = " ".join(c.text for a in primary for c in a.chunks)
    query = f"{instruction} {' '.join(topic_terms(primary_text))}" if primary_text else instruction
    ranked = [int(r["ref_id"]) for r in search.search(db, query, kinds=["chunk"], workspace_id=ws.id, limit=800, match="any")]
    ref_chunk_ids = {c.id for a in references for c in a.chunks}
    by_id = {c.id: c for c, _ in chunks}
    budget = used
    for cid in ranked:
        c = by_id.get(cid)
        if c is None or cid not in ref_chunk_ids or cid in keep:
            continue
        if budget + len(c.text) > budget_total:
            continue
        keep.add(cid)
        budget += len(c.text)
    if not ranked and not primary:  # no keyword matches at all: fall back to the opening of each document
        for a in atts:
            for c in a.chunks[:3]:
                if budget + len(c.text) <= budget_total:
                    keep.add(c.id)
                    budget += len(c.text)
    selected = [ca for ca in chunks if ca[0].id in keep]
    n_ref = sum(1 for c, a in selected if a.id not in primary_ids)
    if primary:
        ctx.notes.append("Sent in full: " + ", ".join(a.original_filename for a in primary) + ".")
    if references:
        ctx.notes.append(f"Too long to send in full, so the {n_ref} most relevant passages were selected from: "
                         + ", ".join(a.original_filename for a in references) + " (marked role=\"reference excerpt\").")
    ctx.selection = {"full": [a.original_filename for a in primary], "excerpted": [a.original_filename for a in references],
                     "passages": n_ref, "chars": budget}
    return selected, {a.id for a in references}


def build(db: Session, ws: Workspace | None, workflow: str, instruction: str, focus_ids: list[str],
          prior_work: str | None = None, draft_text: str | None = None, include_images: bool = True,
          extra_sources: list[DocumentChunk] | None = None, records: str | None = None) -> Context:
    ctx = Context()
    parts: list = []

    # ---- documents ---------------------------------------------------------------------
    atts: list[Attachment] = []
    if ws is not None:
        atts = [a for a in ws.attachments if a.status in ("ready", "needs_vision")]
        atts.sort(key=lambda a: (a.id not in focus_ids, a.created_at))
    chunks: list[tuple[DocumentChunk, Attachment]] = [(c, a) for a in atts for c in a.chunks]
    if extra_sources:
        att_by_id = {c.attachment_id: db.get(Attachment, c.attachment_id) for c in extra_sources}
        chunks += [(c, att_by_id[c.attachment_id]) for c in extra_sources if att_by_id.get(c.attachment_id)]
    total = sum(len(c.text) for c, _ in chunks)
    selected = chunks
    reference_ids: set[str] = set()
    if total > budgets(workflow)[0] and ws is not None:
        selected, reference_ids = _select_within_budget(db, ws, atts, chunks, instruction, ctx, workflow)
    if ws is not None and ws.attachments:
        parts.append(_documents_block(ws.attachments, selected, reference_ids))
    for i, (c, a) in enumerate(selected, start=1):
        label = f"S{i}"
        ctx.chunk_labels[label] = c.id
        parts.append(_source_block(label, c, a, reference=a.id in reference_ids))
        ctx.mock_sources.append({"label": label, "text": c.text, "filename": a.original_filename})

    # ---- images (screenshots and image-only PDF pages) ------------------------------------
    if include_images:
        n = 0
        for a in atts:
            if n >= MAX_IMAGES:
                ctx.notes.append("Some images were not sent because of the per-request image limit.")
                break
            has_transcript = any(c.text_source == "vision" for c in a.chunks)
            # Re-send an image only if it is part of this request or hasn't been transcribed yet.
            if has_transcript and a.id not in focus_ids:
                continue
            data = None
            if a.kind == "image":
                data = stored_path(a.stored_name).read_bytes()
                n += 1
                label = f"IMG{n}"
                ctx.image_labels[label] = (a.id, None)
                parts.extend(_image_parts(data, f"{label}: {a.original_filename}"))
            elif a.kind == "pdf":
                vision_pages = [p.page_number for p in a.pages if p.needs_vision and p.text_source == "extracted"][:MAX_PDF_VISION_PAGES]
                if vision_pages:
                    data = stored_path(a.stored_name).read_bytes()
                for pno in vision_pages:
                    if n >= MAX_IMAGES:
                        break
                    n += 1
                    label = f"IMG{n}"
                    ctx.image_labels[label] = (a.id, pno)
                    parts.extend(_image_parts(_pdf_page_png(data, pno), f"{label}: {a.original_filename}, page {pno} (image-only page)"))

    # ---- saved knowledge (bounded) --------------------------------------------------------
    if workflow in ("doc_review", "document", "reasoning", "email", "memo", "writing", "knowledge") and instruction.strip():
        limit = 8 if workflow == "knowledge" else 4
        hits = search.search(db, instruction, kinds=["knowledge"], limit=limit, match="any")
        for i, h in enumerate(hits, start=1):
            k = db.get(KnowledgeItem, h["ref_id"])
            if not k:
                continue
            label = f"K{i}"
            ctx.knowledge_labels[label] = k.id
            parts.append(f'<knowledge label="{label}" category="{k.category}" provenance="{k.provenance}" title="{_attr(k.title)}">\n{k.body[:4000]}\n</knowledge>')
            ctx.mock_sources.append({"label": label, "text": k.body, "filename": k.title})

    if records:
        parts.append(f"<records>\n{records}\n</records>")
    if prior_work:
        parts.append(f"<prior_work>\n{prior_work}\n</prior_work>")
    if draft_text is not None:
        parts.append(f"<draft>\n{draft_text}\n</draft>")

    # ---- conversation, preferences and the request ------------------------------------------
    if ws is not None:
        history = [m for m in ws.messages][-7:-1]
        if history:
            lines = []
            for m in history:
                who = "User" if m.role == "user" else "Assistant"
                lines.append(f"{who}: {m.content[:1200]}")
            parts.append("<conversation_so_far>\n" + "\n".join(lines) + "\n</conversation_so_far>")
    prefs = f"Preferred tone: {get_pref(db, 'tone')}. Preferred length: {get_pref(db, 'length')}."
    profile = None
    if get_pref(db, "use_writing_profile"):
        from ..models import WritingProfile

        wp = db.query(WritingProfile).filter_by(status="approved").order_by(WritingProfile.approved_at.desc()).first()
        if wp:
            profile = jload(wp.profile_json, {})
    pref_block = f"User preferences: {prefs}"
    if profile and workflow in ("email", "memo", "writing", "rewrite"):
        pref_block += "\nUser's approved writing profile (apply it to drafts):\n" + "\n".join(f"- {k}: {v}" for k, v in profile.items() if v)
    if ctx.notes:
        pref_block += "\nContext notes: " + " ".join(ctx.notes)
    parts.append(pref_block)
    parts.append(f"Today's date: {date.today().isoformat()}\n<request>\n{instruction.strip()}\n</request>")
    ctx.parts = parts
    return ctx


def prior_work_for(db: Session, ws: Workspace | None, analysis: Analysis | None = None, review: Review | None = None,
                   draft_body: str | None = None, max_chars: int = 16_000) -> str | None:
    blocks = []
    if analysis is not None:
        blocks.append(f"[Analysis: {analysis.title}]\n{analysis.markdown}")
    if review is not None:
        blocks.append(f"[Critical review]\n{review.markdown}")
    if draft_body is not None:
        blocks.append(f"[Draft]\n{draft_body}")
    if not blocks and ws is not None:
        last = db.query(Analysis).filter_by(workspace_id=ws.id).order_by(Analysis.created_at.desc()).first()
        if last:
            blocks.append(f"[Most recent analysis in this workspace: {last.title}]\n{last.markdown}")
    text = "\n\n".join(blocks)
    return text[:max_chars] if text else None


def latest_draft(db: Session, ws: Workspace) -> Draft | None:
    return db.query(Draft).filter_by(workspace_id=ws.id).order_by(Draft.updated_at.desc()).first()


def last_user_messages(db: Session, ws: Workspace, n: int = 5) -> list[Message]:
    return [m for m in ws.messages if m.role == "user"][-n:]
