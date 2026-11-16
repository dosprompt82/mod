"""Structured output schemas. Model output is parsed and validated against these before it is stored."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Lenient(BaseModel):
    model_config = ConfigDict(extra="ignore")

    @field_validator("*", mode="before")
    @classmethod
    def _none_to_default(cls, v, info):
        # Models sometimes send null for list fields; treat as empty.
        field = cls.model_fields.get(info.field_name)
        if v is None and field is not None and field.annotation is not None and str(field.annotation).startswith("list"):
            return []
        return v


class Evidence(Lenient):
    source: str = Field(description="Source label exactly as given, e.g. S3, IMG1 or K2")
    quote: str = Field(description="Short verbatim excerpt copied exactly from that source")
    explanation: str = Field("", description="Why this excerpt matters")


class Fact(Lenient):
    statement: str
    basis: Literal["observed", "document", "user_provided", "assumption", "inference"] = Field(
        description="observed=seen in a screenshot; document=stated in a source document; user_provided=stated by the user; "
                    "assumption=not established, assumed; inference=your reasoning from the facts")
    source: str | None = Field(None, description="Source label if applicable")


class ActionItem(Lenient):
    title: str
    kind: Literal["action", "respond", "waiting_on"] = Field("action", description="action=user must do; respond=user owes a reply; waiting_on=someone else owes the user")
    owner: str | None = None
    due: str | None = Field(None, description="Only if a deadline is explicitly stated in the sources, quoted as written; otherwise null")
    source: str | None = None


class DecisionItem(Lenient):
    question: str
    options: list[str] = []
    recommendation: str | None = None


class Transcription(Lenient):
    source: str = Field(description="Screenshot or page label, e.g. IMG1")
    text: str = Field(description="Faithful transcription of the visible text. Use [illegible] where text cannot be read")
    uncertain: list[str] = Field([], description="Words or passages that were hard to read")


class EmailMessageOut(Lenient):
    sender: str | None = None
    recipients: str | None = None
    date: str | None = Field(None, description="As shown; null if not visible")
    subject: str | None = None
    summary: str
    source: str | None = None


class EmailAnalysis(Lenient):
    title: str = Field(description="Short workspace title, e.g. 'Reply to Dana re: lease classification'")
    asking: str = Field(description="What they are actually asking, in one or two sentences")
    context: list[str] = Field([], description="Important background from the thread")
    decisions: list[DecisionItem] = Field([], description="Decisions the user needs to make")
    approach: str = Field(description="Recommended approach, concise")
    draft_subject: str | None = None
    draft_body: str = Field(description="Complete ready-to-send reply in plain text")
    uncertainties: list[str] = Field([], description="Missing or illegible information that could affect the reply")
    deadlines: list[str] = Field([], description="Deadlines exactly as stated; empty if none")
    implied_expectations: list[str] = []
    unresolved_questions: list[str] = []
    dynamics: str | None = Field(None, description="Interpersonal dynamics only where clearly supported; cautious wording")
    thread: list[EmailMessageOut] = Field([], description="Messages in chronological order, oldest first, deduplicated")
    action_items: list[ActionItem] = []
    evidence: list[Evidence] = []
    transcriptions: list[Transcription] = []


class AnalysisOut(Lenient):
    title: str
    answer_type: Literal["concise", "full"] = "full"
    executive_conclusion: str = Field(description="The answer or conclusion first, in plain language")
    facts: list[Fact] = []
    key_issues: list[str] = []
    analysis: str = Field("", description="Markdown. The reasoning; empty for concise answers")
    alternatives: list[str] = Field([], description="Alternative interpretations and why they are weaker or stronger")
    risks: list[str] = []
    next_steps: list[str] = []
    missing_information: list[str] = Field([], description="Facts that could change the answer")
    external_guidance_note: str | None = Field(None, description="If you relied on laws, standards or literature from general knowledge, say what should be verified")
    evidence: list[Evidence] = []
    action_items: list[ActionItem] = []
    decisions: list[DecisionItem] = []
    transcriptions: list[Transcription] = []


class ReviewIssue(Lenient):
    severity: Literal["critical", "high", "medium", "low"]
    category: str = Field(description="e.g. unsupported assertion, missing fact, contradiction, logic, calculation, unverified citation, overstatement, ambiguity, missing provision, weak recommendation")
    issue: str
    why_it_matters: str = ""
    suggestion: str = ""
    source: str | None = None


class ReviewOut(Lenient):
    title: str = "Critical review"
    verdict: Literal["sound", "needs_revision", "unsound"]
    overall_assessment: str
    issues: list[ReviewIssue] = []
    strongest_counterargument: str = ""
    revised_conclusion: str = Field("", description="Suggested revised conclusion; repeat the original if it stands")
    evidence: list[Evidence] = []


class DraftOut(Lenient):
    title: str
    kind: Literal["email", "memo", "summary", "report", "research_note", "decision_brief", "meeting_summary", "post", "letter", "talking_points", "document"] = "document"
    subject: str | None = Field(None, description="Email subject line, only for emails")
    body: str = Field(description="The full deliverable. Markdown for documents; plain text for emails")
    notes: list[str] = Field([], description="Placeholders the user must fill, assumptions made")


class WritingProfileOut(Lenient):
    summary: str
    sentence_length: str
    tone: str
    structure: str
    vocabulary: str
    technical_depth: str
    directness: str
    formatting: str
    do: list[str] = []
    avoid: list[str] = []
    characteristic_phrases: list[str] = Field([], description="Short phrases quoted exactly from the samples")


class KnowledgeAnswer(Lenient):
    title: str
    answer: str = Field(description="Markdown answer grounded only in the provided records")
    found: bool = True
    evidence: list[Evidence] = []


class Observation(Lenient):
    observation: str
    records: list[str] = Field([], description="Record labels (R1, R2...) supporting it")


class Recommendation(Lenient):
    recommendation: str
    rationale: str
    based_on: list[str] = []


class StrategyOut(Lenient):
    title: str
    summary: str
    observations: list[Observation] = []
    recommendations: list[Recommendation] = []
    limitations: str = ""


WORKFLOW_SCHEMAS: dict[str, type[BaseModel]] = {
    "email": EmailAnalysis,
    "document": AnalysisOut,
    "reasoning": AnalysisOut,
    "revise_analysis": AnalysisOut,
    "review": ReviewOut,
    "memo": DraftOut,
    "writing": DraftOut,
    "rewrite": DraftOut,
    "writing_profile": WritingProfileOut,
    "knowledge": KnowledgeAnswer,
    "strategy": StrategyOut,
}
