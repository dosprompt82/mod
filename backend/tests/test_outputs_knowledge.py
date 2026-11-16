import io
import shutil
import subprocess
import tempfile
from pathlib import Path

import docx
import pymupdf
import pytest

from .conftest import new_ws, upload, wait_ready, wait_run


def test_draft_persistence_and_versions(client):
    d = client.post("/api/drafts", json={"title": "Board update", "kind": "memo", "body": "## Summary\n\nFirst version."}).json()
    assert d["current_version"] == 1 and d["versions"][0]["author"] == "user"
    d2 = client.put(f"/api/drafts/{d['id']}", json={"body": "## Summary\n\nSecond version."}).json()
    assert d2["current_version"] == 2 and d2["body"].endswith("Second version.")
    same = client.put(f"/api/drafts/{d['id']}", json={"body": "## Summary\n\nSecond version.", "title": "Board update (final)"}).json()
    assert same["current_version"] == 2 and same["title"] == "Board update (final)"  # no-op edit creates no version
    restored = client.post(f"/api/drafts/{d['id']}/restore/1").json()
    assert restored["current_version"] == 3 and restored["body"].endswith("First version.")
    assert [v["note"] for v in restored["versions"]] == ["Created", "Edited", "Restored version 1"]
    assert client.get("/api/drafts?q=Board").json()["drafts"][0]["id"] == d["id"]
    assert client.put(f"/api/drafts/{d['id']}", json={"status": "final"}).json()["status"] == "final"
    assert client.delete(f"/api/drafts/{d['id']}").status_code == 200
    assert client.get(f"/api/drafts/{d['id']}").status_code == 404


def test_draft_persists_across_restart(client):
    from fastapi.testclient import TestClient

    from app import db as dbmod
    from app.main import app

    d = client.post("/api/drafts", json={"title": "Persist me", "kind": "email", "subject": "Hi", "body": "Body"}).json()
    dbmod.reset_engine()  # simulate a restart: new engine, same database file
    with TestClient(app, headers={"x-ps-client": "1"}) as c2:
        assert c2.get(f"/api/drafts/{d['id']}").json()["body"] == "Body"


MEMO = "**To:** [Recipient]  \n**From:** [Your name]\n\n## Executive summary\n\nThe covenant **likely** fails.\n\n## Analysis\n\n- Leverage 3.75x\n- Cap 3.50x\n\n| Test | Result |\n|---|---|\n| Leverage | Fail |\n"


@pytest.mark.parametrize("fmt", ["docx", "pdf", "md", "txt"])
def test_export_draft_formats(client, fmt):
    d = client.post("/api/drafts", json={"title": "Covenant: Q4 / Memo", "kind": "memo", "body": MEMO}).json()
    r = client.post("/api/exports", json={"source_type": "draft", "source_id": d["id"], "format": fmt})
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["filename"].startswith("covenant-q4-memo-") and e["filename"].endswith(f".{fmt}")
    f = client.get(e["url"])
    assert f.status_code == 200 and len(f.content) == e["size_bytes"]
    if fmt == "docx":
        doc = docx.Document(io.BytesIO(f.content))
        texts = [p.text for p in doc.paragraphs]
        assert texts[0] == "Covenant: Q4 / Memo"
        assert "1. Executive summary" in texts and "2. Analysis" in texts  # memos get numbered sections
        assert doc.tables and doc.tables[0].cell(1, 1).text == "Fail"
        assert any(p.style.name == "List Bullet" for p in doc.paragraphs)
    elif fmt == "pdf":
        with pymupdf.open(stream=f.content, filetype="pdf") as pdf:
            text = pdf[0].get_text()
        assert "Covenant: Q4 / Memo" in text and "Executive summary" in text
    else:
        body = f.content.decode()
        assert "Covenant: Q4 / Memo" in body and ("EXECUTIVE SUMMARY" in body if fmt == "txt" else "## Executive summary" in body)


@pytest.mark.skipif(not shutil.which("soffice"), reason="LibreOffice not installed")
def test_docx_opens_in_libreoffice(client):
    d = client.post("/api/drafts", json={"title": "LibreOffice check", "kind": "memo", "body": MEMO}).json()
    e = client.post("/api/exports", json={"source_type": "draft", "source_id": d["id"], "format": "docx"}).json()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.docx"
        src.write_bytes(client.get(e["url"]).content)
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, str(src)], check=True, timeout=120,
                       capture_output=True)
        assert (Path(tmp) / "in.pdf").stat().st_size > 1000


def test_export_email_and_analysis_and_review(consented):
    c = consented
    ws = new_ws(c)
    a = upload(c, "credit-agreement.pdf").json()["attachments"][0]
    run = c.post(f"/api/workspaces/{ws}/runs", json={"instruction": "Analyze this and challenge your conclusion", "attachment_ids": [a["id"]]}).json()
    wait_run(c, run["run"]["id"])
    w = c.get(f"/api/workspaces/{ws}").json()
    an, rv = w["analyses"][0], w["reviews"][0]
    e = c.post("/api/exports", json={"source_type": "analysis", "source_id": an["id"], "format": "docx"}).json()
    doc = docx.Document(io.BytesIO(c.get(e["url"]).content))
    assert any("credit-agreement.pdf, p." in p.text for p in doc.paragraphs)  # source references survive export
    e2 = c.post("/api/exports", json={"source_type": "review", "source_id": rv["id"], "format": "md"}).json()
    assert "Critical review" in c.get(e2["url"]).text
    em = c.post("/api/drafts", json={"title": "Reply", "kind": "email", "subject": "Re: Q", "body": "Hi Dana,\nLine two.\n\nBest,\nJ"}).json()
    e3 = c.post("/api/exports", json={"source_type": "draft", "source_id": em["id"], "format": "txt"}).json()
    txt = c.get(e3["url"]).text
    assert "Subject: Re: Q" in txt and "Hi Dana,\nLine two." in txt
    assert c.post("/api/exports", json={"source_type": "draft", "source_id": "nope", "format": "docx"}).status_code == 404


# ---- knowledge & search -------------------------------------------------------------------------

def test_knowledge_crud_search_export(client):
    k = client.post("/api/knowledge", json={"title": "Materiality threshold", "body": "Our working materiality is 5% of pre-tax income.",
                                             "category": "reference", "tags": ["Audit", "materiality"]}).json()
    assert k["provenance"] == "user_fact" and k["tags"] == ["audit", "materiality"]
    client.post("/api/knowledge", json={"title": "Tone preference", "body": "Prefer direct, short emails.", "category": "preference"})
    res = client.get("/api/search?q=materiality").json()["results"]
    assert res[0]["id"] == k["id"] and "[[" in res[0]["excerpt"]
    assert client.get('/api/search?q="pre-tax income"').json()["results"][0]["id"] == k["id"]  # phrase
    assert client.get("/api/search?q=threshold").json()["results"][0]["title"] == "Materiality threshold"  # title
    assert client.get("/api/search?q=&tag=audit&kinds=knowledge").json()["results"][0]["id"] == k["id"]  # tag filter only
    assert client.get("/api/search?q=materiality&date_from=2999-01-01").json()["results"] == []
    assert client.get("/api/knowledge?category=preference").json()["items"][0]["title"] == "Tone preference"
    upd = client.patch(f"/api/knowledge/{k['id']}", json={"body": "Working materiality is 4% of pre-tax income."}).json()
    assert "4%" in upd["body"]
    assert client.get("/api/search?q=4%25").status_code == 200
    j = client.get("/api/knowledge/export?format=json")
    assert j.status_code == 200 and len(j.json()["items"]) == 2
    md = client.get("/api/knowledge/export?format=md").text
    assert "## Materiality threshold" in md
    assert client.delete(f"/api/knowledge/{k['id']}").status_code == 200
    assert client.get("/api/search?q=materiality&kinds=knowledge").json()["results"] == []


@pytest.mark.parametrize("q", ['AND OR NOT', '"unterminated', "NEAR(a b)", "*", "a:b c^d", "'; DROP TABLE workspaces; --", "((()))"])
def test_search_handles_hostile_queries(client, q):
    r = client.get("/api/search", params={"q": q})
    assert r.status_code == 200 and isinstance(r.json()["results"], list)


def test_documents_searchable_with_page_refs(consented):
    c = consented
    ws = new_ws(c, "Credit facility")
    a = upload(c, "credit-agreement.pdf").json()["attachments"][0]
    wait_ready(c, a["id"])
    run = c.post(f"/api/workspaces/{ws}/runs", json={"instruction": "Summarize", "attachment_ids": [a["id"]]}).json()
    wait_run(c, run["run"]["id"])
    hits = c.get("/api/search?q=commitment fee&kinds=chunk").json()["results"]
    assert hits and hits[0]["page"] == 2 and hits[0]["workspace_title"] and hits[0]["doctype"] == "pdf"
    assert c.get("/api/search?q=commitment&doctype=docx").json()["results"] == []
    assert any(h["kind"] == "analysis" for h in c.get("/api/search?q=Mock").json()["results"])
    # Relaxed matching for natural questions
    r = c.get("/api/search", params={"q": "what is the commitment fee percentage"}).json()
    assert r["results"] and r["relaxed"] is True


def test_save_result_to_knowledge_marks_provenance(consented):
    c = consented
    ws = new_ws(c)
    run = c.post(f"/api/workspaces/{ws}/runs", json={"instruction": "Is a renewal option a modification?"}).json()
    wait_run(c, run["run"]["id"])
    an = c.get(f"/api/workspaces/{ws}").json()["analyses"][0]
    k = c.post("/api/knowledge/from-result", json={"source_type": "analysis", "source_id": an["id"]}).json()
    assert k["provenance"] == "user_approved" and k["source_ref"]["origin"] == "ai_generated" and k["category"] == "previous_analysis"
    assert c.get(f"/api/analyses/{an['id']}").json()["approved"] is True


def test_no_platform_specific_date_formats():
    """'%-d' style strftime flags crash on Windows."""
    import pathlib
    import re

    app = pathlib.Path(__file__).resolve().parents[1] / "app"
    offenders = [str(p) for p in app.rglob("*.py") if re.search(r"strftime\([^)]*%-", p.read_text())]
    assert offenders == []
