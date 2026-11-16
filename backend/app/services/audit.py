"""Basic audit log. Records actions and identifiers only: never file contents, prompts or secrets."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import AuditEvent, jdump


def audit(db: Session, action: str, entity_type: str | None = None, entity_id: str | None = None, **detail) -> None:
    db.add(AuditEvent(action=action, entity_type=entity_type, entity_id=str(entity_id) if entity_id else None, detail=jdump(detail)))
