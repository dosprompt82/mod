import os
import shutil
import tempfile
import time
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="ps-test-")
os.environ["PS_DATA_DIR"] = _TMP
os.environ["PS_AI_PROVIDER"] = "mock"
os.environ.pop("ANTHROPIC_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from app import db as dbmod  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services import jobs  # noqa: E402

DEMO = Path(__file__).resolve().parents[2] / "demo-data" / "files"
H = {"x-ps-client": "1"}


def _point_settings_at(root: Path) -> None:
    settings.data_dir = root
    settings.files_dir = root / "files"
    settings.exports_dir = root / "exports"
    settings.backups_dir = root / "backups"
    settings.db_path = root / "superpower.db"
    settings.secrets_path = root / "secrets.json"
    dbmod.reset_engine()


@pytest.fixture()
def client():
    root = Path(tempfile.mkdtemp(prefix="ps-case-", dir=_TMP))
    _point_settings_at(root)
    settings.ai_provider = "mock"
    with TestClient(app, headers=H) as c:
        yield c
    jobs.wait_idle()
    dbmod.reset_engine()
    shutil.rmtree(root, ignore_errors=True)


@pytest.fixture()
def consented(client):
    assert client.post("/api/settings/consent", json={"accepted": True}).status_code == 200
    return client


def wait_run(client, run_id, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        r = client.get(f"/api/runs/{run_id}").json()
        if r["status"] not in ("queued", "running"):
            return r
        time.sleep(0.05)
    raise AssertionError("run did not finish")


def wait_ready(client, att_id, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        a = client.get(f"/api/attachments/{att_id}").json()
        if a["status"] not in ("uploaded", "extracting"):
            return a
        time.sleep(0.05)
    raise AssertionError("extraction did not finish")


def upload(client, *names, workspace_id=None, raw=None):
    files = []
    for n in names:
        files.append(("files", (n, (DEMO / n).read_bytes())))
    for n, data in (raw or []):
        files.append(("files", (n, data)))
    data = {"workspace_id": workspace_id} if workspace_id else {}
    return client.post("/api/attachments", files=files, data=data)


def new_ws(client, title=None):
    return client.post("/api/workspaces", json={"title": title} if title else {}).json()["id"]
