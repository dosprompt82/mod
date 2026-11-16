"""Key/value preferences stored in SQLite."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Preference, jdump, jload

DEFAULTS: dict[str, Any] = {
    "model": None,  # None -> settings.default_model
    "theme": "system",
    "tone": "direct",  # direct|warm|formal|neutral
    "length": "concise",  # concise|standard|detailed
    "use_writing_profile": True,
    "analysis_depth": "standard",  # standard|deep
    "external_ai_consent": False,
    "external_ai_consent_at": None,
}


def get_pref(db: Session, key: str) -> Any:
    row = db.get(Preference, key)
    if row is None:
        return DEFAULTS.get(key)
    return jload(row.value, DEFAULTS.get(key))


def set_pref(db: Session, key: str, value: Any) -> None:
    row = db.get(Preference, key)
    if row is None:
        db.add(Preference(key=key, value=jdump(value)))
    else:
        row.value = jdump(value)


def all_prefs(db: Session) -> dict[str, Any]:
    out = dict(DEFAULTS)
    for row in db.query(Preference).all():
        out[row.key] = jload(row.value, DEFAULTS.get(row.key))
    return out


def model_id(db: Session) -> str:
    return get_pref(db, "model") or settings.default_model
