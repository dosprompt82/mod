import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, MoreHorizontal, PanelRightClose, PanelRightOpen, Tag, Trash2, X } from "lucide-react";
import { api, ApiError, type RunRequest } from "../lib/api";
import type { Message, Run, WorkspaceDetail } from "../lib/types";
import { timeAgo, WORKFLOW_LABELS } from "../lib/format";
import { useAI } from "../hooks/useAI";
import { UniversalInput, type SubmitPayload } from "../components/UniversalInput";
import { AnalysisResult, DraftResult, EmailResult, ReviewResult, type ResultActions } from "../components/Results";
import { RightPanel } from "../components/RightPanel";
import { ConfirmDialog } from "../components/Dialog";
import { useToast } from "../components/useToast";
import { Spinner } from "../components/ui";

function RunCard({ run, onCancel }: { run: Run; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const secs = Math.max(0, Math.round((now - new Date(run.created_at).getTime()) / 1000));
  return (
    <div className="panel flex items-center gap-3 px-4 py-3" role="status" aria-live="polite" data-testid="run-card">
      <Spinner className="h-4 w-4 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{run.step_label || "Working"}…</div>
        <div className="text-xs text-muted">
          {run.steps.map((s) => WORKFLOW_LABELS[s] ?? s).join(" → ")} · {secs}s{run.provider === "anthropic" ? ` · ${run.model}` : " · mock provider"}
        </div>
      </div>
      <button className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function UserMessage({ m, ws }: { m: Message; ws: WorkspaceDetail }) {
  const atts = ws.attachments.filter((a) => m.attachment_ids.includes(a.id));
  return (
    <div className="flex flex-col items-end gap-1.5">
      {atts.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {atts.map((a) => <span key={a.id} className="badge border border-line bg-surface text-muted">{a.filename}</span>)}
        </div>
      )}
      {m.content && <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[0.95rem] text-ink">{m.content}</div>}
    </div>
  );
}

export default function WorkspacePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { start, run, consentDialog } = useAI();
  const [panel, setPanel] = useState(() => window.innerWidth >= 1280);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastResultRef = useRef<HTMLDivElement>(null);

  const { data: ws, error, isLoading } = useQuery({
    queryKey: ["workspace", id],
    queryFn: () => api.workspace(id),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      const busy = d.runs.some((r) => ["queued", "running"].includes(r.status)) || d.attachments.some((a) => ["uploaded", "extracting"].includes(a.status));
      return busy ? 900 : false;
    },
  });
  const active = useMemo(() => ws?.runs.filter((r) => ["queued", "running"].includes(r.status)) ?? [], [ws]);
  const msgCount = ws?.messages.length ?? 0;
  const prevActive = useRef(0);
  useEffect(() => {
    if (prevActive.current > active.length) void qc.invalidateQueries({ queryKey: ["workspaces"] });
    prevActive.current = active.length;
  }, [active.length, qc]);
  // Show the start of the newest result (not the bottom of it); while work is running, show the progress card.
  useEffect(() => {
    if (active.length) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    else lastResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [msgCount, active.length]);
  useEffect(() => { if (ws) setTitle(ws.title); }, [ws?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  if (error || !ws) {
    return <div className="p-10 text-center text-sm text-muted">{error instanceof ApiError ? error.message : "Workspace not found."}</div>;
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace", id] });
  const send = async (req: RunRequest) => {
    const s = await start(() => api.startRun(ws.id, req));
    if (s) {
      await refresh();
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
    }
    return !!s;
  };
  const onSubmit = (p: SubmitPayload) => send({ instruction: p.instruction, attachment_ids: p.attachmentIds, action: p.action, workflow: p.workflow });
  const act: ResultActions = {
    challenge: (type, targetId) => { void send({ action: "challenge", target_type: type, target_id: targetId, instruction: "" }); },
    memo: () => { void send({ action: "memo", instruction: "Prepare a professional technical memorandum based on this analysis." }); },
    revise: async (analysisId) => { await run(() => api.reviseAnalysis(analysisId)); await refresh(); },
    reviseDraft: async (draftId, instruction) => {
      const r = await run(() => api.rewrite(draftId, { instruction }));
      if (r?.status === "succeeded") toast("Draft revised; the previous version is kept in its history.");
      await refresh();
    },
  };
  const saveTitle = async () => {
    setEditingTitle(false);
    if (title.trim() && title !== ws.title) { await api.updateWorkspace(ws.id, { title: title.trim() }); await refresh(); void qc.invalidateQueries({ queryKey: ["workspaces"] }); }
  };
  const update = async (b: Parameters<typeof api.updateWorkspace>[1]) => {
    await api.updateWorkspace(ws.id, b); await refresh(); void qc.invalidateQueries({ queryKey: ["workspaces"] });
  };

  const renderResult = (m: Message) => {
    if (m.result_type === "error" || m.result_type === "cancelled") {
      return <div className={`rounded-lg border px-3 py-2 text-sm ${m.result_type === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-line text-muted"}`}>{m.content}</div>;
    }
    if (m.result_type === "analysis") {
      const a = ws.analyses.find((x) => x.id === m.result_id);
      if (!a) return null;
      return a.workflow === "email" && a.structured ? <EmailResult a={a} ws={ws} act={act} /> : <AnalysisResult a={a} ws={ws} act={act} />;
    }
    if (m.result_type === "review") {
      const r = ws.reviews.find((x) => x.id === m.result_id);
      return r ? <ReviewResult r={r} ws={ws} act={act} /> : null;
    }
    if (m.result_type === "draft") {
      const d = ws.drafts.find((x) => x.id === m.result_id);
      return d ? <DraftResult d={d} act={act} /> : <p className="text-sm text-muted">This draft was deleted.</p>;
    }
    return <p className="text-sm">{m.content}</p>;
  };

  const resultTitle = (m: Message) => {
    if (m.result_type === "analysis") return ws.analyses.find((x) => x.id === m.result_id)?.title;
    if (m.result_type === "review") return "Critical review";
    return undefined;
  };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          {editingTitle ? (
            <input autoFocus className="input max-w-md py-1 text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") void saveTitle(); if (e.key === "Escape") { setTitle(ws.title); setEditingTitle(false); } }} aria-label="Workspace title" />
          ) : (
            <h1 className="cursor-text truncate text-base font-semibold" title="Click to rename" onClick={() => setEditingTitle(true)} data-testid="ws-title">{ws.title}</h1>
          )}
          <select value={ws.status} onChange={(e) => update({ status: e.target.value as WorkspaceDetail["status"] })}
            className="w-auto rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs" aria-label="Workspace status">
            {["active", "waiting", "completed", "archived"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-1">
            {ws.tags.map((t) => (
              <span key={t} className="badge border border-line text-muted">{t}
                <button aria-label={`Remove tag ${t}`} onClick={() => update({ tags: ws.tags.filter((x) => x !== t) })}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); if (tagDraft.trim()) { void update({ tags: [...ws.tags, tagDraft.trim()] }); setTagDraft(""); } }} className="flex items-center gap-1 text-muted">
              <Tag className="h-3 w-3" />
              <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="Add tag" className="w-20 bg-transparent text-xs focus:outline-none" aria-label="Add tag" />
            </form>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <button className="btn-ghost px-1.5" onClick={() => setMenu(!menu)} aria-label="Workspace actions" aria-expanded={menu}><MoreHorizontal className="h-4 w-4" /></button>
              {menu && (
                <div className="panel absolute right-0 z-20 mt-1 w-52 py-1 shadow-pop" role="menu" onMouseLeave={() => setMenu(false)}>
                  <a role="menuitem" href={`/api/workspaces/${ws.id}/export`} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-sunken"><Download className="h-3.5 w-3.5" /> Export workspace (.zip)</a>
                  <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-sunken" onClick={() => { setMenu(false); void update({ status: "archived" }); }}><Archive className="h-3.5 w-3.5" /> Archive</button>
                  <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger hover:bg-danger-soft" onClick={() => { setMenu(false); setConfirmDelete(true); }}><Trash2 className="h-3.5 w-3.5" /> Delete…</button>
                </div>
              )}
            </div>
            <button className="btn-ghost px-1.5" onClick={() => setPanel(!panel)} aria-label={panel ? "Hide side panel" : "Show side panel"} aria-pressed={panel}>
              {panel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[52rem] space-y-8 px-5 py-6">
            {ws.messages.length === 0 && active.length === 0 && (
              <div className="py-10 text-center">
                <p className="font-serif text-xl">Start this workspace</p>
                <p className="mt-1 text-sm text-muted">Paste screenshots, drop documents or ask a question below. {ws.description}</p>
              </div>
            )}
            {ws.messages.map((m, idx) => m.role === "user" ? <UserMessage key={m.id} m={m} ws={ws} /> : (
              <div key={m.id} className="scroll-mt-4 space-y-2" onMouseEnter={() => m.result_id && setFocusId(m.result_id)}
                ref={idx === ws.messages.length - 1 ? lastResultRef : undefined}>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-ink">{WORKFLOW_LABELS[m.workflow ?? ""] ?? "Result"}</span>
                  {resultTitle(m) && <span className="truncate">· {resultTitle(m)}</span>}
                  <span className="ml-auto shrink-0 text-faint">{timeAgo(m.created_at)}</span>
                </div>
                {renderResult(m)}
              </div>
            ))}
            {active.map((r) => <RunCard key={r.id} run={r} onCancel={async () => { await api.cancelRun(r.id); await refresh(); }} />)}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="border-t border-line bg-bg/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto max-w-[52rem]">
            <UniversalInput variant="compact" onSubmit={onSubmit} busy={active.length > 0}
              placeholder={ws.messages.length ? "Ask a follow-up, add files, or request a deliverable…" : undefined} />
          </div>
        </div>
      </div>
      {panel && (
        <>
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-surface/60 md:block" aria-label="Workspace details">
            <RightPanel ws={ws} focusId={focusId} />
          </aside>
          <div className="fixed inset-0 z-30 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setPanel(false)} />
            <aside className="absolute inset-y-0 right-0 w-80 max-w-[85vw] overflow-y-auto border-l border-line bg-bg shadow-pop" aria-label="Workspace details">
              <button className="btn-ghost absolute right-2 top-2 z-10 px-1.5" onClick={() => setPanel(false)} aria-label="Close details"><X className="h-4 w-4" /></button>
              <RightPanel ws={ws} focusId={focusId} />
            </aside>
          </div>
        </>
      )}
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this workspace?"
        body={<>This permanently removes its conversation, uploaded files, analyses and reviews. Drafts, tasks, decisions and saved knowledge are kept.</>}
        confirmLabel="Delete workspace"
        onConfirm={async () => {
          await api.deleteWorkspace(ws.id);
          await qc.invalidateQueries({ queryKey: ["workspaces"] });
          toast("Workspace deleted");
          navigate("/");
        }} />
      {consentDialog}
    </div>
  );
}
