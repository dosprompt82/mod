import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Compass, Gavel, ListTodo, Plus, Trash2, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import type { Decision, Task } from "../lib/types";
import { timeAgo } from "../lib/format";
import { useAI } from "../hooks/useAI";
import { Markdown } from "../components/Markdown";
import { Dialog } from "../components/Dialog";
import { Empty, MockNotice, Spinner } from "../components/ui";
import { useToast } from "../components/useToast";

const QUESTIONS = [
  ["today", "What should I focus on today?"], ["respond", "What do I need to respond to?"],
  ["waiting", "What am I waiting on?"], ["decisions", "What decisions are outstanding?"],
] as const;
const KIND_LABEL = { action: "Action", respond: "Reply owed", waiting_on: "Waiting on" } as const;

function Brief({ question }: { question: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["brief", question], queryFn: () => api.brief(question) });
  if (isLoading || !data) return <Spinner />;
  return (
    <div data-testid="brief">
      <p className="font-serif text-lg">{data.headline}</p>
      {data.items.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {data.items.map((i) => (
            <li key={`${i.type}-${i.id}`} className="flex flex-wrap items-baseline gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{i.title}</span>
              <span className={`text-xs ${i.reason.startsWith("Overdue") ? "text-danger" : "text-muted"}`}>{i.reason}</span>
              {i.workspace_id && <Link className="ml-auto text-xs text-accent hover:underline" to={`/w/${i.workspace_id}`}>{i.workspace_title}</Link>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-2xs text-faint">{data.basis}</p>
    </div>
  );
}

function TaskRow({ t }: { t: Task }) {
  const qc = useQueryClient();
  const done = t.status === "done";
  const toggle = async () => { await api.updateTask(t.id, { status: done ? "open" : "done" }); await qc.invalidateQueries(); };
  return (
    <li className="group flex items-start gap-3 px-3 py-2.5">
      <button onClick={toggle} aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${done ? "border-ok bg-ok text-white" : "border-line hover:border-accent"}`}>
        {done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${done ? "text-faint line-through" : ""}`}>{t.title}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted">
          <span>{KIND_LABEL[t.kind]}{t.owner ? ` ${t.owner}` : ""}</span>
          {t.due_date && <span>· due {t.due_date}</span>}
          {t.source === "extracted" && <span>· extracted from a document</span>}
          {t.workspace_id && <Link to={`/w/${t.workspace_id}`} className="text-accent hover:underline">· open workspace</Link>}
        </div>
      </div>
      <button className="text-faint opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${t.title}`}
        onClick={async () => { await api.deleteTask(t.id); await qc.invalidateQueries(); }}><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

function DecisionRow({ d, onDecide }: { d: Decision; onDecide: (d: Decision) => void }) {
  const qc = useQueryClient();
  return (
    <li className="group px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{d.title}</div>
          {d.options.length > 0 && <div className="text-xs text-muted">Options: {d.options.join(" · ")}</div>}
          {d.recommendation && <div className="text-xs text-accent">AI suggestion: {d.recommendation}</div>}
          {d.status === "decided" && <div className="mt-1 text-xs text-ok">Decided: {d.outcome}{d.rationale ? `. ${d.rationale}` : ""}</div>}
          <div className="text-2xs text-faint">{d.source === "ai_suggested" ? "Suggested by AI, tracked by you" : "Added by you"} · {timeAgo(d.created_at)}</div>
        </div>
        {d.status === "pending" ? (
          <button className="btn-secondary btn-sm" onClick={() => onDecide(d)}>Record decision</button>
        ) : (
          <button className="btn-ghost btn-sm" onClick={async () => { await api.updateDecision(d.id, { status: "pending" }); await qc.invalidateQueries(); }}><Undo2 className="h-3.5 w-3.5" /> Reopen</button>
        )}
        <button className="text-faint opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${d.title}`}
          onClick={async () => { await api.deleteDecision(d.id); await qc.invalidateQueries(); }}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </li>
  );
}

export default function Decisions() {
  const qc = useQueryClient();
  const toast = useToast();
  const { run, consentDialog } = useAI();
  const [q, setQ] = useState<string>("today");
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState<Task["kind"]>("action");
  const [taskDue, setTaskDue] = useState("");
  const [decTitle, setDecTitle] = useState("");
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [outcome, setOutcome] = useState("");
  const [rationale, setRationale] = useState("");
  const [days, setDays] = useState(14);
  const [stratBusy, setStratBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: () => api.tasks() });
  const { data: decisions } = useQuery({ queryKey: ["decisions"], queryFn: () => api.decisions() });
  const { data: summary } = useQuery({ queryKey: ["summary", period], queryFn: () => api.summary(period) });
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const open = tasks?.tasks.filter((t) => t.status === "open") ?? [];
  const done = tasks?.tasks.filter((t) => t.status === "done") ?? [];
  const latest = strategies?.analyses[0];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="mb-5 font-serif text-2xl font-semibold">Decisions &amp; tasks</h1>
      <section className="panel mb-6 p-5">
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Ask your assistant">
          {QUESTIONS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={q === id} className={`chip ${q === id ? "border-accent bg-accent-soft text-accent" : ""}`} onClick={() => setQ(id)}>{label}</button>
          ))}
        </div>
        <Brief question={q} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ListTodo className="h-4 w-4" /> Tasks <span className="font-normal text-muted">{open.length} open</span></h2>
          <form className="mb-2 flex flex-wrap gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!taskTitle.trim()) return;
            await api.createTask({ title: taskTitle.trim(), kind: taskKind, due_date: taskDue || null });
            setTaskTitle(""); setTaskDue("");
            await qc.invalidateQueries();
          }}>
            <input className="input min-w-[10rem] flex-1" placeholder="Add a task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} aria-label="Task title" />
            <select className="input w-auto" value={taskKind} onChange={(e) => setTaskKind(e.target.value as Task["kind"])} aria-label="Task type">
              <option value="action">Action</option><option value="respond">Reply owed</option><option value="waiting_on">Waiting on</option>
            </select>
            <input type="date" className="input w-auto" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Due date" />
            <button className="btn-primary px-2" aria-label="Add task"><Plus className="h-4 w-4" /></button>
          </form>
          {open.length === 0 ? <Empty title="No open tasks">Track action items from any analysis, or add your own.</Empty> : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{open.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
          )}
          {done.length > 0 && (
            <button className="mt-2 text-xs text-muted hover:text-ink" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} {done.length} completed</button>
          )}
          {showDone && <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">{done.map((t) => <TaskRow key={t.id} t={t} />)}</ul>}
        </section>
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Gavel className="h-4 w-4" /> Decisions <span className="font-normal text-muted">{decisions?.decisions.filter((d) => d.status === "pending").length ?? 0} pending</span></h2>
          <form className="mb-2 flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!decTitle.trim()) return;
            await api.createDecision({ title: decTitle.trim() });
            setDecTitle("");
            await qc.invalidateQueries();
          }}>
            <input className="input flex-1" placeholder="Add a decision you need to make" value={decTitle} onChange={(e) => setDecTitle(e.target.value)} aria-label="Decision" />
            <button className="btn-primary px-2" aria-label="Add decision"><Plus className="h-4 w-4" /></button>
          </form>
          {!decisions?.decisions.length ? <Empty title="No decisions tracked">Decisions surfaced in analyses can be tracked here.</Empty> : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{decisions.decisions.map((d) => <DecisionRow key={d.id} d={d} onDecide={(x) => { setDeciding(x); setOutcome(x.recommendation ?? ""); setRationale(""); }} />)}</ul>
          )}
        </section>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Summary</h2>
            <div className="flex gap-1">
              {(["day", "week"] as const).map((p) => (
                <button key={p} className={`chip ${period === p ? "border-accent bg-accent-soft text-accent" : ""}`} onClick={() => setPeriod(p)}>{p === "day" ? "Today" : "This week"}</button>
              ))}
            </div>
          </div>
          <ul className="space-y-1 text-sm">{summary?.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-3 text-2xs text-faint">{summary?.basis}</p>
        </section>
        <section className="panel p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto flex items-center gap-1.5 text-sm font-semibold"><Compass className="h-4 w-4" /> Strategic review</h2>
            <select className="input w-auto py-1 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
              {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
            <button className="btn-primary btn-sm" disabled={stratBusy} onClick={async () => {
              setStratBusy(true);
              const r = await run(() => api.strategy(days));
              setStratBusy(false);
              if (r?.status === "succeeded") toast("Strategic review ready");
            }}>{stratBusy ? <Spinner className="h-3.5 w-3.5" /> : null} Review my work</button>
          </div>
          <p className="mb-3 text-xs text-muted">Looks for recurring issues, repeated requests, unresolved decisions and reusable work, using only what is saved in this app. Observations and recommendations are kept separate.</p>
          {latest ? (
            <div>
              <MockNotice provider={latest.provider} />
              <div className="mb-1 text-xs text-faint">{latest.title} · {timeAgo(latest.created_at)}</div>
              <Markdown>{latest.markdown}</Markdown>
            </div>
          ) : <p className="text-sm text-faint">No review yet.</p>}
        </section>
      </div>
      <Dialog open={!!deciding} onClose={() => setDeciding(null)} title="Record decision" description={deciding?.title}
        footer={<button className="btn-primary" disabled={!outcome.trim()} onClick={async () => {
          await api.updateDecision(deciding!.id, { status: "decided", outcome, rationale });
          setDeciding(null);
          toast("Decision recorded");
          await qc.invalidateQueries();
        }}>Save decision</button>}>
        <div className="space-y-3">
          <div><label className="label" htmlFor="d-out">Decision</label><input id="d-out" className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)} /></div>
          <div><label className="label" htmlFor="d-why">Rationale (optional)</label><textarea id="d-why" className="input min-h-[6rem]" value={rationale} onChange={(e) => setRationale(e.target.value)} /></div>
        </div>
      </Dialog>
      {consentDialog}
    </div>
  );
}
