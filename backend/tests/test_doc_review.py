import copy
import io

import docx
from docx.oxml.ns import qn

from .conftest import new_ws, upload, wait_ready, wait_run

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _memo_with_comment_and_tracked_changes() -> bytes:
    d = docx.Document()
    d.add_heading("Issue #12: Listing Failure Step-Up Feature", 1)
    p = d.add_paragraph("The step-up is an embedded derivative ")
    # Tracked insertion: <w:ins><w:r><w:t>that is immaterial</w:t></w:r></w:ins>
    ins = p._p.makeelement(qn("w:ins"), {qn("w:id"): "1", qn("w:author"): "Preparer", qn("w:date"): "2026-11-15T00:00:00Z"})
    run = copy.deepcopy(p.runs[0]._r)
    run.find(qn("w:t")).text = "that is immaterial"
    ins.append(run)
    p._p.append(ins)
    # Tracked deletion: <w:del><w:r><w:delText>and must be bifurcated</w:delText></w:r></w:del>
    dele = p._p.makeelement(qn("w:del"), {qn("w:id"): "2", qn("w:author"): "Preparer"})
    drun = copy.deepcopy(p.runs[0]._r)
    t = drun.find(qn("w:t"))
    t.tag = qn("w:delText")
    t.text = " and must be bifurcated"
    dele.append(drun)
    p._p.append(dele)
    p2 = d.add_paragraph("The bonds were issued at par.")
    d.add_comment(p2.runs, text="What was the actual issue price?", author="Reviewer A")
    t = d.add_table(rows=2, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text = "Feature", "Premium"
    t.cell(1, 0).text, t.cell(1, 1).text = "Make-whole", "5.50%"
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_word_comments_and_tracked_changes_are_extracted(client):
    a = upload(client, raw=[("West Lake memo.docx", _memo_with_comment_and_tracked_changes())]).json()["attachments"][0]
    a = wait_ready(client, a["id"])
    meta = a["doc_meta"]
    assert meta["comments"] == 1 and meta["comment_authors"] == ["Reviewer A"]
    assert meta["tracked_insertions"] == 1 and meta["tracked_deletions"] == 1 and meta["tracked_change_authors"] == ["Preparer"]
    text = client.get(f"/api/attachments/{a['id']}/text").json()
    body = "\n".join(c["text"] for c in text["chunks"] if c["text_source"] == "extracted")
    assert "embedded derivative that is immaterial" in body  # insertion kept (accepted view)
    assert "must be bifurcated" not in body  # deletion excluded
    assert "Make-whole | 5.50%" in body
    comments = [c for c in text["chunks"] if c["text_source"] == "comments"]
    assert len(comments) == 1 and "Reviewer A" in comments[0]["text"] and "issue price" in comments[0]["text"]
    assert "issued at par" in comments[0]["text"]  # anchored paragraph


def test_document_review_produces_the_review_format(consented):
    c = consented
    ws = new_ws(c)
    a = upload(c, raw=[("West Lake memo.docx", _memo_with_comment_and_tracked_changes())]).json()["attachments"][0]
    out = c.post(f"/api/workspaces/{ws}/runs", json={"instruction": "Review this debt memo as a senior technical accounting reviewer.",
                                                     "attachment_ids": [a["id"]]}).json()
    assert out["steps"] == ["doc_review"]
    run = wait_run(c, out["run"]["id"])
    assert run["status"] == "succeeded", run
    an = c.get(f"/api/workspaces/{ws}").json()["analyses"][0]
    assert an["workflow"] == "doc_review"
    content = an["content"]
    assert content["score"] == 6.5 and content["findings"][0]["id"] == "P1" and content["key_questions"]
    md = an["markdown"]
    for heading in ("## 1. Score: 6.5/10", "## 2. Elevator pitch", "## 3. Key questions and conclusions", "## 4. Issues by tier",
                    "### Primary", "### Secondary", "## 5. Paste-ready comments", "| Issue | Memo conclusion | My view |"):
        assert heading in md, heading
    # The export carries the same structure
    e = c.post("/api/exports", json={"source_type": "analysis", "source_id": an["id"], "format": "docx"}).json()
    doc = docx.Document(io.BytesIO(c.get(e["url"]).content))
    paras = [p.text for p in doc.paragraphs]
    assert "1. Score: 6.5/10" in paras and "5. Paste-ready comments" in paras and doc.tables


def test_review_context_lists_documents_comments_and_tracked_changes(consented, monkeypatch):
    from app.ai import mock

    seen = {}
    orig = mock.respond

    def spy(req):
        seen.setdefault(req.workflow, "\n".join(p for p in req.parts if isinstance(p, str)))
        return orig(req)

    monkeypatch.setattr(mock, "respond", spy)
    c = consented
    ws = new_ws(c)
    a = upload(c, raw=[("West Lake memo.docx", _memo_with_comment_and_tracked_changes())]).json()["attachments"][0]
    run = c.post(f"/api/workspaces/{ws}/runs", json={"action": "review_document", "attachment_ids": [a["id"]]}).json()
    wait_run(c, run["run"]["id"])
    ctx = seen["doc_review"]
    assert "<documents>" in ctx and "1 Word comment (by Reviewer A)" in ctx and "tracked changes: 1 insertion(s), 1 deletion(s)" in ctx
    assert 'origin="Word comment in the document"' in ctx


def test_routing_for_reviews():
    from app.ai.workflows import plan

    assert plan("Review this debt memo as a senior technical accounting reviewer.", None, None, True, False, False) == ["doc_review"]
    assert plan("Review this memo, then challenge your own conclusions.", None, None, True, False, False) == ["doc_review", "review"]
    assert plan("Give me review comments on the attached report", None, None, True, False, False) == ["doc_review"]
    assert plan("anything", "review_document", None, True, False, False) == ["doc_review"]
    assert plan("Summarize this agreement.", None, None, True, False, False) == ["document"]
    assert plan("Review this memo", None, None, False, False, False) != ["doc_review"]  # nothing attached
