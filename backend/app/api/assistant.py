"""Executive assistant: tasks, decisions, grounded briefings and strategic synthesis.
Briefings are computed from stored records only; nothing is inferred about activity outside the app."""
from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai.workflows import StepInput, run_step
from ..db import get_db
from ..models import Analysis, Decision, Draft, ModelRun, Task, Workspace, jdump
from ..services.audit import audit
from ..services.jobs import start_run
from .common import analysis_dict, decision_dict, err, run_dict, task_dict
from .deps import require_ai_ready

router = APIRouter()


class TaskIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    details: str = Field("", max_length=10000)
    kind: Literal["action", "respond", "waiting_on"] = "action"
    due_date: str | None = Field(None, max_length=40)
    owner: str | None = Field(None, max_length=200)
    workspace_id: str | None = None
    source: Literal["user", "extracted"] = "user"
    source_excerpt: str | None = Field(None, max_length=2000)


class TaskPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    details: str | None = None
    kind: Literal["action", "respond", "waiting_on"] | None = None
    status: Literal["open", "done"] | None = None
    due_date: str | None = None
    owner: str | None = None


class DecisionIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    context: str = Field("", max_length=20000)
    options: list[str] = Field(default_factory=list)
    recommendation: str | None = None
    due_date: str | None = None
    workspace_id: str | None = None
    source: Literal["user", "ai_suggested"] = "user"


class DecisionPatch(BaseModel):
    title: str | None = None
    context: str | None = None
    status: Literal["pending", "decided", "dropped"] | None = None
    outcome: str | None = None
    rationale: str | None = None
    due_date: str | None = None


def _ws_check(db: Session, ws_id: str | None) -> None:
    if ws_id and db.get(Workspace, ws_id) is None:
        raise err(404, "Workspace not found.", "not_found")


@router.get("/tasks")
def list_tasks(status: str | None = None, kind: str | None = None, workspace_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Task)
    if status:
        q = q.filter_by(status=status)
    if kind:
        q = q.filter_by(kind=kind)
    if workspace_id:
        q = q.filter_by(workspace_id=workspace_id)
    return {"tasks": [task_dict(t) for t in q.order_by(Task.status, Task.created_at.desc())]}


@router.post("/tasks", status_code=201)
def create_task(body: TaskIn, db: Session = Depends(get_db)):
    _ws_check(db, body.workspace_id)
    t = Task(**body.model_dump())
    db.add(t)
    db.flush()
    audit(db, "task_created", "task", t.id, source=t.source)
    db.commit()
    return task_dict(t)


@router.patch("/tasks/{tid}")
def update_task(tid: str, body: TaskPatch, db: Session = Depends(get_db)):
    t = db.get(Task, tid)
    if t is None:
        raise err(404, "Task not found.", "not_found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    if body.status == "done" and not t.completed_at:
        t.completed_at = datetime.now(UTC)
    if body.status == "open":
        t.completed_at = None
    db.commit()
    return task_dict(t)


@router.delete("/tasks/{tid}")
def delete_task(tid: str, db: Session = Depends(get_db)):
    t = db.get(Task, tid)
    if t is None:
        raise err(404, "Task not found.", "not_found")
    db.delete(t)
    db.commit()
    return {"deleted": tid}


@router.get("/decisions")
def list_decisions(status: str | None = None, workspace_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Decision)
    if status:
        q = q.filter_by(status=status)
    if workspace_id:
        q = q.filter_by(workspace_id=workspace_id)
    return {"decisions": [decision_dict(d) for d in q.order_by(Decision.status.desc(), Decision.created_at.desc())]}


@router.post("/decisions", status_code=201)
def create_decision(body: DecisionIn, db: Session = Depends(get_db)):
    _ws_check(db, body.workspace_id)
    d = Decision(**{**body.model_dump(exclude={"options"}), "options": jdump(body.options)})
    db.add(d)
    db.flush()
    audit(db, "decision_created", "decision", d.id, source=d.source)
    db.commit()
    return decision_dict(d)


@router.patch("/decisions/{did}")
def update_decision(did: str, body: DecisionPatch, db: Session = Depends(get_db)):
    d = db.get(Decision, did)
    if d is None:
        raise err(404, "Decision not found.", "not_found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(d, k, v)
    if body.status == "decided":
        d.decided_at = datetime.now(UTC)
    db.commit()
    return decision_dict(d)


@router.delete("/decisions/{did}")
def delete_decision(did: str, db: Session = Depends(get_db)):
    d = db.get(Decision, did)
    if d is None:
        raise err(404, "Decision not found.", "not_found")
    db.delete(d)
    db.commit()
    return {"deleted": did}


# ---- grounded briefings --------------------------------------------------------------------

def _parse_due(s: str | None) -> date | None:
    if not s:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s.strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _titles(db: Session) -> dict[str, str]:
    return {w.id: w.title for w in db.query(Workspace)}


@router.get("/assistant/brief")
def brief(question: Literal["waiting", "respond", "decisions", "today"], db: Session = Depends(get_db)):
    titles = _titles(db)
    today = date.today()
    items: list[dict] = []

    def t_item(t: Task, reason: str) -> dict:
        return {"type": "task", "id": t.id, "title": t.title, "reason": reason, "due_date": t.due_date,
                "workspace_id": t.workspace_id, "workspace_title": titles.get(t.workspace_id or ""), "created_at": t.created_at.isoformat()}

    open_tasks = db.query(Task).filter_by(status="open").order_by(Task.created_at).all()
    pending = db.query(Decision).filter_by(status="pending").order_by(Decision.created_at).all()
    if question == "waiting":
        items += [t_item(t, f"Waiting on {t.owner}" if t.owner else "Waiting on someone else") for t in open_tasks if t.kind == "waiting_on"]
        items += [{"type": "workspace", "id": w.id, "title": w.title, "reason": "Workspace marked Waiting", "workspace_id": w.id,
                   "workspace_title": w.title, "created_at": w.updated_at.isoformat()} for w in db.query(Workspace).filter_by(status="waiting")]
        headline = f"You are waiting on {len(items)} item(s)." if items else "Nothing is recorded as waiting on someone else."
    elif question == "respond":
        items += [t_item(t, "Reply owed") for t in open_tasks if t.kind == "respond"]
        # Drafted email replies not yet marked final, in active workspaces.
        for d in db.query(Draft).filter_by(kind="email", status="draft"):
            if d.workspace_id and (w := db.get(Workspace, d.workspace_id)) and w.status == "active":
                items.append({"type": "draft", "id": d.id, "title": d.title, "reason": "Reply drafted but not marked final",
                              "workspace_id": d.workspace_id, "workspace_title": w.title, "created_at": d.updated_at.isoformat()})
        headline = f"{len(items)} item(s) may need a response." if items else "No replies are recorded as outstanding."
    elif question == "decisions":
        items = [{"type": "decision", "id": d.id, "title": d.title, "reason": f"Pending since {d.created_at.date().isoformat()}",
                  "due_date": d.due_date, "workspace_id": d.workspace_id, "workspace_title": titles.get(d.workspace_id or ""),
                  "created_at": d.created_at.isoformat()} for d in pending]
        headline = f"{len(items)} decision(s) are outstanding." if items else "No decisions are pending."
    else:  # today
        def due_rank(t: Task):
            dd = _parse_due(t.due_date)
            return (0 if dd and dd <= today else 1 if dd else 2, dd or date.max, t.created_at)

        for t in sorted(open_tasks, key=due_rank):
            dd = _parse_due(t.due_date)
            if dd and dd < today:
                reason = f"Overdue (due {dd.isoformat()})"
            elif dd and dd == today:
                reason = "Due today"
            elif dd:
                reason = f"Due {dd.isoformat()}"
            elif t.due_date:
                reason = f"Deadline as stated: “{t.due_date}”"
            else:
                reason = {"respond": "Reply owed", "waiting_on": "Follow up if needed", "action": "Open action"}[t.kind]
            items.append(t_item(t, reason))
        items += [{"type": "decision", "id": d.id, "title": d.title, "reason": "Pending decision", "due_date": d.due_date,
                   "workspace_id": d.workspace_id, "workspace_title": titles.get(d.workspace_id or ""), "created_at": d.created_at.isoformat()}
                  for d in pending]
        overdue = sum(1 for i in items if i["reason"].startswith(("Overdue", "Due today")))
        headline = (f"{len(items)} open item(s); {overdue} overdue or due today." if items
                    else "Nothing is open. Tasks and decisions you save will appear here.")
    return {"question": question, "headline": headline, "items": items,
            "basis": "Computed from tasks, decisions, drafts and workspaces saved in this application only."}


@router.get("/assistant/summary")
def summary(period: Literal["day", "week"] = "day", db: Session = Depends(get_db)):
    since = datetime.now(UTC) - (timedelta(days=1) if period == "day" else timedelta(days=7))
    ws_new = db.query(Workspace).filter(Workspace.created_at >= since).all()
    ws_touched = db.query(Workspace).filter(Workspace.updated_at >= since).all()
    runs = db.query(ModelRun).filter(ModelRun.created_at >= since, ModelRun.status == "succeeded").all()
    done = db.query(Task).filter(Task.completed_at >= since).all()
    new_tasks = db.query(Task).filter(Task.created_at >= since).all()
    decided = db.query(Decision).filter(Decision.decided_at >= since).all()
    drafts = db.query(Draft).filter(Draft.updated_at >= since).all()
    open_tasks = db.query(Task).filter_by(status="open").count()
    pending = db.query(Decision).filter_by(status="pending").count()
    lines = [
        f"Workspaces: {len(ws_new)} new, {len(ws_touched)} active in this period.",
        f"AI work completed: {len(runs)} request(s).",
        f"Drafts created or edited: {len(drafts)}.",
        f"Tasks: {len(new_tasks)} added, {len(done)} completed; {open_tasks} open overall.",
        f"Decisions: {len(decided)} made; {pending} pending overall.",
    ]
    return {"period": period, "since": since.isoformat(), "lines": lines,
            "workspaces": [{"id": w.id, "title": w.title, "status": w.status} for w in ws_touched[:20]],
            "completed_tasks": [task_dict(t) for t in done[:20]], "decisions_made": [decision_dict(d) for d in decided[:20]],
            "basis": "Only records stored in this application are counted."}


class StrategyIn(BaseModel):
    days: int = Field(14, ge=1, le=365)
    question: str = Field("Review my recent work. Where am I spending effort, what keeps recurring, and what should I prioritise or simplify?", max_length=4000)


@router.post("/assistant/strategy", status_code=202)
def strategy(body: StrategyIn, db: Session = Depends(get_db)):
    require_ai_ready(db)

    def job(r):
        r.results.append(run_step(r, "strategy", StepInput(None, body.question, [], options={"days": body.days})))

    run = start_run(db, workflow="strategy", steps=["strategy"], workspace_id=None, summary=f"strategy days={body.days}", job=job)
    return {"run": run_dict(run)}


@router.get("/assistant/strategy")
def list_strategy(db: Session = Depends(get_db)):
    return {"analyses": [analysis_dict(a) for a in db.query(Analysis).filter_by(workflow="strategy").order_by(Analysis.created_at.desc()).limit(20)]}
