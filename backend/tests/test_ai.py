import json
import threading
import time
from types import SimpleNamespace

import httpx2
import pytest

import anthropic
from app.ai import mock
from app.ai.provider import AIError, AIRequest, AnthropicProvider, CancelledRun, ImagePart, MockProvider
from app.ai.workflows import extract_json, ParseError, plan, quote_in
from app.config import settings

from .conftest import new_ws, upload, wait_ready, wait_run


def start(c, ws, **body):
    r = c.post(f"/api/workspaces/{ws}/runs", json=body)
    assert r.status_code == 202, r.text
    return r.json()


# ---- gating ---------------------------------------------------------------------------

def test_consent_required_before_any_ai(client):
    ws = new_ws(client)
    r = client.post(f"/api/workspaces/{ws}/runs", json={"instruction": "Hello"})
    assert r.status_code == 412 and r.json()["detail"]["code"] == "consent_required"


def test_upload_alone_never_calls_ai(client, monkeypatch):
    called = []
    monkeypatch.setattr(MockProvider, "complete", lambda *a, **k: called.append(1))
    a = upload(client, "credit-agreement.pdf").json()["attachments"][0]
    wait_ready(client, a["id"])
    assert called == []


def test_missing_api_key_is_reported(consented, monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    ws = new_ws(consented)
    r = consented.post(f"/api/workspaces/{ws}/runs", json={"instruction": "Hello"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "not_configured"


# ---- P0 flows ------------------------------------------------------------------------------

def test_email_screenshots_to_draft(consented):
    c = consented
    ws = new_ws(c)
    ids = [a["id"] for a in upload(c, "email-thread-1.png", "email-thread-2.png", "email-thread-3.png").json()["attachments"]]
    out = start(c, ws, instruction="What do they actually want from me, and how should I respond?", attachment_ids=ids)
    assert out["steps"] == ["email"]
    run = wait_run(c, out["run"]["id"])
    assert run["status"] == "succeeded", run
    w = c.get(f"/api/workspaces/{ws}").json()
    assert len(w["attachments"]) == 3 and w["title"] != "Untitled workspace"
    a = w["analyses"][0]
    assert a["workflow"] == "email" and a["content"]["draft_body"] and a["provider"] == "mock"
    d = c.get(f"/api/drafts/{a['content']['draft_id']}").json()
    assert d["kind"] == "email" and d["body"] == a["content"]["draft_body"]
    # The vision transcription is stored (clearly marked) so follow-ups need not resend images.
    t = c.get(f"/api/attachments/{ids[0]}/text").json()
    assert any(p["text_source"] == "vision" for p in t["pages"]) and t["attachment"]["status"] == "ready"
    roles = [m["role"] for m in w["messages"]]
    assert roles == ["user", "assistant"]


def test_document_analysis_with_verified_sources(consented):
    c = consented
    ws = new_ws(c)
    a = upload(c, "credit-agreement.pdf").json()["attachments"][0]
    out = start(c, ws, instruction="Summarize this agreement.", attachment_ids=[a["id"]])
    assert out["steps"] == ["document"]
    run = wait_run(c, out["run"]["id"])
    assert run["status"] == "succeeded" and run["input_tokens"] > 0
    an = c.get(f"/api/workspaces/{ws}").json()["analyses"][0]
    assert an["sources"], "mock cites the opening sentence of each source"
    for s in an["sources"]:
        assert s["verification"] == "verified" and s["filename"] == "credit-agreement.pdf" and s["page"] >= 1
    assert "## Executive conclusion" in an["markdown"] and "## Supporting sources" in an["markdown"]


def test_unverifiable_quote_is_flagged_not_trusted(consented, monkeypatch):
    orig = mock.respond

    def bad(req):
        req.meta["mock_bad_quote"] = True
        return orig(req)

    monkeypatch.setattr(mock, "respond", bad)
    c = consented
    ws = new_ws(c)
    a = upload(c, "impairment-memo.docx").json()["attachments"][0]
    run = wait_run(c, start(c, ws, instruction="Analyze this memo", attachment_ids=[a["id"]])["run"]["id"])
    an = c.get(f"/api/workspaces/{ws}").json()["analyses"][0]
    bad_refs = [s for s in an["sources"] if s["verification"] == "unverified"]
    assert run["status"] == "succeeded" and len(bad_refs) == 1 and bad_refs[0]["page"] is None
    assert "not found in the source text" in an["markdown"]


def test_full_pipeline_analyze_challenge_memo(consented):
    c = consented
    ws = new_ws(c)
    a = upload(c, "credit-agreement.pdf").json()["attachments"][0]
    out = start(c, ws, instruction="Analyze this, identify the important issues, challenge your conclusion, and prepare a professional memo.", attachment_ids=[a["id"]])
    assert out["steps"] == ["document", "review", "memo"]
    assert wait_run(c, out["run"]["id"])["status"] == "succeeded"
    w = c.get(f"/api/workspaces/{ws}").json()
    assert len(w["analyses"]) == 1 and len(w["reviews"]) == 1 and len(w["drafts"]) == 1
    assert w["reviews"][0]["target_id"] == w["analyses"][0]["id"]
    assert w["drafts"][0]["kind"] == "memo" and w["drafts"][0]["source_analysis_id"] == w["analyses"][0]["id"]
    assert [m["result_type"] for m in w["messages"] if m["role"] == "assistant"] == ["analysis", "review", "draft"]


def test_challenge_then_revise_keeps_original(consented):
    c = consented
    ws = new_ws(c)
    a = upload(c, "impairment-memo.docx").json()["attachments"][0]
    wait_run(c, start(c, ws, instruction="Analyze this memo", attachment_ids=[a["id"]])["run"]["id"])
    original = c.get(f"/api/workspaces/{ws}").json()["analyses"][0]
    r = start(c, ws, action="challenge", target_type="analysis", target_id=original["id"])
    assert r["steps"] == ["review"]
    assert wait_run(c, r["run"]["id"])["status"] == "succeeded"
    review = c.get(f"/api/workspaces/{ws}").json()["reviews"][0]
    assert review["content"]["verdict"] in ("sound", "needs_revision", "unsound")
    assert {i["severity"] for i in review["content"]["issues"]} <= {"critical", "high", "medium", "low"}
    rr = c.post(f"/api/analyses/{original['id']}/revise").json()
    assert wait_run(c, rr["run"]["id"])["status"] == "succeeded"
    full = c.get(f"/api/analyses/{original['id']}").json()
    assert len(full["revisions"]) == 1 and full["revisions"][0]["parent_analysis_id"] == original["id"]
    assert c.get(f"/api/analyses/{original['id']}").json()["markdown"] == original["markdown"]  # untouched


def test_challenge_without_anything_is_rejected(consented):
    ws = new_ws(consented)
    r = consented.post(f"/api/workspaces/{ws}/runs", json={"action": "challenge"})
    assert r.status_code == 400


def test_follow_up_reuses_workspace_files(consented):
    c = consented
    ws = new_ws(c)
    a = upload(c, "credit-agreement.pdf").json()["attachments"][0]
    wait_run(c, start(c, ws, instruction="Summarize", attachment_ids=[a["id"]])["run"]["id"])
    out = start(c, ws, instruction="What does the agreement say about prepayment?")
    assert out["steps"] == ["document"]
    assert wait_run(c, out["run"]["id"])["status"] == "succeeded"
    assert len(c.get(f"/api/workspaces/{ws}").json()["analyses"]) == 2


def test_workflow_override(consented):
    ws = new_ws(consented)
    out = start(consented, ws, instruction="Thank-you note to the team", workflow="writing")
    assert out["steps"] == ["writing"]
    assert wait_run(consented, out["run"]["id"])["status"] == "succeeded"
    assert consented.post(f"/api/workspaces/{ws}/runs", json={"instruction": "x", "workflow": "hack"}).status_code == 400


def test_malformed_output_is_repaired(consented, monkeypatch):
    orig = mock.respond

    def malformed(req):
        req.meta["mock_malformed"] = True
        return orig(req)

    monkeypatch.setattr(mock, "respond", malformed)
    ws = new_ws(consented)
    run = wait_run(consented, start(consented, ws, instruction="Is a renewal option a modification?")["run"]["id"])
    assert run["status"] == "succeeded" and run["calls"] == 2
    assert consented.get(f"/api/workspaces/{ws}").json()["analyses"][0]["structured"] is True


def test_unrepairable_output_kept_as_text(consented, monkeypatch):
    monkeypatch.setattr(mock, "respond", lambda req: "Plain prose answer with no JSON at all.")
    ws = new_ws(consented)
    run = wait_run(consented, start(consented, ws, instruction="Explain lease classification")["run"]["id"])
    a = consented.get(f"/api/workspaces/{ws}").json()["analyses"][0]
    assert run["status"] == "succeeded" and a["structured"] is False and "Plain prose" in a["markdown"]


def test_provider_error_is_shown_plainly(consented, monkeypatch):
    def boom(self, req, cancel=None, progress=None):
        raise AIError("The AI service is rate-limiting requests. Wait a minute and try again.", "rate_limited")

    monkeypatch.setattr(MockProvider, "complete", boom)
    ws = new_ws(consented)
    run = wait_run(consented, start(consented, ws, instruction="Explain")["run"]["id"])
    assert run["status"] == "failed" and "rate-limiting" in run["error"]
    msgs = consented.get(f"/api/workspaces/{ws}").json()["messages"]
    assert msgs[-1]["result_type"] == "error" and "Traceback" not in msgs[-1]["content"]


def test_unexpected_exception_hides_internals(consented, monkeypatch):
    def boom(self, req, cancel=None, progress=None):
        raise RuntimeError("secret internal detail sk-ant-123")

    monkeypatch.setattr(MockProvider, "complete", boom)
    ws = new_ws(consented)
    run = wait_run(consented, start(consented, ws, instruction="Explain")["run"]["id"])
    assert run["status"] == "failed" and "sk-ant" not in run["error"] and "application log" in run["error"]


def test_cancel_running_job(consented, monkeypatch):
    def slow(self, req, cancel=None, progress=None):
        if cancel.wait(5):
            raise CancelledRun()
        return MockProvider.__dict__["complete"](self, req, cancel, progress)

    monkeypatch.setattr(MockProvider, "complete", slow)
    ws = new_ws(consented)
    run_id = start(consented, ws, instruction="Explain")["run"]["id"]
    time.sleep(0.2)
    assert consented.post(f"/api/runs/{run_id}/cancel").status_code == 200
    run = wait_run(consented, run_id)
    assert run["status"] == "cancelled"
    assert consented.get(f"/api/workspaces/{ws}").json()["messages"][-1]["result_type"] == "cancelled"


def test_writing_knowledge_strategy_and_profile(consented):
    c = consented
    ws = new_ws(c)
    run = wait_run(c, start(c, ws, instruction="Draft a LinkedIn post about clear writing")["run"]["id"])
    assert run["status"] == "succeeded" and run["result_type"] == "draft"
    c.post("/api/knowledge", json={"title": "Lease renewal decision", "body": "We decided renewal options are assessed at commencement.", "category": "decision"})
    ws2 = new_ws(c)
    out = start(c, ws2, instruction="What did I decide about lease renewal last time?")
    assert out["steps"] == ["knowledge"]
    assert wait_run(c, out["run"]["id"])["status"] == "succeeded"
    an = c.get(f"/api/workspaces/{ws2}").json()["analyses"][0]
    assert an["workflow"] == "knowledge" and any(s["verification"] == "verified" for s in an["sources"])
    s = c.post("/api/assistant/strategy", json={"days": 14}).json()
    assert wait_run(c, s["run"]["id"])["status"] == "succeeded"
    assert c.get("/api/assistant/strategy").json()["analyses"][0]["workflow"] == "strategy"
    sample = (DEMO_TEXT := open(__file__.replace("tests/test_ai.py", "../demo-data/files/writing-sample.txt")).read())
    p = c.post("/api/writing-profile/propose", json={"text": sample}).json()
    assert wait_run(c, p["run"]["id"])["status"] == "succeeded"
    prof = c.get("/api/writing-profile").json()
    assert prof["approved"] is None and prof["proposed"]["status"] == "proposed"  # approval is explicit
    pid = prof["proposed"]["id"]
    c.put(f"/api/writing-profile/{pid}", json={"profile": {"tone": "Plain and direct", "evil": "x"}})
    approved = c.post(f"/api/writing-profile/{pid}/approve").json()
    assert approved["status"] == "approved" and approved["profile"]["tone"] == "Plain and direct" and "evil" not in approved["profile"]
    assert c.post("/api/writing-profile/propose", json={"text": "too short"}).status_code == 400
    assert DEMO_TEXT


def test_rewrite_creates_versions(consented):
    c = consented
    d = c.post("/api/drafts", json={"title": "Reply", "kind": "email", "subject": "Re: x", "body": "One. Two. Three. Four."}).json()
    for preset in ("shorter", "firmer"):
        r = c.post(f"/api/drafts/{d['id']}/rewrite", json={"preset": preset}).json()
        assert wait_run(c, r["run"]["id"])["status"] == "succeeded"
    full = c.get(f"/api/drafts/{d['id']}").json()
    assert full["current_version"] == 3 and [v["note"] for v in full["versions"]] == ["Created", "Revision: Shorter", "Revision: Firmer"]
    assert full["versions"][0]["body"] == "One. Two. Three. Four."  # history preserved
    assert c.post(f"/api/drafts/{d['id']}/rewrite", json={"preset": "my_style"}).status_code == 400  # no approved profile
    assert c.post(f"/api/drafts/{d['id']}/rewrite", json={"preset": "nope"}).status_code == 400


# ---- unit: routing, parsing, verification --------------------------------------------------------

@pytest.mark.parametrize("text,docs,imgs,prior,expected", [
    ("What do they actually want from me, and how should I respond?", False, True, False, ["email"]),
    ("Figure out what they want and draft my response.", False, True, False, ["email"]),
    ("Summarize this agreement.", True, False, False, ["document"]),
    ("Compare these two documents.", True, False, False, ["document"]),
    ("Analyze this, identify the important issues, challenge your conclusion, and prepare a professional memo.", True, False, False, ["document", "review", "memo"]),
    ("Is a three-year renewal option a lease modification?", False, False, False, ["reasoning"]),
    ("Write a LinkedIn post about leadership", False, False, False, ["writing"]),
    ("What did I decide about the lease last time?", False, False, False, ["knowledge"]),
    ("Review my work from the last two weeks and tell me where I'm wasting time.", False, False, False, ["strategy"]),
    ("Challenge this.", False, False, True, ["review"]),
    ("Review this debt memo as a technical reviewer and challenge your own conclusions.", True, False, False, ["document", "review"]),
    ("Is the accounting in this memo right?", True, False, False, ["document"]),
    ("Prepare a memo on the covenant breach", True, False, False, ["document", "memo"]),
    ("Turn this into a memo for the audit committee", False, False, True, ["memo"]),
])
def test_routing(text, docs, imgs, prior, expected):
    assert plan(text, None, None, docs, imgs, prior) == expected


def test_quote_verification():
    src = "6.1 Maximum Total Leverage Ratio. The Borrower shall maintain a Total Leverage\nRatio of not more than 3.50 to 1.00 as of the last day"
    assert quote_in("The Borrower shall maintain a Total Leverage Ratio of not more than 3.50 to 1.00", src)
    assert quote_in("“The Borrower shall maintain … not more than 3.50 to 1.00”", src)
    assert not quote_in("not more than 3.75 to 1.00", src)
    assert not quote_in("...", src)


def test_extract_json_variants():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Here you go: {"a": {"b": "}"}} trailing') == {"a": {"b": "}"}}
    assert extract_json('{"a": [1, 2,],}') == {"a": [1, 2]}
    with pytest.raises(ParseError):
        extract_json('{"a": 1')


# ---- Anthropic provider with a fake SDK client ----------------------------------------------------

def _resp(code):
    return httpx2.Response(code, request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))


class FakeStream:
    def __init__(self, text, stop="end_turn", events=3, gate=None):
        self.text, self.stop, self.events, self.gate = text, stop, events, gate

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __iter__(self):
        for _ in range(self.events):
            if self.gate:
                self.gate.wait(0.05)
            yield SimpleNamespace(delta=SimpleNamespace(text="x"))

    def get_final_message(self):
        return SimpleNamespace(stop_reason=self.stop, model="claude-test", content=[SimpleNamespace(type="text", text=self.text)],
                               usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=2, cache_creation_input_tokens=0))


class FakeClient:
    def __init__(self, script):
        self.script, self.calls = list(script), []
        self.messages = SimpleNamespace(stream=self._stream)
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))

    def _stream(self, **kw):
        self.calls.append(kw)
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def req():
    return AIRequest(workflow="reasoning", system="sys", parts=["hello", ImagePart("image/png", "AAAA", "IMG1")])


def test_anthropic_retries_transient_errors(monkeypatch):
    monkeypatch.setattr(settings, "ai_max_retries", 3)
    monkeypatch.setattr("app.ai.provider.time.sleep", lambda s: None)
    fc = FakeClient([anthropic.RateLimitError("slow down", response=_resp(429), body=None),
                     anthropic.InternalServerError("oops", response=_resp(500), body=None), FakeStream('{"ok": 1}')])
    p = AnthropicProvider("sk-test", "claude-opus-5-5", client=fc)
    res = p.complete(req())
    assert res.text == '{"ok": 1}' and res.input_tokens == 12 and len(fc.calls) == 3
    kw = fc.calls[-1]
    assert kw["fallbacks"] == "default" and kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    blocks = kw["messages"][0]["content"]
    assert any(b["type"] == "image" for b in blocks) and blocks[0] == {"type": "text", "text": "hello"}


def test_anthropic_gives_up_after_bounded_retries(monkeypatch):
    monkeypatch.setattr(settings, "ai_max_retries", 2)
    monkeypatch.setattr("app.ai.provider.time.sleep", lambda s: None)
    fc = FakeClient([anthropic.APIConnectionError(request=httpx2.Request("POST", "https://x"))] * 3)
    with pytest.raises(AIError) as e:
        AnthropicProvider("sk-test", "claude-x", client=fc).complete(req())
    assert e.value.code == "unavailable" and len(fc.calls) == 3


def test_anthropic_error_mapping():
    for exc, code in [(anthropic.AuthenticationError("bad key", response=_resp(401), body=None), "auth"),
                      (anthropic.NotFoundError("no model", response=_resp(404), body=None), "model"),
                      (anthropic.BadRequestError("prompt is too long", response=_resp(400), body=None), "too_large"),
                      (anthropic.BadRequestError("Your credit balance is too low to access the Anthropic API.", response=_resp(400), body=None), "no_credit")]:
        with pytest.raises(AIError) as e:
            AnthropicProvider("sk-test", "claude-x", client=FakeClient([exc])).complete(req())
        assert e.value.code == code and "sk-test" not in e.value.user_message


def test_anthropic_refusal_and_fallback_downgrade():
    with pytest.raises(AIError) as e:
        AnthropicProvider("sk", "claude-x", client=FakeClient([FakeStream("", stop="refusal")])).complete(req())
    assert e.value.code == "refusal"
    fc = FakeClient([anthropic.BadRequestError("fallbacks not supported", response=_resp(400), body=None), FakeStream("{}")])
    AnthropicProvider("sk", "claude-opus-5-5", client=fc).complete(req())
    assert "fallbacks" in fc.calls[0] and "fallbacks" not in fc.calls[1]


def test_anthropic_cancel_mid_stream():
    ev = threading.Event()
    gate = threading.Event()
    fc = FakeClient([FakeStream("{}", events=200, gate=gate)])
    threading.Timer(0.1, ev.set).start()
    with pytest.raises(CancelledRun):
        AnthropicProvider("sk", "claude-x", client=fc).complete(req(), cancel=ev)


def test_mock_output_validates_against_every_schema():
    from app.ai.schemas import WORKFLOW_SCHEMAS

    for wf, schema in WORKFLOW_SCHEMAS.items():
        r = AIRequest(workflow=wf, system="", parts=[], meta={"instruction": "x", "sources": [{"label": "S1", "text": "First sentence here is long enough. Second.", "filename": "f"}]})
        schema.model_validate(json.loads(mock.respond(r)))
