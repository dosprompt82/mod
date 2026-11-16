import io
import zipfile

import docx

from app.config import settings
from app.security import UnsafePathError, safe_join, sanitize_filename, slugify_title
from app.services.storage import UploadError, detect_type

from .conftest import upload, wait_ready, new_ws


def test_workspace_crud(client):
    r = client.post("/api/workspaces", json={})
    assert r.status_code == 201
    ws = r.json()
    assert ws["title"] == "Untitled workspace" and ws["status"] == "active"
    r = client.patch(f"/api/workspaces/{ws['id']}", json={"title": "Lease question", "status": "waiting", "tags": ["Leases", " leases ", "q1"]})
    assert r.json()["title"] == "Lease question" and r.json()["status"] == "waiting" and r.json()["tags"] == ["Leases", "leases", "q1"]
    assert client.patch(f"/api/workspaces/{ws['id']}", json={"status": "bogus"}).status_code == 422
    listed = client.get("/api/workspaces").json()["workspaces"]
    assert any(w["id"] == ws["id"] for w in listed)
    assert client.get("/api/workspaces?status=waiting").json()["workspaces"][0]["id"] == ws["id"]
    assert client.delete(f"/api/workspaces/{ws['id']}").status_code == 400  # needs confirmation
    assert client.delete(f"/api/workspaces/{ws['id']}?confirm=true").status_code == 200
    assert client.get(f"/api/workspaces/{ws['id']}").status_code == 404


def test_upload_multiple_and_extract(client):
    r = upload(client, "credit-agreement.pdf", "impairment-memo.docx", "email-thread-1.png", "writing-sample.txt")
    assert r.status_code == 201, r.text
    atts = {a["filename"]: a for a in r.json()["attachments"]}
    assert set(atts) == {"credit-agreement.pdf", "impairment-memo.docx", "email-thread-1.png", "writing-sample.txt"}
    pdf = wait_ready(client, atts["credit-agreement.pdf"]["id"])
    assert pdf["status"] == "ready" and pdf["page_count"] == 5 and pdf["vision_pages"] == 1  # last page is image-only
    text = client.get(f"/api/attachments/{pdf['id']}/text").json()
    pages = {p["page"]: p for p in text["pages"]}
    assert "3.50 to 1.00" in pages[3]["text"] and pages[5]["needs_vision"] is True
    chunk = next(c for c in text["chunks"] if "3.50 to 1.00" in c["text"])
    assert chunk["page"] == 3 and "FINANCIAL COVENANTS" in (chunk["section"] or "")
    d = wait_ready(client, atts["impairment-memo.docx"]["id"])
    assert d["status"] == "ready"
    dtext = client.get(f"/api/attachments/{d['id']}/text").json()
    assert any(c["section"] == "Analysis" and "9.0x" in c["text"] for c in dtext["chunks"])
    img = wait_ready(client, atts["email-thread-1.png"]["id"])
    assert img["status"] == "needs_vision" and img["width"] == 1100
    txt = wait_ready(client, atts["writing-sample.txt"]["id"])
    assert txt["status"] == "ready" and txt["text_chars"] > 500


def test_docx_tables_extracted(client):
    a = upload(client, "services-agreement-v2.docx").json()["attachments"][0]
    wait_ready(client, a["id"])
    chunks = client.get(f"/api/attachments/{a['id']}/text").json()["chunks"]
    assert any("Premium support | $3,000" in c["text"] for c in chunks)


def test_content_type_validation():
    assert detect_type(b"%PDF-1.7 ...", "x.pdf").kind == "pdf"
    assert detect_type(b"\x89PNG\r\n\x1a\n....", "shot").kind == "image"
    for data, name in [(b"hello", "fake.pdf"), (b"MZ\x90\x00binary", "tool.exe"), (b"abc\x00def", "notes.txt"), (b"PK\x03\x04junk", "x.docx")]:
        try:
            detect_type(data, name)
        except UploadError:
            continue
        raise AssertionError(f"{name} should be rejected")


def test_upload_rejections(client, monkeypatch):
    r = upload(client, raw=[("fake.pdf", b"not really a pdf")])
    assert r.status_code == 400 and "don't match" in r.json()["detail"]["message"]
    r = upload(client, raw=[("virus.exe", b"MZ\x90\x00")])
    assert r.status_code == 400 and "Unsupported" in r.json()["detail"]["message"]
    monkeypatch.setattr(settings, "max_upload_bytes", 1000)
    r = upload(client, "credit-agreement.pdf")
    assert r.status_code == 400 and "larger than" in r.json()["detail"]["message"]
    monkeypatch.undo()
    # Partial success reports per-file errors.
    r = upload(client, "writing-sample.txt", raw=[("bad.png", b"nope")])
    assert r.status_code == 201 and len(r.json()["attachments"]) == 1 and len(r.json()["errors"]) == 1


def test_filename_sanitization_and_storage(client):
    r = upload(client, raw=[("../../etc/passwd.txt", b"hello world " * 10)])
    a = r.json()["attachments"][0]
    assert a["filename"] == "passwd.txt"
    stored = list(settings.files_dir.iterdir())
    assert all(p.parent == settings.files_dir for p in stored) and not any("passwd" in p.name for p in stored)
    assert sanitize_filename('a<b>:"c|?*.pdf') == "abc.pdf"
    assert sanitize_filename("CON.txt").startswith("_")
    assert slugify_title("Memo: Q4 / Impairment — Draft!") == "memo-q4-impairment-draft"


def test_path_traversal_protection(client):
    for bad in ("../secrets.json", "..", "a/b.png", ".hidden", ""):
        try:
            safe_join(settings.files_dir, bad)
        except UnsafePathError:
            continue
        raise AssertionError(bad)
    assert client.get("/api/attachments/..%2F..%2Fsecrets.json/content").status_code == 404
    assert client.get("/api/exports/..%2Fsuperpower.db/download").status_code == 404
    assert client.get("/api/backups/..%2Fsuperpower.db/download").status_code == 404


def test_duplicates_and_preview(client):
    a1 = upload(client, "email-thread-1.png").json()["attachments"][0]
    a2 = upload(client, "email-thread-1.png").json()["attachments"][0]
    assert a2["duplicate_of"] == a1["id"]
    r = client.get(f"/api/attachments/{a1['id']}/content")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff" and "sandbox" in r.headers["content-security-policy"]
    d = upload(client, "impairment-memo.docx").json()["attachments"][0]
    assert client.get(f"/api/attachments/{d['id']}/content").headers["content-disposition"].startswith("attachment")


def test_delete_attachment_removes_file(client):
    a = upload(client, "writing-sample.txt").json()["attachments"][0]
    wait_ready(client, a["id"])
    before = len(list(settings.files_dir.iterdir()))
    assert client.delete(f"/api/attachments/{a['id']}").status_code == 200
    assert len(list(settings.files_dir.iterdir())) == before - 1
    assert client.get(f"/api/attachments/{a['id']}").status_code == 404


def test_workspace_delete_removes_files_and_export(consented):
    c = consented
    ws = new_ws(c, "Agreement")
    a = upload(c, "credit-agreement.pdf", workspace_id=ws).json()["attachments"][0]
    wait_ready(c, a["id"])
    r = c.get(f"/api/workspaces/{ws}/export")
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert "workspace.json" in z.namelist() and any(n.endswith("credit-agreement.pdf") for n in z.namelist())
    assert c.delete(f"/api/workspaces/{ws}?confirm=true").status_code == 200
    assert not any(settings.files_dir.iterdir())


def test_damaged_files_fail_honestly(client):
    import io as _io

    bad_pdf = b"%PDF-1.4\n%garbage that is not a pdf body"
    a = upload(client, raw=[("broken.pdf", bad_pdf)]).json()["attachments"][0]
    a = wait_ready(client, a["id"])
    assert a["status"] == "failed" and a["error"]
    buf = _io.BytesIO()
    docx.Document().save(buf)
    e = upload(client, raw=[("empty.docx", buf.getvalue())]).json()["attachments"][0]
    e = wait_ready(client, e["id"])
    assert e["status"] == "failed" and "no text" in e["error"]
