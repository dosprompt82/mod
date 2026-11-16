"""Markdown rendering of structured results (used for display fallbacks, search, export and copy)."""
from __future__ import annotations

import re

from ..models import SourceReference

BASIS_LABEL = {"observed": "Observed", "document": "Document", "user_provided": "You said", "assumption": "Assumption", "inference": "Inference"}
VERIFY_LABEL = {"verified": "", "vision": " (read from an image by AI)", "unverified": " (⚠ not found in the source text; treat as unverified)"}


def _list(items, fmt=lambda x: x) -> str:
    return "\n".join(f"- {fmt(i)}" for i in items if i)


def sources_md(refs: list[SourceReference]) -> str:
    lines = []
    for r in refs:
        where = r.original_filename or r.label
        if r.page_number:
            where += f", p. {r.page_number}"
        if r.section:
            where += f", {r.section}"
        line = f"- **{where}**{VERIFY_LABEL.get(r.verification, '')}: “{r.quote.strip()}”"
        if r.explanation:
            line += f" — {r.explanation}"
        lines.append(line)
    return "\n".join(lines)


def section(title: str, body: str) -> str:
    return f"## {title}\n\n{body.strip()}\n" if body and body.strip() else ""


def email_md(o: dict, refs: list[SourceReference]) -> str:
    out = [
        section("What they are asking", o.get("asking", "")),
        section("Important context", _list(o.get("context", []))),
        section("What requires my decision", _list(o.get("decisions", []), lambda d: d.get("question", "") + (f" — recommended: {d['recommendation']}" if d.get("recommendation") else ""))),
        section("Deadlines", _list(o.get("deadlines", []))),
        section("Recommended approach", o.get("approach", "")),
        section("Draft response", (f"**Subject:** {o['draft_subject']}\n\n" if o.get("draft_subject") else "") + o.get("draft_body", "")),
        section("Uncertainties", _list(o.get("uncertainties", []))),
        section("Interpersonal dynamics", o.get("dynamics") or ""),
        section("Supporting sources", sources_md(refs)),
    ]
    return "\n".join(x for x in out if x)


def analysis_md(o: dict, refs: list[SourceReference]) -> str:
    facts = _list(o.get("facts", []), lambda f: f"*{BASIS_LABEL.get(f.get('basis'), f.get('basis'))}:* {f.get('statement', '')}")
    out = [
        section("Executive conclusion", o.get("executive_conclusion", "")),
        section("Relevant facts", facts),
        section("Key issues", _list(o.get("key_issues", []))),
        section("Analysis", o.get("analysis", "")),
        section("Alternative interpretations", _list(o.get("alternatives", []))),
        section("Risks and uncertainties", _list(o.get("risks", []))),
        section("Missing information", _list(o.get("missing_information", []))),
        section("Recommended next steps", _list(o.get("next_steps", []))),
        section("External guidance", o.get("external_guidance_note") or ""),
        section("Supporting sources", sources_md(refs)),
    ]
    return "\n".join(x for x in out if x)


def review_md(o: dict, refs: list[SourceReference]) -> str:
    sev_order = ["critical", "high", "medium", "low"]
    issues = sorted(o.get("issues", []), key=lambda i: sev_order.index(i.get("severity", "low")) if i.get("severity") in sev_order else 9)

    def fmt(i):
        s = f"**[{i.get('severity', '').upper()}] {i.get('category', '')}:** {i.get('issue', '')}"
        if i.get("why_it_matters"):
            s += f" *Why it matters:* {i['why_it_matters']}"
        if i.get("suggestion"):
            s += f" *Suggestion:* {i['suggestion']}"
        return s

    crit = [i for i in issues if i.get("severity") in ("critical", "high")]
    imp = [i for i in issues if i.get("severity") == "medium"]
    minor = [i for i in issues if i.get("severity") == "low"]
    verdict = {"sound": "Sound", "needs_revision": "Needs revision", "unsound": "Unsound"}.get(o.get("verdict", ""), o.get("verdict", ""))
    out = [
        section("Overall assessment", f"**Verdict: {verdict}.** {o.get('overall_assessment', '')}"),
        section("Critical issues", _list(crit, fmt)),
        section("Important improvements", _list(imp, fmt)),
        section("Minor improvements", _list(minor, fmt)),
        section("Strongest counterargument", o.get("strongest_counterargument", "")),
        section("Suggested revised conclusion", o.get("revised_conclusion", "")),
        section("Supporting sources", sources_md(refs)),
    ]
    return "\n".join(x for x in out if x)


def knowledge_md(o: dict, refs: list[SourceReference]) -> str:
    body = o.get("answer", "")
    if not o.get("found", True):
        body = "*Your saved material does not answer this.*\n\n" + body
    return "\n".join(x for x in [section("Answer", body), section("Supporting sources", sources_md(refs))] if x)


def strategy_md(o: dict, labels: dict[str, str]) -> str:
    def obs(x):
        recs = ", ".join(labels.get(r, r) for r in x.get("records", []))
        return x.get("observation", "") + (f" *(based on: {recs})*" if recs else "")

    out = [
        section("Summary", o.get("summary", "")),
        section("Observations from your records", _list(o.get("observations", []), obs)),
        section("Recommendations", _list(o.get("recommendations", []), lambda r: f"**{r.get('recommendation', '')}** {r.get('rationale', '')}")),
        section("Limitations", o.get("limitations", "")),
    ]
    return "\n".join(x for x in out if x)


def _cell(t: str) -> str:
    return (t or "").replace("|", "/").replace("\n", " ").strip()


def doc_review_md(o: dict, refs: list[SourceReference]) -> str:
    """Markdown in the review format: scope, score, elevator pitch, key questions, issues by tier, comments."""
    name = (o.get("document_name") or "") + " " + (o.get("document_description") or "")
    noun = "Memo" if "memo" in name.lower() else "Document"
    score = o.get("score")
    score_txt = f"{score:g}/10" if isinstance(score, (int, float)) else "n/a"
    reasons = o.get("score_reasons", [])
    score_body = ""
    if o.get("strengths"):
        score_body += " ".join(o["strengths"]) + "\n\n"
    if reasons:
        score_body += f"It loses points for {len(reasons)} reason{'s' if len(reasons) != 1 else ''}:\n\n" + _list(reasons)
    if o.get("presentation_notes"):
        score_body += "\n\n" + " ".join(o["presentation_notes"])
    rows = [f"| Issue | {noun} conclusion | My view |", "|---|---|---|"]
    for q in o.get("key_questions", []):
        rows.append(f"| {_cell(q.get('ref', ''))}. {_cell(q.get('topic', ''))} | {_cell(q.get('document_conclusion', ''))} | {_cell(q.get('reviewer_view', ''))} |")
    findings = o.get("findings", [])
    prim = [f for f in findings if f.get("tier") == "primary"]
    sec = [f for f in findings if f.get("tier") != "primary"]
    tiers = ""
    if prim:
        tiers += "### Primary\n\n" + "\n".join(f"- **{f.get('id')}. {f.get('title')}.** {f.get('summary', '')}" for f in prim) + "\n\n"
    if sec:
        tiers += "### Secondary\n\n" + "\n".join(f"- **{f.get('id')}. {f.get('title')}.** {f.get('summary', '')}" for f in sec)
    def keep_lines(t: str) -> str:  # single line breaks in comments, e.g. (a) (b) (c), stay as separate lines
        return re.sub(r"(?<!\n)\n(?!\n)", "  \n", (t or "").strip())

    comments = "\n\n".join(f"**{f.get('id')}. {f.get('location') or f.get('title')}**\n\n{keep_lines(f.get('comment', ''))}" for f in findings)
    out = [
        (f"**{o['document_description'].strip()}**\n\n" if o.get("document_description") else "") + (o.get("scope_note") or "").strip() + "\n",
        section(f"1. Score: {score_txt}", score_body or "No deductions noted."),
        section("2. Elevator pitch", o.get("elevator_pitch", "")),
        section("3. Key questions and conclusions", "\n".join(rows) if len(rows) > 2 else ""),
        section("4. Issues by tier", tiers),
        section("5. Paste-ready comments", comments),
        section("Supporting sources", sources_md(refs)),
    ]
    return "\n".join(x for x in out if x and x.strip())
