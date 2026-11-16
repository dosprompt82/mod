from __future__ import annotations

from sqlalchemy.orm import Session

from ..config import settings
from ..services.prefs import get_pref
from ..services.secrets import get_api_key
from .common import err


def require_ai_ready(db: Session) -> None:
    """Every external AI operation is user-initiated and requires the one-time processing consent."""
    if not get_pref(db, "external_ai_consent"):
        raise err(412, "Before anything is sent to the AI provider, confirm that you understand selected content is transmitted to Anthropic for processing.", "consent_required")
    if settings.ai_provider != "mock" and not get_api_key():
        raise err(400, "No Anthropic API key is configured. Add one in Settings → AI Provider.", "not_configured")
