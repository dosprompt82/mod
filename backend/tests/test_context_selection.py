import time

from app.ai import context as ctxmod
from app.db import session
from app.models import Attachment, Workspace
from app.services.extraction import index_attachment_chunks

from .conftest import new_ws, upload, wait_ready

MEMO = "\n\n".join([
    "Technical memorandum: accounting for the Series B convertible notes and detachable warrants.",
    "The Company issued $40 million of convertible notes with detachable warrants. Proceeds were allocated between the notes and the warrants on a relative fair value basis.",
    "The warrants are indexed to the Company's own stock and meet the equity classification conditions, so they are classified in equity.",
    "The resulting discount on the notes is amortized to interest expense using the effective interest method over the five-year term.",
] * 3)

FILLER = ("General discussion of debt accounting for issuers, reviewing classification, presentation and disclosure of borrowings "
          "under various arrangements, with commentary for accounting reviewers on memo preparation and technical review practice. ")


def _guide() -> str:
    paras = []
    for i in range(320):
        if i in (77, 211):
            paras.append(f"Section {i}. Detachable warrants issued with convertible notes: allocate proceeds using relative fair value; "
                         "equity-classified warrants indexed to own stock reduce the carrying amount of the notes, creating a discount. " * 3)
        else:
            paras.append(f"Section {i}. " + FILLER * 9)
    return "\n\n".join(paras)


def test_short_document_sent_in_full_and_guide_excerpts_follow_its_topics(client):
    ws = new_ws(client, "Debt memo review")
    memo = upload(client, raw=[("Series B memo.txt", MEMO.encode())], workspace_id=ws).json()["attachments"][0]
    guide = upload(client, raw=[("Big guide.txt", _guide().encode())], workspace_id=ws).json()["attachments"][0]
    wait_ready(client, memo["id"])
    wait_ready(client, guide["id"])
    db = session()
    try:
        w = db.get(Workspace, ws)
        ctx = ctxmod.build(db, w, "document", "Review this debt memo as a senior technical accounting reviewer.", [memo["id"], guide["id"]])
        texts = "\n".join(p for p in ctx.parts if isinstance(p, str))
        memo_att = db.get(Attachment, memo["id"])
        assert all(c.id in ctx.chunk_labels.values() for c in memo_att.chunks), "the memo must be sent in full"
        assert "Detachable warrants issued with convertible notes" in texts, "guide passages on the memo's topic must be selected"
        assert 'role="reference excerpt"' in texts
        assert ctx.selection["full"] == ["Series B memo.txt"] and ctx.selection["excerpted"] == ["Big guide.txt"]
        assert ctx.selection["chars"] <= ctxmod.TEXT_BUDGET
        assert any("Sent in full: Series B memo.txt" in n for n in ctx.notes)
    finally:
        db.close()


def test_indexing_thousands_of_chunks_is_fast(client):
    a = upload(client, raw=[("huge.txt", ("\n\n".join(f"Paragraph {i}. " + FILLER * 8 for i in range(3000))).encode())]).json()["attachments"][0]
    wait_ready(client, a["id"])
    ws = new_ws(client)
    db = session()
    try:
        att = db.get(Attachment, a["id"])
        assert len(att.chunks) >= 1500
        att.workspace_id = ws
        t0 = time.monotonic()
        index_attachment_chunks(db, att)
        index_attachment_chunks(db, att)  # re-indexing must not duplicate rows
        db.commit()
        assert time.monotonic() - t0 < 20
    finally:
        db.close()
    hits = client.get("/api/search", params={"q": '"Paragraph 2999"', "kinds": "chunk"}).json()["results"]
    assert len(hits) == 1


def test_times_carry_a_timezone(client):
    ws = client.post("/api/workspaces", json={}).json()
    full = client.get(f"/api/workspaces/{ws['id']}").json()
    assert full["created_at"].endswith("+00:00") and full["updated_at"].endswith("+00:00")
