"""Document Studio exports: DOCX (python-docx), PDF (fpdf2), Markdown and TXT, rendered from Markdown."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from ..config import APP_NAME

FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"


def today_long() -> str:
    """e.g. 'November 16, 2026', built by hand: the '-' date flag used on Linux/macOS crashes on Windows."""
    d = date.today()
    return f"{d:%B} {d.day}, {d.year}"


@dataclass
class Block:
    kind: str  # heading|para|bullet|number|quote|table|rule|lines
    text: str = ""
    level: int = 0
    rows: list[list[str]] | None = None


def parse_markdown(md: str, plain: bool = False) -> list[Block]:
    """Small line-based Markdown parser covering what the app generates."""
    lines = (md or "").replace("\r\n", "\n").split("\n")
    blocks: list[Block] = []
    para: list[str] = []

    def flush():
        if para:
            if plain:
                blocks.append(Block("lines", "\n".join(para)))
            else:
                blocks.append(Block("para", " ".join(x.strip() for x in para)))
            para.clear()

    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if plain:
            if s:
                para.append(line.rstrip())
            else:
                flush()
            i += 1
            continue
        if not s:
            flush()
        elif m := re.match(r"^(#{1,6})\s+(.*)$", s):
            flush()
            blocks.append(Block("heading", m.group(2).strip(), len(m.group(1))))
        elif re.match(r"^(-{3,}|\*{3,}|_{3,})$", s):
            flush()
            blocks.append(Block("rule"))
        elif s.startswith("|") and s.endswith("|"):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                row = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.match(r"^:?-{2,}:?$", c) for c in row if c):
                    rows.append(row)
                i += 1
            blocks.append(Block("table", rows=rows))
            continue
        elif m := re.match(r"^(\s*)[-*+]\s+(.*)$", line):
            flush()
            blocks.append(Block("bullet", m.group(2).strip(), len(m.group(1)) // 2))
        elif m := re.match(r"^(\s*)(\d+)[.)]\s+(.*)$", line):
            flush()
            blocks.append(Block("number", m.group(3).strip(), len(m.group(1)) // 2))
        elif s.startswith(">"):
            flush()
            blocks.append(Block("quote", s.lstrip("> ").strip()))
        elif line.endswith("  "):  # markdown hard line break
            para.append(line.strip())
            flush()
        else:
            para.append(line)
        i += 1
    flush()
    return blocks


_INLINE = re.compile(r"(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)]+\))")


def inline_runs(text: str) -> list[tuple[str, str]]:
    """Split text into (style, text) runs: '', 'b', 'i', 'code'."""
    out: list[tuple[str, str]] = []
    for part in _INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") or part.startswith("__") and part.endswith("__"):
            out.append(("b", part[2:-2]))
        elif (part.startswith("*") and part.endswith("*")) or (part.startswith("_") and part.endswith("_")) and len(part) > 2:
            out.append(("i", part[1:-1]))
        elif part.startswith("`") and part.endswith("`"):
            out.append(("code", part[1:-1]))
        elif m := re.match(r"^\[([^\]]+)\]\(([^)]+)\)$", part):
            out.append(("", f"{m.group(1)} ({m.group(2)})"))
        else:
            out.append(("", part))
    return out


def strip_inline(text: str) -> str:
    return "".join(t for _, t in inline_runs(text))


def number_sections(blocks: list[Block]) -> list[Block]:
    n = 0
    for b in blocks:
        if b.kind == "heading" and b.level == 2 and not re.match(r"^\d+[.)]", b.text):
            n += 1
            b.text = f"{n}. {b.text}"
    return blocks


@dataclass
class ExportDoc:
    title: str
    body: str  # Markdown, or plain text when plain=True
    plain: bool = False
    subtitle: str | None = None
    numbered: bool = False
    sources: list[str] | None = None  # rendered source reference lines
    show_date: bool = True


def to_markdown(doc: ExportDoc) -> str:
    parts = [f"# {doc.title}"]
    if doc.subtitle:
        parts.append(f"*{doc.subtitle}*")
    if doc.show_date:
        parts.append(f"*{today_long()}*")
    parts.append(doc.body.strip())
    if doc.sources:
        parts.append("## Sources\n\n" + "\n".join(f"{i}. {s}" for i, s in enumerate(doc.sources, 1)))
    return "\n\n".join(parts) + "\n"


def to_text(doc: ExportDoc) -> str:
    out = [doc.title, "=" * min(len(doc.title), 80)]
    if doc.show_date:
        out.append(today_long())
    out.append("")
    if doc.plain:
        out.append(doc.body.strip())
    else:
        counter: dict[int, int] = {}
        for b in parse_markdown(doc.body):
            if b.kind != "number":
                counter.clear() if b.kind not in ("bullet",) else None
            if b.kind == "heading":
                out += ["", strip_inline(b.text).upper() if b.level <= 2 else strip_inline(b.text), ""]
            elif b.kind == "bullet":
                out.append("  " * b.level + "- " + strip_inline(b.text))
            elif b.kind == "number":
                counter[b.level] = counter.get(b.level, 0) + 1
                out.append("  " * b.level + f"{counter[b.level]}. " + strip_inline(b.text))
            elif b.kind == "table":
                out += [" | ".join(strip_inline(c) for c in r) for r in (b.rows or [])]
            elif b.kind == "rule":
                out.append("-" * 40)
            elif b.kind == "quote":
                out.append("> " + strip_inline(b.text))
            else:
                out += [strip_inline(b.text), ""]
    if doc.sources:
        out += ["", "SOURCES", ""] + [f"{i}. {strip_inline(s)}" for i, s in enumerate(doc.sources, 1)]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"


# ---- DOCX ---------------------------------------------------------------------------------

def to_docx(doc: ExportDoc, path: Path) -> None:
    import docx
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor

    d = docx.Document()
    for section in d.sections:
        section.top_margin = section.bottom_margin = Inches(1)
        section.left_margin = section.right_margin = Inches(1.05)
    styles = d.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15
    ink = RGBColor(0x1F, 0x29, 0x37)
    for name, size in (("Title", 22), ("Heading 1", 16), ("Heading 2", 13), ("Heading 3", 11.5)):
        st = styles[name]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.bold = name != "Title"
        st.font.color.rgb = ink
        st.element.rPr.rFonts.set(qn("w:asciiTheme"), "") if st.element.rPr is not None and st.element.rPr.rFonts is not None else None
        st.paragraph_format.space_before = Pt(14 if name != "Title" else 0)
        st.paragraph_format.space_after = Pt(4 if name != "Title" else 2)

    def add_runs(p, text: str):
        for style, t in inline_runs(text):
            r = p.add_run(t)
            if style == "b":
                r.bold = True
            elif style == "i":
                r.italic = True
            elif style == "code":
                r.font.name = "Consolas"
                r.font.size = Pt(10)

    d.add_paragraph(doc.title, style="Title")
    meta = []
    if doc.subtitle:
        meta.append(doc.subtitle)
    if doc.show_date:
        meta.append(today_long())
    if meta:
        p = d.add_paragraph()
        r = p.add_run(" · ".join(meta))
        r.font.size = Pt(9.5)
        r.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
        p.paragraph_format.space_after = Pt(14)

    blocks = parse_markdown(doc.body, plain=doc.plain)
    if doc.numbered:
        blocks = number_sections(blocks)
    for b in blocks:
        if b.kind == "heading":
            d.add_paragraph(strip_inline(b.text), style=f"Heading {min(3, max(1, b.level - 1 if b.level > 1 else 1))}")
        elif b.kind == "bullet":
            p = d.add_paragraph(style="List Bullet 2" if b.level else "List Bullet")
            add_runs(p, b.text)
        elif b.kind == "number":
            p = d.add_paragraph(style="List Number 2" if b.level else "List Number")
            add_runs(p, b.text)
        elif b.kind == "quote":
            p = d.add_paragraph(style="Quote")
            add_runs(p, b.text)
        elif b.kind == "rule":
            p = d.add_paragraph()
            pPr = p._p.get_or_add_pPr()
            bdr = OxmlElement("w:pBdr")
            bottom = OxmlElement("w:bottom")
            for k, v in (("w:val", "single"), ("w:sz", "4"), ("w:space", "1"), ("w:color", "C8CCD2")):
                bottom.set(qn(k), v)
            bdr.append(bottom)
            pPr.append(bdr)
        elif b.kind == "table" and b.rows:
            cols = max(len(r) for r in b.rows)
            t = d.add_table(rows=len(b.rows), cols=cols)
            t.style = "Light Grid Accent 1"
            for ri, row in enumerate(b.rows):
                for ci in range(cols):
                    cell = t.cell(ri, ci)
                    cell.text = ""
                    add_runs(cell.paragraphs[0], row[ci] if ci < len(row) else "")
                    if ri == 0:
                        for r in cell.paragraphs[0].runs:
                            r.bold = True
            d.add_paragraph()
        elif b.kind == "lines":
            p = d.add_paragraph()
            for j, ln in enumerate(b.text.split("\n")):
                if j:
                    p.add_run().add_break()
                p.add_run(ln)
        else:
            p = d.add_paragraph()
            add_runs(p, b.text)

    if doc.sources:
        d.add_paragraph("Sources", style="Heading 1")
        for s in doc.sources:
            p = d.add_paragraph(style="List Number")
            add_runs(p, s)
            for r in p.runs:
                r.font.size = Pt(9.5)

    # Footer: app name and page number field.
    footer = d.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    fr = footer.add_run(f"{doc.title[:60]} · Page ")
    fr.font.size = Pt(8.5)
    fr.font.color.rgb = RGBColor(0x8A, 0x90, 0x99)
    run = footer.add_run()
    run.font.size = Pt(8.5)
    for tag, text in (("begin", None), (None, "PAGE"), ("end", None)):
        if tag:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), tag)
        else:
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = text
        run._r.append(el)
    d.core_properties.title = doc.title
    d.core_properties.author = ""
    d.core_properties.comments = f"Prepared with {APP_NAME}"
    d.save(str(path))


# ---- PDF ------------------------------------------------------------------------------------

def to_pdf(doc: ExportDoc, path: Path) -> None:
    from fpdf import FPDF

    title = doc.title

    class PDF(FPDF):
        def footer(self):
            self.set_y(-14)
            self.set_font(self.base_font, "", 8)
            self.set_text_color(138, 144, 153)
            self.cell(0, 8, f"{title[:70]} · Page {self.page_no()}", align="R")

    pdf = PDF(format="Letter")
    reg, bold = FONT_DIR / "DejaVuSans.ttf", FONT_DIR / "DejaVuSans-Bold.ttf"
    if reg.exists() and bold.exists():
        pdf.add_font("DejaVu", "", str(reg))
        pdf.add_font("DejaVu", "B", str(bold))
        pdf.add_font("DejaVu", "I", str(reg))
        pdf.add_font("DejaVu", "BI", str(bold))
        pdf.base_font = "DejaVu"
        clean = lambda s: s  # noqa: E731
    else:  # core font fallback: Latin-1 only
        pdf.base_font = "Helvetica"
        clean = lambda s: s.encode("latin-1", "replace").decode("latin-1")  # noqa: E731
    pdf.set_margins(24, 22, 24)
    pdf.set_auto_page_break(True, 20)
    pdf.add_page()
    f = pdf.base_font
    W = pdf.epw

    def md_inline(text: str) -> str:
        text = text.replace("--", "–")
        out = []
        for style, t in inline_runs(text):
            t = t.replace("**", "").replace("__", "")
            out.append(f"**{t}**" if style == "b" else f"__{t}__" if style == "i" else t)
        return clean("".join(out))

    pdf.set_text_color(31, 41, 55)
    pdf.set_font(f, "B", 19)
    pdf.multi_cell(W, 9, clean(title))
    meta = " · ".join(x for x in [doc.subtitle, today_long() if doc.show_date else None] if x)
    if meta:
        pdf.set_font(f, "", 9)
        pdf.set_text_color(107, 114, 128)
        pdf.multi_cell(W, 6, clean(meta))
    pdf.ln(4)
    pdf.set_text_color(31, 41, 55)
    blocks = parse_markdown(doc.body, plain=doc.plain)
    if doc.numbered:
        blocks = number_sections(blocks)
    for b in blocks:
        if b.kind == "heading":
            pdf.ln(3)
            pdf.set_font(f, "B", {1: 15, 2: 13}.get(b.level, 11.5))
            pdf.multi_cell(W, 7, clean(strip_inline(b.text)))
            pdf.ln(1)
        elif b.kind in ("bullet", "number"):
            pdf.set_font(f, "", 10.5)
            indent = 5 + 5 * b.level
            pdf.set_x(pdf.l_margin + indent)
            marker = "•" if b.kind == "bullet" else "–"
            pdf.multi_cell(W - indent, 5.6, clean(f"{marker}  ") + md_inline(b.text), markdown=True)
            pdf.ln(0.8)
        elif b.kind == "quote":
            pdf.set_font(f, "I", 10.5)
            pdf.set_x(pdf.l_margin + 6)
            pdf.multi_cell(W - 6, 5.6, md_inline(b.text), markdown=True)
            pdf.ln(2)
        elif b.kind == "rule":
            y = pdf.get_y() + 2
            pdf.set_draw_color(200, 204, 210)
            pdf.line(pdf.l_margin, y, pdf.l_margin + W, y)
            pdf.ln(5)
        elif b.kind == "table":
            pdf.set_font(f, "", 9.5)
            for ri, row in enumerate(b.rows or []):
                pdf.set_font(f, "B" if ri == 0 else "", 9.5)
                pdf.multi_cell(W, 5.4, clean("  |  ".join(strip_inline(c) for c in row)))
            pdf.ln(2)
        elif b.kind == "lines":
            pdf.set_font(f, "", 10.5)
            pdf.multi_cell(W, 5.6, clean(b.text))
            pdf.ln(2.5)
        else:
            pdf.set_font(f, "", 10.5)
            pdf.multi_cell(W, 5.6, md_inline(b.text), markdown=True)
            pdf.ln(2.5)
    if doc.sources:
        pdf.ln(3)
        pdf.set_font(f, "B", 13)
        pdf.multi_cell(W, 7, "Sources")
        pdf.set_font(f, "", 9)
        for i, s in enumerate(doc.sources, 1):
            pdf.multi_cell(W, 5, f"{i}. " + md_inline(s), markdown=True)
            pdf.ln(0.8)
    pdf.set_title(clean(title))
    pdf.set_creator(APP_NAME)
    pdf.output(str(path))
