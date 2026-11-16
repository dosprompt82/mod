import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookmarkPlus, CheckSquare, FileText, GitCompare, ListChecks, MessagesSquare, Send, ShieldQuestion, Swords } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { ActionItem, Analysis, AnalysisContent, DecisionItem, Draft, EmailContent, Review, WorkspaceDetail } from "../lib/types";
import { useToast } from "./useToast";
import { DraftEditor } from "./DraftEditor";
import { Markdown } from "./Markdown";
import { SourceList } from "./SourceList";
import { ExportMenu } from "./ExportMenu";
import { Dialog } from "./Dialog";
import { BulletList, Collapsible, MockNotice, SeverityBadge, Spinner } from "./ui";

export interface ResultActions {
  challenge: (type: "analysis" | "draft", id: string) => void;
  memo: () => void;
  deliverable: (action: "talking_points" | "follow_up") => void;
  revise: (analysisId: string) => Promise<void>;
  reviseDraft: (draftId: string, instruction: string) => Promise<void>;
}

const BASIS: Record<string, [string, string]> = {
  observed: ["Observed", "bg-accent-soft text-accent"], document: ["Document", "bg-accent-soft text-accent"],
  user_provided: ["You said", "bg-ok-soft text-ok"], assumption: ["Assumption", "bg-warn-soft text-warn"], inference: ["Inference", "bg-sunken text-muted"],
};

function useSaver() {
  const toast = useToast();
  const qc = useQueryClient();
  return async (source_type: "analysis" | "draft" | "review", source_id: string) => {
    try {
      await api.saveToKnowledge({ source_type, source_id });
      toast("Saved to Knowledge (marked as approved by you, originally AI-generated)");
      await qc.invalidateQueries();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save.", "error");
    }
  };
}

function CreateItems({ ws, actions, decisions }: { ws: WorkspaceDetail; actions: ActionItem[]; decisions: DecisionItem[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const existing = new Set([...ws.tasks.map((t) => t.title), ...ws.decisions.map((d) => d.title)]);
  const newActions = actions.filter((a) => !existing.has(a.title));
  const newDecisions = decisions.filter((d) => !existing.has(d.question));
  if (!newActions.length && !newDecisions.length) return null;
  const create = async () => {
    setBusy(true);
    try {
      for (const a of newActions) {
        await api.createTask({ title: a.title, kind: a.kind, owner: a.owner ?? null, due_date: a.due ?? null, workspace_id: ws.id, source: "extracted", source_excerpt: a.due ?? null });
      }
      for (const d of newDecisions) {
        await api.createDecision({ title: d.question, options: d.options, recommendation: d.recommendation ?? null, workspace_id: ws.id, source: "ai_suggested" });
      }
      toast(`Added ${newActions.length} task(s) and ${newDecisions.length} decision(s)`);
      await qc.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn-secondary btn-sm" onClick={create} disabled={busy} title="You review them on the Decisions page">
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
      Track {newActions.length ? `${newActions.length} action item${newActions.length > 1 ? "s" : ""}` : ""}{newActions.length && newDecisions.length ? " and " : ""}{newDecisions.length ? `${newDecisions.length} decision${newDecisions.length > 1 ? "s" : ""}` : ""}
    </button>
  );
}

function ItemsList({ actions, decisions }: { actions: ActionItem[]; decisions: DecisionItem[] }) {
  if (!actions.length && !decisions.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {actions.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5">Action items</div>
          <BulletList items={actions.map((a) => <span key={a.title}>{a.title}<span className="text-muted">{a.kind === "waiting_on" ? " · waiting on others" : a.kind === "respond" ? " · reply owed" : ""}{a.due ? ` · due: ${a.due}` : ""}</span></span>)} />
        </div>
      )}
      {decisions.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5">Decisions for you</div>
          <BulletList items={decisions.map((d) => <span key={d.question}>{d.question}{d.recommendation && <span className="text-muted"> · suggested: {d.recommendation}</span>}</span>)} />
        </div>
      )}
    </div>
  );
}

export function EmailResult({ a, ws, act }: { a: Analysis; ws: WorkspaceDetail; act: ResultActions }) {
  const c = a.content as EmailContent;
  const save = useSaver();
  const draft = ws.drafts.find((d) => d.id === c.draft_id);
  return (
    <article className="space-y-5" data-testid="email-result">
      <MockNotice provider={a.provider} />
      <section>
        <div className="eyebrow mb-1">What they are asking</div>
        <p className="font-serif text-[1.15rem] leading-snug" data-testid="email-asking">{c.asking}</p>
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        {c.context?.length > 0 && <section><div className="eyebrow mb-1.5">Important context</div><BulletList items={c.context} /></section>}
        <section>
          <div className="eyebrow mb-1.5">What requires my decision</div>
          {c.decisions?.length ? (
            <ul className="space-y-2 text-[0.94rem]">
              {c.decisions.map((d, i) => (
                <li key={i}>
                  <div>{d.question}</div>
                  {d.options?.length > 0 && <div className="mt-0.5 text-xs text-muted">Options: {d.options.join(" · ")}</div>}
                  {d.recommendation && <div className="mt-0.5 text-xs text-accent">Suggested: {d.recommendation}</div>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing needs a decision from you.</p>}
        </section>
      </div>
      {c.deadlines?.length > 0 && (
        <section className="rounded-lg border border-warn/30 bg-warn-soft/60 px-3 py-2 text-sm">
          <span className="font-medium text-warn">Deadline{c.deadlines.length > 1 ? "s" : ""} as stated: </span>{c.deadlines.join("; ")}
        </section>
      )}
      <section><div className="eyebrow mb-1">Recommended approach</div><p className="text-[0.95rem] leading-relaxed">{c.approach}</p></section>
      <section>
        <div className="eyebrow mb-1.5">Draft response</div>
        {draft ? <DraftEditor draft={draft} /> : <p className="text-sm text-muted">The draft was deleted.</p>}
      </section>
      {c.uncertainties?.length > 0 && (
        <section>
          <div className="eyebrow mb-1.5 flex items-center gap-1 text-warn"><AlertTriangle className="h-3.5 w-3.5" /> Uncertainties</div>
          <BulletList items={c.uncertainties} />
        </section>
      )}
      <div className="panel px-4 py-1">
        {c.thread?.length > 0 && (
          <Collapsible title="Thread, oldest first" count={c.thread.length}>
            <ol className="space-y-3">
              {c.thread.map((m, i) => (
                <li key={i} className="border-l-2 border-line pl-3 text-sm">
                  <div className="text-xs text-muted">{[m.sender, m.date].filter(Boolean).join(" · ") || "Sender/date not visible"}{m.recipients ? ` → ${m.recipients}` : ""}</div>
                  {m.subject && <div className="text-xs font-medium">{m.subject}</div>}
                  <p className="mt-0.5">{m.summary}</p>
                </li>
              ))}
            </ol>
          </Collapsible>
        )}
        {(c.implied_expectations?.length > 0 || c.unresolved_questions?.length > 0) && (
          <Collapsible title="Expectations and open questions">
            {c.implied_expectations?.length > 0 && <><div className="eyebrow mb-1">Implied expectations</div><BulletList items={c.implied_expectations} className="mb-3" /></>}
            {c.unresolved_questions?.length > 0 && <><div className="eyebrow mb-1">Unresolved questions</div><BulletList items={c.unresolved_questions} /></>}
          </Collapsible>
        )}
        {c.dynamics && <Collapsible title="Interpersonal dynamics"><p className="text-sm text-muted">{c.dynamics}</p></Collapsible>}
        <Collapsible title="Supporting evidence" count={a.sources.length}><SourceList sources={a.sources} /></Collapsible>
      </div>
      <ItemsList actions={c.action_items ?? []} decisions={[]} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" onClick={() => act.challenge("analysis", a.id)}><Swords className="h-3.5 w-3.5" /> Challenge this</button>
        <CreateItems ws={ws} actions={c.action_items ?? []} decisions={c.decisions ?? []} />
        <button className="btn-ghost btn-sm" onClick={() => save("analysis", a.id)}><BookmarkPlus className="h-3.5 w-3.5" /> Save to Knowledge</button>
        <ExportMenu sourceType="analysis" sourceId={a.id} small />
      </div>
    </article>
  );
}

export function AnalysisResult({ a, ws, act }: { a: Analysis; ws: WorkspaceDetail; act: ResultActions }) {
  const save = useSaver();
  const [compare, setCompare] = useState(false);
  const parent = a.parent_analysis_id ? ws.analyses.find((x) => x.id === a.parent_analysis_id) : null;
  if (!a.structured) {
    return (
      <article className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-warn"><AlertTriangle className="h-3.5 w-3.5" /> The AI response couldn't be validated as structured output, so it is shown as plain text.</div>
        <Markdown>{a.markdown}</Markdown>
      </article>
    );
  }
  if (a.workflow === "knowledge" || a.workflow === "strategy") {
    return (
      <article className="space-y-3">
        <MockNotice provider={a.provider} />
        <Markdown>{a.markdown.replace(/## Supporting sources[\s\S]*$/, "")}</Markdown>
        {a.sources.length > 0 && <div className="panel px-4 py-1"><Collapsible title="Supporting evidence" count={a.sources.length} defaultOpen><SourceList sources={a.sources} /></Collapsible></div>}
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => save("analysis", a.id)}><BookmarkPlus className="h-3.5 w-3.5" /> Save to Knowledge</button>
          <ExportMenu sourceType="analysis" sourceId={a.id} small />
        </div>
      </article>
    );
  }
  const c = a.content as AnalysisContent;
  const concise = c.answer_type === "concise";
  return (
    <article className="space-y-4" data-testid="analysis-result">
      <MockNotice provider={a.provider} />
      {parent && <div className="badge bg-accent-soft text-accent">Revised after critical review · original kept</div>}
      <section>
        <div className="eyebrow mb-1">{concise ? "Answer" : "Executive conclusion"}</div>
        <p className="font-serif text-[1.12rem] leading-relaxed" data-testid="exec-conclusion">{c.executive_conclusion}</p>
      </section>
      {c.facts?.length > 0 && (
        <section>
          <div className="eyebrow mb-1.5">Relevant facts</div>
          <ul className="space-y-1.5">
            {c.facts.map((f, i) => (
              <li key={i} className="flex gap-2 text-[0.94rem] leading-relaxed">
                <span className={`badge mt-0.5 h-fit shrink-0 ${BASIS[f.basis]?.[1] ?? ""}`}>{BASIS[f.basis]?.[0] ?? f.basis}</span>
                <span>{f.statement}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {c.key_issues?.length > 0 && <section><div className="eyebrow mb-1.5">Key issues</div><BulletList items={c.key_issues} /></section>}
      {c.analysis && <section><div className="eyebrow mb-1">Analysis</div><Markdown>{c.analysis}</Markdown></section>}
      <div className="panel px-4 py-1">
        {c.alternatives?.length > 0 && <Collapsible title="Alternative interpretations" count={c.alternatives.length}><BulletList items={c.alternatives} /></Collapsible>}
        {c.risks?.length > 0 && <Collapsible title="Risks and uncertainties" count={c.risks.length} defaultOpen={!concise}><BulletList items={c.risks} /></Collapsible>}
        {c.missing_information?.length > 0 && <Collapsible title="Missing information that could change the answer" count={c.missing_information.length}><BulletList items={c.missing_information} /></Collapsible>}
        {c.next_steps?.length > 0 && <Collapsible title="Recommended next steps" count={c.next_steps.length} defaultOpen={!concise}><BulletList items={c.next_steps} /></Collapsible>}
        {c.external_guidance_note && (
          <Collapsible title="External guidance (verify against current authoritative text)" defaultOpen>
            <p className="flex gap-2 text-sm text-muted"><ShieldQuestion className="h-4 w-4 shrink-0 text-warn" />{c.external_guidance_note}</p>
          </Collapsible>
        )}
        <Collapsible title="Supporting evidence" count={a.sources.length}><SourceList sources={a.sources} /></Collapsible>
      </div>
      <ItemsList actions={c.action_items ?? []} decisions={c.decisions ?? []} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" onClick={() => act.challenge("analysis", a.id)} data-testid="challenge"><Swords className="h-3.5 w-3.5" /> Challenge this</button>
        <button className="btn-secondary btn-sm" onClick={act.memo}><FileText className="h-3.5 w-3.5" /> Create memo</button>
        <button className="btn-ghost btn-sm" onClick={() => act.deliverable("talking_points")}><MessagesSquare className="h-3.5 w-3.5" /> Talking points</button>
        <button className="btn-ghost btn-sm" onClick={() => act.deliverable("follow_up")}><Send className="h-3.5 w-3.5" /> Draft follow-up</button>
        <CreateItems ws={ws} actions={c.action_items ?? []} decisions={c.decisions ?? []} />
        <button className="btn-ghost btn-sm" onClick={() => save("analysis", a.id)}><BookmarkPlus className="h-3.5 w-3.5" /> Save to Knowledge</button>
        {parent && <button className="btn-ghost btn-sm" onClick={() => setCompare(true)}><GitCompare className="h-3.5 w-3.5" /> Compare with original</button>}
        <ExportMenu sourceType="analysis" sourceId={a.id} small />
      </div>
      {parent && <CompareDialog open={compare} onClose={() => setCompare(false)} original={parent} revised={a} />}
    </article>
  );
}

export function CompareDialog({ open, onClose, original, revised }: { open: boolean; onClose: () => void; original: Analysis; revised: Analysis }) {
  return (
    <Dialog open={open} onClose={onClose} wide title="Original and revised analysis" description="The original is never overwritten.">
      <div className="grid gap-6 md:grid-cols-2">
        {[["Original", original], ["Revised", revised]].map(([label, x]) => (
          <div key={label as string} className="min-w-0">
            <div className="eyebrow mb-2">{label as string}</div>
            <Markdown>{(x as Analysis).markdown.replace(/## Supporting sources[\s\S]*$/, "")}</Markdown>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function ReviewResult({ r, ws, act }: { r: Review; ws: WorkspaceDetail; act: ResultActions }) {
  const save = useSaver();
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const c = r.content;
  if (!c?.verdict) return <Markdown>{r.markdown}</Markdown>;
  const groups: [string, string[]][] = [["Critical issues", ["critical", "high"]], ["Important improvements", ["medium"]], ["Minor improvements", ["low"]]];
  const target = r.target_type === "analysis" ? ws.analyses.find((x) => x.id === r.target_id) : ws.drafts.find((d) => d.id === r.target_id);
  const revision = r.target_type === "analysis" ? ws.analyses.find((x) => x.parent_analysis_id === r.target_id) : null;
  const verdict = { sound: ["Sound", "bg-ok-soft text-ok"], needs_revision: ["Needs revision", "bg-warn-soft text-warn"], unsound: ["Unsound", "bg-danger-soft text-danger"] }[c.verdict];
  return (
    <article className="space-y-4" data-testid="review-result">
      <MockNotice provider={r.provider} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`badge text-xs ${verdict[1]}`}>{verdict[0]}</span>
        {target && <span className="text-muted">Review of “{target.title}”{r.target_version ? ` (v${r.target_version})` : ""}</span>}
      </div>
      <p className="font-serif text-[1.05rem] leading-relaxed">{c.overall_assessment}</p>
      {groups.map(([title, sevs]) => {
        const items = c.issues.filter((i) => sevs.includes(i.severity));
        if (!items.length) return null;
        return (
          <section key={title}>
            <div className="eyebrow mb-2">{title}</div>
            <ul className="space-y-2.5">
              {items.map((i, k) => (
                <li key={k} className="rounded-lg border border-line p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2"><SeverityBadge s={i.severity} /><span className="text-xs text-muted">{i.category}</span></div>
                  <p className="text-[0.94rem]">{i.issue}</p>
                  {i.why_it_matters && <p className="mt-1 text-sm text-muted"><span className="font-medium text-ink">Why it matters: </span>{i.why_it_matters}</p>}
                  {i.suggestion && <p className="mt-1 text-sm text-muted"><span className="font-medium text-ink">Suggestion: </span>{i.suggestion}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {c.issues.length === 0 && <p className="text-sm text-ok">No material issues found.</p>}
      {c.strongest_counterargument && <section><div className="eyebrow mb-1">Strongest counterargument</div><p className="text-[0.95rem] leading-relaxed">{c.strongest_counterargument}</p></section>}
      {c.revised_conclusion && <section className="rounded-lg bg-accent-soft/50 p-3"><div className="eyebrow mb-1">Suggested revised conclusion</div><p className="font-serif leading-relaxed">{c.revised_conclusion}</p></section>}
      {r.sources.length > 0 && <div className="panel px-4 py-1"><Collapsible title="Supporting evidence" count={r.sources.length}><SourceList sources={r.sources} /></Collapsible></div>}
      <div className="flex flex-wrap gap-2">
        {r.target_type === "analysis" && !revision && (
          <button className="btn-primary btn-sm" disabled={busy} onClick={async () => { setBusy(true); await act.revise(r.target_id); setBusy(false); }}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />} Create revised analysis
          </button>
        )}
        {revision && target && <button className="btn-secondary btn-sm" onClick={() => setCompare(true)}><GitCompare className="h-3.5 w-3.5" /> Compare original and revised</button>}
        {r.target_type === "draft" && (
          <button className="btn-primary btn-sm" disabled={busy} onClick={async () => {
            setBusy(true);
            await act.reviseDraft(r.target_id, `Revise the draft to address this critical review. Keep all facts unless the review shows them to be wrong.\n\n${r.markdown.slice(0, 6000)}`);
            setBusy(false);
          }}>{busy ? <Spinner className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />} Revise draft using this review</button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => save("review", r.id)}><BookmarkPlus className="h-3.5 w-3.5" /> Save to Knowledge</button>
        <ExportMenu sourceType="review" sourceId={r.id} small />
      </div>
      {revision && target && <CompareDialog open={compare} onClose={() => setCompare(false)} original={target as Analysis} revised={revision} />}
    </article>
  );
}

export function DraftResult({ d, act }: { d: Draft; act: ResultActions }) {
  return (
    <article className="space-y-3" data-testid="draft-result">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-serif text-lg font-semibold">{d.title}</h3>
        <span className="badge bg-sunken text-muted capitalize">{d.kind.replace("_", " ")}</span>
      </div>
      <DraftEditor draft={d} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" onClick={() => act.challenge("draft", d.id)}><Swords className="h-3.5 w-3.5" /> Challenge this</button>
        <Link className="btn-ghost btn-sm" to={`/drafts/${d.id}`}>Version history</Link>
      </div>
    </article>
  );
}
