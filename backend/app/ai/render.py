"""Markdown rendering of structured results (used for display fallbacks, search, export and copy)."""
from __future__ import annotations

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
