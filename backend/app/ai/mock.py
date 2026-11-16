"""Deterministic offline responses for the mock provider. Every result is labelled as mock output and
never pretends to have read an image. Quotes are taken verbatim from supplied text so that the
citation-verification path is exercised realistically."""
from __future__ import annotations

import json
import re

from .provider import AIRequest

MOCK = "[Mock AI — offline test mode]"


def _first_sentence(text: str, max_len: int = 160) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    m = re.search(r"^(.{20,%d}?[.!?])(\s|$)" % max_len, text)
    return (m.group(1) if m else text[:max_len]).strip()


def _evidence(sources: list[dict], n: int = 3) -> list[dict]:
    return [{"source": s["label"], "quote": _first_sentence(s["text"]), "explanation": f"Opening language of {s['filename']}."} for s in sources[:n]]


def respond(req: AIRequest) -> str:
    m = req.meta
    wf = m.get("repair_of") or req.workflow
    if req.workflow != "repair" and m.get("mock_malformed"):
        return "{ this is not valid json"
    instr = (m.get("instruction") or "").strip()
    srcs = [s for s in m.get("sources", []) if s.get("text")]
    images = m.get("images", [])
    out: dict

    if wf == "email":
        out = {
            "title": "Mock: email reply",
            "asking": f"{MOCK} The sender appears to want a reply to: “{instr[:120]}”. A real model would read the screenshots.",
            "context": [f"{len(images)} screenshot(s) and {len(srcs)} text source(s) were supplied."],
            "decisions": [{"question": "Whether to agree to the request as stated", "options": ["Agree", "Ask for more detail"], "recommendation": "Ask for more detail"}],
            "approach": "Acknowledge the request, confirm what you can commit to, and ask for the missing details.",
            "draft_subject": "Re: your request",
            "draft_body": "Hi [Name],\n\nThanks for your note. I've reviewed what you sent and will come back to you with a recommendation once I've confirmed [missing detail].\n\nBest,\n[Your name]",
            "uncertainties": ["Mock mode cannot read images; sender, dates and the actual request are unknown."],
            "deadlines": [],
            "thread": [],
            "action_items": [{"title": "Reply to the email thread", "kind": "respond", "owner": None, "due": None, "source": images[0] if images else None}],
            "evidence": _evidence(srcs, 2),
            "transcriptions": [{"source": lab, "text": f"{MOCK} image {lab} was not read.", "uncertain": ["entire image"]} for lab in images],
        }
    elif wf in ("document", "reasoning", "revise_analysis"):
        facts = [{"statement": _first_sentence(s["text"]), "basis": "document", "source": s["label"]} for s in srcs[:3]]
        out = {
            "title": "Mock: " + (instr[:60] or "analysis"),
            "answer_type": "full",
            "executive_conclusion": f"{MOCK} Preliminary conclusion for “{instr[:120]}”, based on {len(srcs)} source section(s).",
            "facts": facts + [{"statement": "The user wants a reasoned recommendation.", "basis": "user_provided", "source": None}],
            "key_issues": ["Whether the provisions are internally consistent", "What information is missing"],
            "analysis": f"{MOCK}\n\nThis placeholder analysis exercises the full pipeline: sources were labelled, cited and verified.",
            "alternatives": ["A narrower reading of the key provision"],
            "risks": ["Mock output is not a real analysis."],
            "next_steps": ["Configure a real AI provider for substantive analysis."],
            "missing_information": ["Any facts not contained in the supplied sources"],
            "external_guidance_note": None,
            "evidence": _evidence(srcs) + ([{"source": "S1", "quote": "This sentence does not appear in any source.", "explanation": "Deliberately unverifiable (tests the warning path)."}] if m.get("mock_bad_quote") else []),
            "action_items": [],
            "decisions": [],
            "transcriptions": [{"source": lab, "text": f"{MOCK} image {lab} was not read.", "uncertain": []} for lab in images],
        }
        if wf == "revise_analysis":
            out["title"] = "Mock: revised analysis"
            out["executive_conclusion"] = f"{MOCK} Revised conclusion addressing the review."
    elif wf == "review":
        out = {
            "title": "Critical review",
            "verdict": "needs_revision",
            "overall_assessment": f"{MOCK} The work is plausible but rests on assumptions that should be confirmed.",
            "issues": [
                {"severity": "high", "category": "unsupported assertion", "issue": "The conclusion is stated more firmly than the cited evidence supports.",
                 "why_it_matters": "A reader may rely on it without checking.", "suggestion": "Qualify the conclusion and cite the specific provision.", "source": None},
                {"severity": "low", "category": "ambiguity", "issue": "Some terms are used without definition.", "why_it_matters": "", "suggestion": "Define key terms.", "source": None},
            ],
            "strongest_counterargument": "The key provision can reasonably be read more narrowly.",
            "revised_conclusion": "The conclusion holds only if the assumptions identified are confirmed.",
            "evidence": _evidence(srcs, 1),
        }
    elif wf in ("memo", "writing"):
        is_memo = wf == "memo"
        out = {
            "title": "Mock: " + ("Technical memorandum" if is_memo else (instr[:50] or "Draft")),
            "kind": "memo" if is_memo else "document",
            "subject": None,
            "body": (f"**To:** [Recipient]  \n**From:** [Your name]  \n**Date:** [Date]  \n**Re:** {instr[:80]}\n\n## Executive summary\n\n{MOCK} Summary.\n\n"
                     "## Background\n\nBackground drawn from the sources.\n\n## Analysis\n\nAnalysis.\n\n## Conclusion\n\nConclusion.\n") if is_memo
            else f"{MOCK}\n\nDraft responding to: {instr[:200]}\n\n[Your name]",
            "notes": ["Replace bracketed placeholders."],
        }
    elif wf == "rewrite":
        body = m.get("draft") or ""
        preset = m.get("preset")
        if preset == "shorter":
            sentences = re.split(r"(?<=[.!?])\s+", body)
            body = " ".join(sentences[: max(1, len(sentences) // 2)])
        out = {"title": "Revision", "kind": "document", "subject": m.get("subject"),
               "body": f"{body}\n\n{MOCK} revised: {(preset or m.get('instruction') or '')[:80]}", "notes": []}
    elif wf == "writing_profile":
        text = " ".join(s["text"] for s in srcs)
        sentences = [x for x in re.split(r"(?<=[.!?])\s+", text) if x.strip()]
        avg = round(sum(len(x.split()) for x in sentences) / max(1, len(sentences)), 1)
        out = {"summary": f"{MOCK} Profile computed from {len(sentences)} sentences.", "sentence_length": f"Average {avg} words per sentence",
               "tone": "Measured and professional", "structure": "Point first, then support", "vocabulary": "Plain, precise",
               "technical_depth": "Moderate", "directness": "Direct", "formatting": "Short paragraphs, few bullet lists",
               "do": ["Lead with the conclusion"], "avoid": ["Filler phrases"],
               "characteristic_phrases": [sentences[0][:60]] if sentences else []}
    elif wf == "knowledge":
        ks = [s for s in srcs if s["label"].startswith("K")] or srcs
        out = {"title": "Mock: knowledge answer", "found": bool(ks),
               "answer": f"{MOCK} Found {len(ks)} relevant record(s): " + ", ".join(s["filename"] for s in ks[:5]) if ks else f"{MOCK} Nothing relevant was found.",
               "evidence": _evidence(ks, 2)}
    elif wf == "strategy":
        n = int(m.get("record_count") or 0)
        out = {"title": "Mock: strategic review", "summary": f"{MOCK} Reviewed {n} stored record(s).",
               "observations": [{"observation": f"{n} records were stored in the period.", "records": ["R1"] if n else []}],
               "recommendations": [{"recommendation": "Save reusable conclusions to Knowledge", "rationale": "Reduces repeated analysis.", "based_on": []}],
               "limitations": "Only records stored in this application were considered."}
    else:
        out = {"title": "Mock", "summary": MOCK}
    return json.dumps(out)
