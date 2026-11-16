"""API key storage. Kept in data/secrets.json (mode 0600), outside source control and outside backups.
The ANTHROPIC_API_KEY environment variable takes precedence when set."""
from __future__ import annotations

import json
import os

from ..config import settings


def _read() -> dict:
    try:
        return json.loads(settings.secrets_path.read_text())
    except (OSError, ValueError):
        return {}


def get_api_key() -> str | None:
    return os.environ.get("ANTHROPIC_API_KEY") or _read().get("anthropic_api_key") or None


def key_source() -> str | None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "environment"
    return "settings" if _read().get("anthropic_api_key") else None


def set_api_key(key: str | None) -> None:
    settings.ensure_dirs()
    data = _read()
    if key:
        data["anthropic_api_key"] = key.strip()
    else:
        data.pop("anthropic_api_key", None)
    tmp = settings.secrets_path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)
    os.replace(tmp, settings.secrets_path)
    os.chmod(settings.secrets_path, 0o600)


def masked(key: str | None) -> str | None:
    if not key:
        return None
    return f"{key[:7]}…{key[-4:]}" if len(key) > 12 else "••••"
