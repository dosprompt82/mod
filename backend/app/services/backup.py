"""Backup and restore of the database and stored files (API keys are never included)."""
from __future__ import annotations

import json
import re
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from ..config import APP_NAME, VERSION, settings
from ..db import migrate, reset_engine

_NAME_RX = re.compile(r"^backup-\d{8}-\d{6}(-[a-z-]+)?\.zip$")
_MEMBER_RX = re.compile(r"^(manifest\.json|superpower\.db|files/[A-Za-z0-9_-]{1,64}\.[a-z]{2,5})$")


class BackupError(ValueError):
    pass


def create_backup(label: str = "") -> Path:
    settings.ensure_dirs()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"backup-{stamp}{('-' + label) if label else ''}.zip"
    out = settings.backups_dir / name
    with tempfile.TemporaryDirectory() as tmp:
        snap = Path(tmp) / "superpower.db"
        src = sqlite3.connect(settings.db_path)
        dst = sqlite3.connect(snap)
        with dst:
            src.backup(dst)  # consistent snapshot even while the app is running
        src.close()
        dst.close()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("manifest.json", json.dumps({"app": APP_NAME, "version": VERSION, "created_at": datetime.now().isoformat()}))
            z.write(snap, "superpower.db")
            for f in sorted(settings.files_dir.glob("*")):
                if f.is_file():
                    z.write(f, f"files/{f.name}")
    return out


def list_backups() -> list[dict]:
    settings.ensure_dirs()
    out = []
    for f in sorted(settings.backups_dir.glob("backup-*.zip"), reverse=True):
        st = f.stat()
        out.append({"name": f.name, "size_bytes": st.st_size, "created_at": datetime.fromtimestamp(st.st_mtime).isoformat()})
    return out


def backup_path(name: str) -> Path:
    if not _NAME_RX.match(name or ""):
        raise BackupError("Invalid backup name.")
    p = settings.backups_dir / name
    if not p.exists():
        raise BackupError("Backup not found.")
    return p


def restore_backup(data: bytes) -> dict:
    """Validate the archive strictly, snapshot the current state, then replace DB and files."""
    import io

    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise BackupError("This is not a valid backup archive.") from e
    names = z.namelist()
    bad = [n for n in names if not _MEMBER_RX.match(n)]
    if bad or "superpower.db" not in names or "manifest.json" not in names:
        raise BackupError("This archive is not a Personal Superpower backup (unexpected or missing entries).")
    manifest = json.loads(z.read("manifest.json"))
    if manifest.get("app") != APP_NAME:
        raise BackupError("This backup was made by a different application.")
    if sum(i.file_size for i in z.infolist()) > 20 * 1024**3:
        raise BackupError("The backup is too large to restore.")
    with tempfile.TemporaryDirectory() as tmp:
        dbfile = Path(tmp) / "restore.db"
        dbfile.write_bytes(z.read("superpower.db"))
        try:
            con = sqlite3.connect(dbfile)
            ok = con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            con.execute("SELECT count(*) FROM workspaces").fetchone()
            con.close()
        except sqlite3.DatabaseError as e:
            raise BackupError("The database inside the backup is damaged.") from e
        if not ok:
            raise BackupError("The database inside the backup failed an integrity check.")
        safety = create_backup("pre-restore")
        reset_engine()
        for suffix in ("", "-wal", "-shm"):
            p = Path(str(settings.db_path) + suffix)
            if p.exists():
                p.unlink()
        shutil.copyfile(dbfile, settings.db_path)
        for f in settings.files_dir.glob("*"):
            if f.is_file():
                f.unlink()
        for n in names:
            if n.startswith("files/"):
                (settings.files_dir / n.split("/", 1)[1]).write_bytes(z.read(n))
    migrate()
    return {"restored_from": manifest.get("created_at"), "safety_backup": safety.name}
