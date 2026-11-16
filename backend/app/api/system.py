"""Health, settings, consent, connection test, usage, diagnostics, backups, history and demo data."""
from __future__ import annotations

import platform
import re
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..ai.provider import AIError, AnthropicProvider
from ..config import APP_NAME, VERSION, settings
from ..db import get_db
from ..models import (Analysis, Attachment, AuditEvent, Decision, Draft, Export, KnowledgeItem, ModelRun, Task, Workspace,
                      WritingProfile, jload)
from ..services import backup as backups
from ..services import search
from ..services.audit import audit
from ..services.jobs import submit_extraction
from ..services.prefs import all_prefs, model_id, set_pref
from ..services.secrets import get_api_key, key_source, masked, set_api_key
from ..services.storage import checksum, detect_type, store_bytes
from .common import err

router = APIRouter()
MODEL_RX = re.compile(r"^[a-z0-9][a-z0-9._:@/-]{1,99}$")


def _dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.glob("**/*") if f.is_file()) if p.exists() else 0


def _schema_version(db: Session) -> int:
    return db.execute(text("SELECT COALESCE(MAX(version),0) FROM schema_version")).scalar_one()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "app": APP_NAME, "version": VERSION, "provider": settings.ai_provider,
            "ai_configured": settings.ai_provider == "mock" or bool(get_api_key()), "model": model_id(db)}


def _usage(db: Session, days: int = 30) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.query(ModelRun.model, ModelRun.provider, func.count(ModelRun.id), func.sum(ModelRun.input_tokens), func.sum(ModelRun.output_tokens),
                    func.sum(ModelRun.cost_estimate)).filter(ModelRun.created_at >= since).group_by(ModelRun.model, ModelRun.provider).all()
    by_model = [{"model": m, "provider": p, "runs": n, "input_tokens": i or 0, "output_tokens": o or 0, "cost_estimate": round(c, 4) if c is not None else None}
                for m, p, n, i, o, c in rows]
    return {"days": days, "by_model": by_model, "total_runs": sum(x["runs"] for x in by_model),
            "total_cost_estimate": round(sum(x["cost_estimate"] or 0 for x in by_model), 4)}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    prefs = all_prefs(db)
    key = get_api_key()
    return {
        "ai": {"provider": settings.ai_provider, "model": model_id(db), "default_model": settings.default_model,
               "key_configured": bool(key), "key_masked": masked(key), "key_source": key_source(),
               "consent": bool(prefs.get("external_ai_consent")), "consent_at": prefs.get("external_ai_consent_at")},
        "prefs": {k: prefs.get(k) for k in ("theme", "tone", "length", "use_writing_profile", "analysis_depth")},
        "storage": {"data_dir": str(settings.data_dir), "database": str(settings.db_path), "files": str(settings.files_dir),
                    "exports": str(settings.exports_dir), "backups": str(settings.backups_dir),
                    "database_bytes": settings.db_path.stat().st_size if settings.db_path.exists() else 0,
                    "files_bytes": _dir_size(settings.files_dir), "exports_bytes": _dir_size(settings.exports_dir)},
        "app": {"name": APP_NAME, "version": VERSION, "schema_version": _schema_version(db), "python": platform.python_version(),
                "host": settings.host, "port": settings.port, "max_upload_mb": settings.max_upload_bytes // (1024 * 1024)},
        "usage": _usage(db),
    }


class SettingsIn(BaseModel):
    model: str | None = Field(None, max_length=100)
    theme: Literal["light", "dark", "system"] | None = None
    tone: Literal["direct", "warm", "formal", "neutral"] | None = None
    length: Literal["concise", "standard", "detailed"] | None = None
    use_writing_profile: bool | None = None
    analysis_depth: Literal["standard", "deep"] | None = None


@router.put("/settings")
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_none=True)
    if "model" in data:
        m = data["model"].strip()
        if m and not MODEL_RX.match(m):
            raise err(400, "That doesn't look like a valid model identifier.", "bad_model")
        data["model"] = m or None
    for k, v in data.items():
        set_pref(db, k, v)
    audit(db, "settings_updated", "settings", None, fields=list(data))
    db.commit()
    return get_settings(db)


class KeyIn(BaseModel):
    api_key: str | None = Field(None, max_length=400)


@router.put("/settings/api-key")
def update_key(body: KeyIn, db: Session = Depends(get_db)):
    key = (body.api_key or "").strip()
    if key and (len(key) < 20 or any(c.isspace() for c in key)):
        raise err(400, "That doesn't look like an Anthropic API key.", "bad_key")
    set_api_key(key or None)
    audit(db, "api_key_updated" if key else "api_key_removed", "settings", None)  # never the key itself
    db.commit()
    return {"key_configured": bool(get_api_key()), "key_masked": masked(get_api_key()), "key_source": key_source()}


class ConsentIn(BaseModel):
    accepted: bool


@router.post("/settings/consent")
def consent(body: ConsentIn, db: Session = Depends(get_db)):
    set_pref(db, "external_ai_consent", body.accepted)
    set_pref(db, "external_ai_consent_at", datetime.now(UTC).isoformat() if body.accepted else None)
    audit(db, "external_ai_consent", "settings", None, accepted=body.accepted)
    db.commit()
    return {"consent": body.accepted}


@router.post("/settings/test-connection")
def test_connection(db: Session = Depends(get_db)):
    if settings.ai_provider == "mock":
        return {"ok": True, "provider": "mock", "message": "Offline mock provider is active. No external requests are made.", "model": "mock-model"}
    key = get_api_key()
    if not key:
        raise err(400, "Add an API key first.", "not_configured")
    try:
        info = AnthropicProvider(api_key=key, model=model_id(db), timeout=20).test_connection()
    except AIError as e:
        raise err(400, e.user_message, e.code) from None
    audit(db, "connection_tested", "settings", None, ok=True)
    db.commit()
    return {"ok": True, "provider": "anthropic", "message": f"Connected. {info['display_name']} is available.", **info}


@router.get("/diagnostics")
def diagnostics(db: Session = Depends(get_db)):
    counts = {name: db.query(func.count(m.id)).scalar() for name, m in (
        ("workspaces", Workspace), ("files", Attachment), ("analyses", Analysis), ("drafts", Draft), ("tasks", Task),
        ("decisions", Decision), ("knowledge", KnowledgeItem), ("ai_runs", ModelRun), ("exports", Export))}
    failed = db.query(ModelRun).filter_by(status="failed").order_by(ModelRun.created_at.desc()).limit(5).all()
    fts = db.execute(text("SELECT count(*) FROM search_index")).scalar_one()
    integrity = db.execute(text("PRAGMA quick_check")).scalar_one()
    free = shutil.disk_usage(settings.data_dir).free
    return {"counts": counts, "search_index_rows": fts, "database_check": integrity, "disk_free_bytes": free,
            "recent_failures": [{"at": r.created_at.isoformat(), "workflow": r.workflow, "error": r.error_message} for r in failed],
            "log_file": str(settings.data_dir / "logs" / "app.log")}


@router.get("/usage")
def usage(days: int = 30, db: Session = Depends(get_db)):
    return _usage(db, days)


@router.get("/audit")
def audit_log(limit: int = 100, db: Session = Depends(get_db)):
    rows = db.query(AuditEvent).order_by(AuditEvent.id.desc()).limit(min(limit, 1000)).all()
    return {"events": [{"at": e.at.isoformat(), "action": e.action, "entity_type": e.entity_type, "entity_id": e.entity_id,
                        "detail": jload(e.detail, {})} for e in rows]}


# ---- backups ----------------------------------------------------------------------------------

@router.get("/backups")
def get_backups():
    return {"backups": backups.list_backups(), "location": str(settings.backups_dir)}


@router.post("/backups", status_code=201)
def make_backup(db: Session = Depends(get_db)):
    p = backups.create_backup()
    audit(db, "backup_created", "backup", p.name)
    db.commit()
    return {"name": p.name, "size_bytes": p.stat().st_size}


@router.get("/backups/{name}/download")
def download_backup(name: str):
    try:
        p = backups.backup_path(name)
    except backups.BackupError as e:
        raise err(404, str(e), "not_found") from None
    return FileResponse(p, media_type="application/zip", filename=name)


@router.post("/backups/restore")
async def restore(file: UploadFile = File(...)):
    data = await file.read()
    try:
        out = backups.restore_backup(data)
    except backups.BackupError as e:
        raise err(400, str(e), "bad_backup") from None
    return out


class ClearIn(BaseModel):
    confirm: str
    scope: Literal["history", "knowledge", "everything"] = "history"


@router.post("/history/clear")
def clear_history(body: ClearIn, db: Session = Depends(get_db)):
    """history: workspaces, files, results, drafts, tasks, decisions, AI runs and exports.
    knowledge: saved knowledge and writing profiles. everything: both. Settings and API key are kept."""
    if body.confirm != "DELETE":
        raise err(400, 'Type DELETE to confirm.', "confirm_required")
    removed = {}
    if body.scope in ("history", "everything"):
        for model in (Workspace, Draft, Task, Decision, ModelRun, Export):
            removed[model.__tablename__] = db.query(model).delete()
        db.query(Attachment).delete()
        db.query(Analysis).delete()
        for k in ("chunk", "analysis", "draft"):
            db.execute(text("DELETE FROM search_index WHERE kind=:k"), {"k": k})
        for d in (settings.files_dir, settings.exports_dir):
            for f in d.glob("*"):
                if f.is_file():
                    f.unlink()
    if body.scope in ("knowledge", "everything"):
        removed["knowledge_items"] = db.query(KnowledgeItem).delete()
        removed["writing_profiles"] = db.query(WritingProfile).delete()
        db.execute(text("DELETE FROM search_index WHERE kind='knowledge'"))
    audit(db, "history_cleared", "settings", None, scope=body.scope, removed=removed)
    db.commit()
    return {"removed": removed}


# ---- demonstration data ---------------------------------------------------------------------------

DEMO_DIR = Path(__file__).resolve().parents[3] / "demo-data" / "files"
DEMO_SETS = [
    ("Demo: Revenue recognition email thread", ["email-thread-1.png", "email-thread-2.png", "email-thread-3.png"],
     "Figure out what they want and draft my response."),
    ("Demo: Credit agreement review", ["credit-agreement.pdf"], "Analyze this agreement and identify the important issues."),
    ("Demo: Memo to challenge", ["impairment-memo.docx"], "Challenge the reasoning in this memo."),
    ("Demo: Services agreement comparison", ["services-agreement-v1.docx", "services-agreement-v2.docx"],
     "Compare these two versions and identify every change that matters."),
]


@router.post("/demo/load", status_code=201)
def load_demo(db: Session = Depends(get_db)):
    """Create workspaces pre-loaded with the fictional demonstration files. No AI is called."""
    if not DEMO_DIR.exists():
        raise err(404, "Demonstration files are not installed.", "not_found")
    created = []
    for title, files, suggestion in DEMO_SETS:
        ws = Workspace(title=title, title_is_auto=False, description=f"Suggested request: {suggestion}", tags='["demo"]')
        db.add(ws)
        db.flush()
        for fname in files:
            p = DEMO_DIR / fname
            if not p.exists():
                continue
            data = p.read_bytes()
            dt = detect_type(data, fname)
            att = Attachment(workspace_id=ws.id, original_filename=fname, stored_name=store_bytes(data, dt.ext), kind=dt.kind, mime_type=dt.mime,
                             size_bytes=len(data), checksum_sha256=checksum(data), status="uploaded")
            db.add(att)
            db.flush()
            created.append(att.id)
        sample = DEMO_DIR / "writing-sample.txt"
    if sample.exists() and not db.query(KnowledgeItem).filter_by(title="Demo: writing sample").first():
        k = KnowledgeItem(category="writing_example", title="Demo: writing sample", body=sample.read_text(), tags='["demo"]', provenance="user_fact")
        db.add(k)
        db.flush()
        search.index(db, "knowledge", k.id, None, k.provenance, k.title, k.body, "demo category:writing_example", k.created_at)
    audit(db, "demo_loaded", "workspace", None, files=len(created))
    db.commit()
    for aid in created:
        submit_extraction(aid)
    return {"workspaces": len(DEMO_SETS), "files": len(created)}
