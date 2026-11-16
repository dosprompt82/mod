"""SQLAlchemy data model. Every table carries timestamps; deletion behaviour is explicit per FK."""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def new_id() -> str:
    return uuid.uuid4().hex


def now() -> datetime:
    return datetime.now(UTC)



def jload(value: str | None, default=None):
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def jdump(value) -> str:
    return json.dumps(value, ensure_ascii=False)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


# ---- workspaces -----------------------------------------------------------------

class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(300), default="Untitled workspace")
    title_is_auto: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active|waiting|completed|archived
    tags: Mapped[str] = mapped_column(Text, default="[]")

    messages: Mapped[list[Message]] = relationship(back_populates="workspace", cascade="all, delete-orphan", order_by="Message.created_at")
    attachments: Mapped[list[Attachment]] = relationship(back_populates="workspace", cascade="all, delete-orphan", order_by="Attachment.created_at")


class Message(TimestampMixin, Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user|assistant
    content: Mapped[str] = mapped_column(Text, default="")
    workflow: Mapped[str | None] = mapped_column(String(40))
    attachment_ids: Mapped[str] = mapped_column(Text, default="[]")
    run_id: Mapped[str | None] = mapped_column(String(32))
    # For assistant messages: what the message renders (analysis/review/draft id).
    result_type: Mapped[str | None] = mapped_column(String(20))
    result_id: Mapped[str | None] = mapped_column(String(32))
    workspace: Mapped[Workspace] = relationship(back_populates="messages")


# ---- documents ------------------------------------------------------------------

class Attachment(TimestampMixin, Base):
    """An uploaded file. Acts as the 'Document' entity: pages and chunks hang off it."""
    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    # Nullable: files are staged before the first message creates/joins a workspace.
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    original_filename: Mapped[str] = mapped_column(String(300))
    stored_name: Mapped[str] = mapped_column(String(80), unique=True)
    kind: Mapped[str] = mapped_column(String(10))  # pdf|docx|txt|md|image
    mime_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64), index=True)
    duplicate_of: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded|extracting|ready|needs_vision|failed
    error: Mapped[str | None] = mapped_column(Text)
    page_count: Mapped[int | None] = mapped_column(Integer)
    text_chars: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)

    workspace: Mapped[Workspace | None] = relationship(back_populates="attachments")
    pages: Mapped[list[DocumentPage]] = relationship(back_populates="attachment", cascade="all, delete-orphan", order_by="DocumentPage.page_number")
    chunks: Mapped[list[DocumentChunk]] = relationship(back_populates="attachment", cascade="all, delete-orphan", order_by="DocumentChunk.ordinal")


class DocumentPage(Base):
    __tablename__ = "document_pages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attachment_id: Mapped[str] = mapped_column(ForeignKey("attachments.id", ondelete="CASCADE"), index=True)
    page_number: Mapped[int | None] = mapped_column(Integer)  # None for unpaged formats
    text: Mapped[str] = mapped_column(Text, default="")
    text_source: Mapped[str] = mapped_column(String(20), default="extracted")  # extracted|vision
    needs_vision: Mapped[bool] = mapped_column(Boolean, default=False)
    attachment: Mapped[Attachment] = relationship(back_populates="pages")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attachment_id: Mapped[str] = mapped_column(ForeignKey("attachments.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer)
    section: Mapped[str | None] = mapped_column(String(300))
    text: Mapped[str] = mapped_column(Text)
    text_source: Mapped[str] = mapped_column(String(20), default="extracted")
    attachment: Mapped[Attachment] = relationship(back_populates="chunks")


# ---- AI results -----------------------------------------------------------------

class ModelRun(TimestampMixin, Base):
    __tablename__ = "model_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="SET NULL"), index=True)
    workflow: Mapped[str] = mapped_column(String(40))
    steps: Mapped[str] = mapped_column(Text, default="[]")
    step_label: Mapped[str] = mapped_column(String(200), default="")
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)  # queued|running|succeeded|failed|cancelled
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_estimate: Mapped[float | None] = mapped_column(Float)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    calls: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    request_summary: Mapped[str] = mapped_column(String(300), default="")
    result_type: Mapped[str | None] = mapped_column(String(20))
    result_id: Mapped[str | None] = mapped_column(String(32))
    message_id: Mapped[str | None] = mapped_column(String(32))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Analysis(TimestampMixin, Base):
    __tablename__ = "analyses"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    # Null for workspace-independent results such as strategic reviews.
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str | None] = mapped_column(String(32))
    workflow: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    summary: Mapped[str] = mapped_column(Text, default="")
    content_json: Mapped[str] = mapped_column(Text, default="{}")
    markdown: Mapped[str] = mapped_column(Text, default="")
    structured: Mapped[bool] = mapped_column(Boolean, default=True)
    provider: Mapped[str] = mapped_column(String(20), default="")
    parent_analysis_id: Mapped[str | None] = mapped_column(ForeignKey("analyses.id", ondelete="SET NULL"))
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    sources: Mapped[list[SourceReference]] = relationship(cascade="all, delete-orphan", order_by="SourceReference.ordinal")


class SourceReference(Base):
    __tablename__ = "source_references"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str | None] = mapped_column(ForeignKey("analyses.id", ondelete="CASCADE"), index=True)
    review_id: Mapped[str | None] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str] = mapped_column(String(20))  # the label the model cited, e.g. S3
    attachment_id: Mapped[str | None] = mapped_column(ForeignKey("attachments.id", ondelete="SET NULL"))
    chunk_id: Mapped[int | None] = mapped_column(ForeignKey("document_chunks.id", ondelete="SET NULL"))
    original_filename: Mapped[str | None] = mapped_column(String(300))
    page_number: Mapped[int | None] = mapped_column(Integer)
    section: Mapped[str | None] = mapped_column(String(300))
    quote: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text, default="")
    # verified: quote found verbatim in extracted text | vision: quote is from an AI transcription of an image
    # unverified: quote not found in any source (shown with a warning, never presented as a citation)
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    location: Mapped[str] = mapped_column(Text, default="{}")


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str | None] = mapped_column(String(32))
    target_type: Mapped[str] = mapped_column(String(20))  # analysis|draft
    target_id: Mapped[str] = mapped_column(String(32))
    target_version: Mapped[int | None] = mapped_column(Integer)
    content_json: Mapped[str] = mapped_column(Text, default="{}")
    markdown: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(20), default="")
    sources: Mapped[list[SourceReference]] = relationship(cascade="all, delete-orphan", order_by="SourceReference.ordinal")


class Draft(TimestampMixin, Base):
    __tablename__ = "drafts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(40), default="document")  # email|memo|summary|report|post|letter|talking_points|document
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|final
    source_analysis_id: Mapped[str | None] = mapped_column(ForeignKey("analyses.id", ondelete="SET NULL"))
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    versions: Mapped[list[DraftVersion]] = relationship(back_populates="draft", cascade="all, delete-orphan", order_by="DraftVersion.version_number")


class DraftVersion(Base):
    __tablename__ = "draft_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str | None] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    note: Mapped[str] = mapped_column(String(300), default="")
    author: Mapped[str] = mapped_column(String(20), default="ai")  # ai|user
    provider: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    draft: Mapped[Draft] = relationship(back_populates="versions")


# ---- assistant ------------------------------------------------------------------

class Decision(TimestampMixin, Base):
    __tablename__ = "decisions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    context: Mapped[str] = mapped_column(Text, default="")
    options: Mapped[str] = mapped_column(Text, default="[]")
    recommendation: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|decided|dropped
    outcome: Mapped[str | None] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[str | None] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(20), default="user")  # user|ai_suggested
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    details: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default="action")  # action|respond|waiting_on
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open|done
    due_date: Mapped[str | None] = mapped_column(String(40))  # only when explicitly stated
    owner: Mapped[str | None] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(20), default="user")  # user|extracted
    source_excerpt: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---- knowledge & personalisation -----------------------------------------------------

class KnowledgeItem(TimestampMixin, Base):
    __tablename__ = "knowledge_items"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    category: Mapped[str] = mapped_column(String(30), index=True)  # reference|previous_analysis|decision|writing_example|project|preference
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    tags: Mapped[str] = mapped_column(Text, default="[]")
    # user_fact|user_approved|source_document|ai_draft|ai_interpretation
    provenance: Mapped[str] = mapped_column(String(30), default="user_fact")
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.id", ondelete="SET NULL"), index=True)
    source_ref: Mapped[str] = mapped_column(Text, default="{}")


class WritingProfile(TimestampMixin, Base):
    __tablename__ = "writing_profiles"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    status: Mapped[str] = mapped_column(String(20), default="proposed")  # proposed|approved|superseded
    profile_json: Mapped[str] = mapped_column(Text, default="{}")
    sample_excerpt: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(20), default="")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Preference(Base):
    __tablename__ = "preferences"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Export(Base):
    __tablename__ = "exports"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    source_type: Mapped[str] = mapped_column(String(20))
    source_id: Mapped[str | None] = mapped_column(String(32))
    format: Mapped[str] = mapped_column(String(10))
    filename: Mapped[str] = mapped_column(String(300))
    stored_name: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    detail: Mapped[str] = mapped_column(Text, default="{}")  # never prompts, file contents or secrets
