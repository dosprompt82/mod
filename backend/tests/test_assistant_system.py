import io
import json
import os
import stat
import zipfile
from datetime import date, timedelta

from app.config import settings

from .conftest import new_ws, upload, wait_ready, wait_run


def test_tasks_decisions_and_grounded_briefs(client):
    empty = client.get("/api/assistant/brief?question=today").json()
    assert empty["items"] == [] and "Nothing is open" in empty["headline"]
    ws = new_ws(client, "Brightline")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    t1 = client.post("/api/tasks", json={"title": "Send revenue view to Dana", "kind": "respond", "due_date": yesterday, "workspace_id": ws}).json()
    client.post("/api/tasks", json={"title": "Signed engagement letter", "kind": "waiting_on", "owner": "Marcus"})
    client.post("/api/tasks", json={"title": "Board deck review", "due_date": "by Friday", "source": "extracted", "source_excerpt": "by Friday"})
    client.post("/api/decisions", json={"title": "Recognize implementation fee upfront?", "options": ["Upfront", "Over term"], "workspace_id": ws})
    today = client.get("/api/assistant/brief?question=today").json()
    assert today["items"][0]["id"] == t1["id"] and today["items"][0]["reason"].startswith("Overdue")
    assert any(i["reason"] == "Deadline as stated: “by Friday”" for i in today["items"])
    waiting = client.get("/api/assistant/brief?question=waiting").json()
    assert len(waiting["items"]) == 1 and waiting["items"][0]["reason"] == "Waiting on Marcus"
    respond = client.get("/api/assistant/brief?question=respond").json()
    assert respond["items"][0]["workspace_title"] == "Brightline"
    dec = client.get("/api/assistant/brief?question=decisions").json()
    assert len(dec["items"]) == 1
    did = dec["items"][0]["id"]
    assert client.patch(f"/api/decisions/{did}", json={"status": "decided", "outcome": "Over the term"}).json()["decided_at"]
    assert client.patch(f"/api/tasks/{t1['id']}", json={"status": "done"}).json()["completed_at"]
    s = client.get("/api/assistant/summary?period=week").json()
    assert any("1 completed" in line for line in s["lines"]) and any("1 made" in line for line in s["lines"])
    assert client.post("/api/tasks", json={"title": "x", "workspace_id": "missing"}).status_code == 404


def test_settings_and_api_key_never_returned(client):
    s = client.get("/api/settings").json()
    assert s["ai"]["key_configured"] is False and s["storage"]["data_dir"]
    key = "sk-ant-api03-" + "A" * 40 + "WXYZ"
    r = client.put("/api/settings/api-key", json={"api_key": key}).json()
    assert r["key_masked"] == "sk-ant-…WXYZ"
    full = client.get("/api/settings").text
    assert key not in full and "AAAA" not in full
    mode = stat.S_IMODE(os.stat(settings.secrets_path).st_mode)
    assert mode == 0o600
    assert key not in json.dumps(client.get("/api/audit").json())
    import logging
    from logging.handlers import RotatingFileHandler

    for h in logging.getLogger().handlers:
        if isinstance(h, RotatingFileHandler) and os.path.exists(h.baseFilename):
            h.flush()
            assert key not in open(h.baseFilename, encoding="utf-8").read()
    assert client.put("/api/settings/api-key", json={"api_key": "short"}).status_code == 400
    assert client.put("/api/settings/api-key", json={"api_key": None}).json()["key_configured"] is False
    assert client.put("/api/settings", json={"model": "claude-sonnet-5-5", "tone": "warm", "theme": "dark"}).json()["ai"]["model"] == "claude-sonnet-5-5"
    assert client.put("/api/settings", json={"model": "bad model!"}).status_code == 400
    assert client.put("/api/settings", json={"tone": "sarcastic"}).status_code == 422
    assert client.post("/api/settings/test-connection").json()["provider"] == "mock"
    assert client.get("/api/diagnostics").json()["database_check"] == "ok"


def test_csrf_and_host_protection(client):
    from fastapi.testclient import TestClient

    from app.main import app

    bare = TestClient(app)
    assert bare.post("/api/workspaces", json={}).status_code == 403
    assert bare.get("/api/health").status_code == 200
    evil = TestClient(app, base_url="http://attacker.example", headers={"x-ps-client": "1"})
    assert evil.get("/api/health").status_code == 400
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404 and r.json()["detail"]["code"] == "not_found"


def test_backup_and_restore_roundtrip(client):
    ws = new_ws(client, "Keep me")
    a = upload(client, "writing-sample.txt", workspace_id=ws).json()["attachments"][0]
    wait_ready(client, a["id"])
    b = client.post("/api/backups").json()
    assert b["name"].startswith("backup-") and client.get("/api/backups").json()["backups"][0]["name"] == b["name"]
    data = client.get(f"/api/backups/{b['name']}/download").content
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert "superpower.db" in names and not any("secrets" in n for n in names)
    client.delete(f"/api/workspaces/{ws}?confirm=true")
    assert client.get(f"/api/workspaces/{ws}").status_code == 404
    r = client.post("/api/backups/restore", files={"file": ("b.zip", data)})
    assert r.status_code == 200, r.text
    assert r.json()["safety_backup"].endswith("pre-restore.zip")
    assert client.get(f"/api/workspaces/{ws}").json()["title"] == "Keep me"
    assert client.get(f"/api/attachments/{a['id']}/content").status_code == 200


def test_restore_rejects_malicious_archives(client):
    for members in ({"manifest.json": '{"app": "Personal Superpower"}', "superpower.db": "x", "../../evil.sh": "rm -rf /"},
                    {"manifest.json": '{"app": "Other"}', "superpower.db": "x"},
                    {"superpower.db": "x"}):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for k, v in members.items():
                z.writestr(k, v)
        r = client.post("/api/backups/restore", files={"file": ("b.zip", buf.getvalue())})
        assert r.status_code == 400
    assert client.post("/api/backups/restore", files={"file": ("b.zip", b"not a zip")}).status_code == 400


def test_clear_history_requires_confirmation(consented):
    c = consented
    ws = new_ws(c)
    a = upload(c, "writing-sample.txt", workspace_id=ws).json()["attachments"][0]
    wait_ready(c, a["id"])
    c.post("/api/knowledge", json={"title": "Keep", "body": "Knowledge survives a history clear."})
    assert c.post("/api/history/clear", json={"confirm": "yes"}).status_code == 400
    r = c.post("/api/history/clear", json={"confirm": "DELETE"}).json()
    assert r["removed"]["workspaces"] == 1
    assert c.get("/api/workspaces").json()["workspaces"] == [] and not any(settings.files_dir.iterdir())
    assert len(c.get("/api/knowledge").json()["items"]) == 1
    c.post("/api/history/clear", json={"confirm": "DELETE", "scope": "knowledge"})
    assert c.get("/api/knowledge").json()["items"] == []


def test_demo_loader(client):
    r = client.post("/api/demo/load").json()
    assert r["workspaces"] == 4 and r["files"] == 7
    titles = [w["title"] for w in client.get("/api/workspaces").json()["workspaces"]]
    assert "Demo: Credit agreement review" in titles


def test_restart_marks_interrupted_runs(consented):
    from fastapi.testclient import TestClient

    from app import db as dbmod
    from app.db import session
    from app.main import app
    from app.models import ModelRun

    db = session()
    db.add(ModelRun(workflow="reasoning", provider="mock", model="m", status="running"))
    db.commit()
    db.close()
    dbmod.reset_engine()
    with TestClient(app, headers={"x-ps-client": "1"}) as c2:
        runs = c2.get("/api/runs").json()["runs"]
        assert runs[0]["status"] == "failed" and "restarted" in runs[0]["error"]


def test_usage_tracking(consented):
    ws = new_ws(consented)
    run = consented.post(f"/api/workspaces/{ws}/runs", json={"instruction": "Explain"}).json()
    wait_run(consented, run["run"]["id"])
    u = consented.get("/api/usage").json()
    assert u["total_runs"] == 1 and u["by_model"][0]["input_tokens"] > 0


def test_older_version_refuses_newer_data(client):
    import pytest

    from app import db as dbmod
    from app.db import NewerDataError, engine
    from sqlalchemy import text

    with engine().begin() as conn:
        conn.execute(text("INSERT INTO schema_version(version, description) VALUES (999, 'from the future')"))
    with pytest.raises(NewerDataError, match="newer version"):
        dbmod.migrate()
    # A backup containing that data is refused too, before anything is replaced.
    from app.services import backup as backups

    data = backups.create_backup().read_bytes()
    with engine().begin() as conn:
        conn.execute(text("DELETE FROM schema_version WHERE version = 999"))
    with pytest.raises(backups.BackupError, match="newer version"):
        backups.restore_backup(data)
