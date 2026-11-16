"""Background execution for AI runs and document extraction. Single-user scale: two worker threads each.
Run state lives in the database, so a page refresh never loses track of work; cancellation is cooperative."""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from ..ai.provider import AIError, CancelledRun, get_provider
from ..ai.workflows import Runner, finalize_costs
from ..db import session
from ..models import Attachment, Message, ModelRun, jdump
from .audit import audit
from .prefs import model_id

log = logging.getLogger(__name__)
_ai = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ai")
_extract = ThreadPoolExecutor(max_workers=2, thread_name_prefix="extract")
_cancel: dict[str, threading.Event] = {}


def provider_name() -> str:
    from ..config import settings

    return "mock" if settings.ai_provider == "mock" else "anthropic"


def start_run(db: Session, *, workflow: str, steps: list[str], workspace_id: str | None, summary: str,
              job: Callable[[Runner], None], message_id: str | None = None) -> ModelRun:
    run = ModelRun(workspace_id=workspace_id, workflow=workflow, steps=jdump(steps), provider=provider_name(), model=model_id(db),
                   status="queued", step_label="Queued", request_summary=summary[:300], message_id=message_id)
    db.add(run)
    audit(db, "ai_run_started", "model_run", run.id, workflow=workflow, steps=steps, provider=run.provider, model=run.model)
    db.commit()
    ev = threading.Event()
    _cancel[run.id] = ev
    _ai.submit(_execute, run.id, job, ev)
    return run


def cancel_run(run_id: str) -> bool:
    ev = _cancel.get(run_id)
    if ev is None:
        return False
    ev.set()
    return True


def _note(db: Session, run: ModelRun, text: str, kind: str) -> None:
    if run.workspace_id:
        db.add(Message(workspace_id=run.workspace_id, role="assistant", content=text, workflow=run.workflow, run_id=run.id, result_type=kind))


def _execute(run_id: str, job: Callable[[Runner], None], ev: threading.Event) -> None:
    db = session()
    t0 = time.monotonic()
    runner: Runner | None = None
    try:
        run = db.get(ModelRun, run_id)
        if run is None:
            return
        if ev.is_set():
            run.status, run.step_label = "cancelled", "Cancelled before it started"
            _note(db, run, "Cancelled.", "cancelled")
            db.commit()
            return
        run.status = "running"
        db.commit()
        try:
            provider = get_provider(run.model)
            runner = Runner(db, run, provider, ev)
            job(runner)
            finalize_costs(runner)
            run.status, run.step_label = "succeeded", "Done"
            if runner.results:
                run.result_type, run.result_id = runner.results[-1]
            db.commit()
        except CancelledRun:
            db.rollback()
            run = db.get(ModelRun, run_id)
            run.status, run.step_label = "cancelled", "Cancelled"
            _note(db, run, "Cancelled." + (" Completed steps were kept." if runner and runner.results else ""), "cancelled")
        except AIError as e:
            db.rollback()
            run = db.get(ModelRun, run_id)
            run.status, run.error_message, run.step_label = "failed", e.user_message, "Failed"
            _note(db, run, e.user_message, "error")
        except Exception:  # noqa: BLE001 - never leak internals to the UI
            log.exception("AI run %s failed", run_id)
            db.rollback()
            run = db.get(ModelRun, run_id)
            run.status, run.step_label = "failed", "Failed"
            run.error_message = "Something went wrong while processing this request. Details were written to the application log."
            _note(db, run, run.error_message, "error")
        finally:
            run = db.get(ModelRun, run_id)
            if run is not None:
                if runner is not None:
                    finalize_costs(runner)
                    if runner.results and not run.result_id:
                        run.result_type, run.result_id = runner.results[-1]
                run.duration_ms = int((time.monotonic() - t0) * 1000)
                run.finished_at = datetime.now(UTC)
                audit(db, "ai_run_finished", "model_run", run.id, status=run.status, input_tokens=run.input_tokens, output_tokens=run.output_tokens)
                db.commit()
    finally:
        db.close()
        _cancel.pop(run_id, None)


def submit_extraction(attachment_id: str) -> None:
    _extract.submit(_run_extraction, attachment_id)


def _run_extraction(attachment_id: str) -> None:
    from .extraction import extract

    db = session()
    try:
        att = db.get(Attachment, attachment_id)
        if att is not None:
            extract(db, att)
    except Exception:  # noqa: BLE001
        log.exception("extraction crashed for %s", attachment_id)
    finally:
        db.close()


def recover_after_restart(db: Session) -> int:
    stale = db.query(ModelRun).filter(ModelRun.status.in_(["queued", "running"])).all()
    for r in stale:
        r.status, r.step_label = "failed", "Interrupted"
        r.error_message = "Interrupted because the application was restarted. Run it again."
    for a in db.query(Attachment).filter(Attachment.status.in_(["uploaded", "extracting"])).all():
        submit_extraction(a.id)
    db.commit()
    return len(stale)


def wait_idle(timeout: float = 30.0) -> None:
    """Testing helper: wait until no runs are executing."""
    end = time.monotonic() + timeout
    while _cancel and time.monotonic() < end:
        time.sleep(0.02)
