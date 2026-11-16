"""Application settings. Everything is local; the data directory holds the DB, files, exports and backups."""
from __future__ import annotations

import os
from pathlib import Path

APP_NAME = "Personal Superpower"
VERSION = "1.2.0"


class Settings:
    def __init__(self) -> None:
        root = Path(os.environ.get("PS_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
        self.data_dir = root
        self.files_dir = root / "files"
        self.exports_dir = root / "exports"
        self.backups_dir = root / "backups"
        self.db_path = root / "superpower.db"
        self.secrets_path = root / "secrets.json"
        self.host = os.environ.get("PS_HOST", "127.0.0.1")
        self.port = int(os.environ.get("PS_PORT", "8765"))
        self.max_upload_bytes = int(os.environ.get("PS_MAX_UPLOAD_MB", "25")) * 1024 * 1024
        self.max_files_per_request = 20
        # "anthropic" (default) or "mock" (deterministic, for tests and offline demos).
        self.ai_provider = os.environ.get("PS_AI_PROVIDER", "anthropic")
        self.default_model = os.environ.get("PS_MODEL", "claude-opus-5-5")
        self.ai_timeout_s = float(os.environ.get("PS_AI_TIMEOUT", "300"))
        self.ai_max_retries = 3

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.files_dir, self.exports_dir, self.backups_dir):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
