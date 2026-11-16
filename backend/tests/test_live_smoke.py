"""Optional live smoke test against the real Anthropic API. Skipped unless explicitly enabled:

    PS_LIVE_TEST=1 ANTHROPIC_API_KEY=sk-ant-... backend/.venv/bin/python -m pytest tests/test_live_smoke.py -s

It sends a fictional demo screenshot and a fictional PDF excerpt; nothing else."""
import os

import pytest

pytestmark = pytest.mark.skipif(not (os.environ.get("PS_LIVE_TEST") == "1" and os.environ.get("ANTHROPIC_API_KEY")),
                                reason="live test disabled (set PS_LIVE_TEST=1 and ANTHROPIC_API_KEY)")


def test_live_email_and_document(consented, monkeypatch):
    from app.config import settings

    from .conftest import new_ws, upload, wait_run

    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    c = consented
    assert c.post("/api/settings/test-connection").json()["ok"] is True
    ws = new_ws(c)
    ids = [a["id"] for a in upload(c, "email-thread-1.png", "email-thread-2.png").json()["attachments"]]
    run = c.post(f"/api/workspaces/{ws}/runs", json={"instruction": "What do they want, and draft my reply.", "attachment_ids": ids}).json()
    r = wait_run(c, run["run"]["id"], timeout=300)
    assert r["status"] == "succeeded", r
    a = c.get(f"/api/workspaces/{ws}").json()["analyses"][0]
    assert a["structured"] and "60,000" in (a["markdown"] + str(a["content"])), "the model should read the implementation fee from the screenshot"
    print("\nLIVE email asking:", a["content"]["asking"])
    ws2 = new_ws(c)
    att = upload(c, "credit-agreement.pdf").json()["attachments"][0]
    run = c.post(f"/api/workspaces/{ws2}/runs", json={"instruction": "Is the leverage covenant consistent with the Permitted Acquisition definition?",
                                                      "attachment_ids": [att["id"]]}).json()
    r = wait_run(c, run["run"]["id"], timeout=300)
    assert r["status"] == "succeeded", r
    an = c.get(f"/api/workspaces/{ws2}").json()["analyses"][0]
    assert any(s["verification"] == "verified" for s in an["sources"])
    print("LIVE conclusion:", an["content"]["executive_conclusion"], "| tokens", r["input_tokens"], r["output_tokens"], "| cost", r["cost_estimate"])
