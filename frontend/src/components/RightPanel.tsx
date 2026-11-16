import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, FileType2, Image as ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { AnalysisContent, EmailContent, WorkspaceDetail } from "../lib/types";
import { fileSize, PROVENANCE_LABELS, timeAgo } from "../lib/format";
import { FilePreview } from "./FilePreview";
import { SourceList } from "./SourceList";
import { ConfirmDialog } from "./Dialog";
import { Spinner } from "./ui";

const STATUS: Record<string, string> = { uploaded: "Queued", extracting: "Reading…", ready: "Ready", needs_vision: "Image · read on request", failed: "Couldn't read" };

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      <h3 className="eyebrow mb-2">{title}{count !== undefined && <span className="ml-1 normal-case tracking-normal text-faint">{count}</span>}</h3>
      {children}
    </section>
  );
}

export function RightPanel({ ws, focusId }: { ws: WorkspaceDetail; focusId: string | null }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const { data: related } = useQuery({ queryKey: ["related", ws.id, ws.messages.length], queryFn: () => api.related(ws.id) });
  const focus = ws.analyses.find((a) => a.id === focusId) ?? ws.reviews.find((r) => r.id === focusId) ?? [...ws.analyses].reverse()[0];
  const latest = [...ws.analyses].reverse().find((a) => a.structured);
  const pendingQs: string[] = [];
  if (latest?.workflow === "email") {
    const c = latest.content as EmailContent;
    pendingQs.push(...(c.unresolved_questions ?? []), ...(c.uncertainties ?? []));
  } else if (latest) {
    pendingQs.push(...((latest.content as AnalysisContent).missing_information ?? []));
  }
  const openTasks = ws.tasks.filter((t) => t.status === "open");
  const pendingDecisions = ws.decisions.filter((d) => d.status === "pending");
  return (
    <div className="text-sm">
      <Section title="Files" count={ws.attachments.length}>
        {ws.attachments.length === 0 ? <p className="text-xs text-faint">Drop or paste files into the input below.</p> : (
          <ul className="space-y-1">
            {ws.attachments.map((a) => (
              <li key={a.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-sunken">
                <span className="text-muted">{a.kind === "image" ? <ImageIcon className="h-4 w-4" /> : a.kind === "pdf" ? <FileType2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setPreview(a.id)}>
                  <span className="block truncate text-[0.82rem]">{a.filename}</span>
                  <span className={`flex items-center gap-1 text-2xs ${a.status === "failed" ? "text-danger" : "text-faint"}`}>
                    {["uploaded", "extracting"].includes(a.status) && <Spinner className="h-3 w-3" />}
                    {a.status === "failed" && <AlertTriangle className="h-3 w-3" />}
                    {a.status === "ready" && a.transcribed && a.kind === "image" ? "Read by AI (transcription)" : STATUS[a.status]}
                    {a.vision_pages > 0 && a.status === "ready" && ` · ${a.vision_pages} image-only page${a.vision_pages > 1 ? "s" : ""}${a.transcribed ? " (AI-transcribed)" : ""}`}
                    {" · "}{fileSize(a.size_bytes)}
                  </span>
                </button>
                {a.status === "failed" && (
                  <button className="text-faint hover:text-ink" title="Retry reading" onClick={async () => { await api.retryAttachment(a.id); await qc.invalidateQueries({ queryKey: ["workspace", ws.id] }); }}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button className="text-faint opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${a.filename}`} onClick={() => setDel(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Source references" count={focus?.sources.length ?? 0}>
        {focus ? <SourceList sources={focus.sources} compact /> : <p className="text-xs text-faint">Cited evidence appears here.</p>}
      </Section>
      <Section title="Relevant prior knowledge" count={related?.items.length ?? 0}>
        {related?.items.length ? (
          <ul className="space-y-2">
            {related.items.map((k) => (
              <li key={`${k.kind}-${k.ref_id}`}>
                <Link to={k.kind === "draft" ? `/drafts/${k.ref_id}` : `/knowledge?q=${encodeURIComponent(k.title)}`} className="block rounded-md px-1.5 py-1 hover:bg-sunken">
                  <span className="block truncate text-[0.82rem] font-medium">{k.title}</span>
                  <span className="text-2xs text-faint">{k.kind === "knowledge" ? "Knowledge" : k.kind === "draft" ? "Draft" : "Earlier analysis"} · {PROVENANCE_LABELS[k.provenance] ?? k.provenance}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-faint">Nothing related in your saved work yet.</p>}
      </Section>
      <Section title="Deliverables" count={ws.drafts.length}>
        {ws.drafts.length ? (
          <ul className="space-y-1">
            {ws.drafts.map((d) => (
              <li key={d.id}>
                <Link to={`/drafts/${d.id}`} className="block rounded-md px-1.5 py-1 hover:bg-sunken">
                  <span className="block truncate text-[0.82rem]">{d.title}</span>
                  <span className="text-2xs capitalize text-faint">{d.kind.replace("_", " ")} · v{d.current_version} · {timeAgo(d.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-faint">Drafts and memos appear here.</p>}
      </Section>
      <Section title="Pending" count={openTasks.length + pendingDecisions.length + pendingQs.length}>
        {openTasks.length + pendingDecisions.length + pendingQs.length === 0 ? <p className="text-xs text-faint">No open questions, tasks or decisions.</p> : (
          <div className="space-y-2.5">
            {pendingQs.length > 0 && <ul className="space-y-1 text-[0.82rem]">{pendingQs.slice(0, 6).map((q, i) => <li key={i} className="flex gap-1.5"><span className="text-warn">?</span>{q}</li>)}</ul>}
            {(openTasks.length > 0 || pendingDecisions.length > 0) && (
              <Link to="/decisions" className="block text-[0.82rem] text-accent hover:underline">
                {openTasks.length} open task{openTasks.length === 1 ? "" : "s"} · {pendingDecisions.length} pending decision{pendingDecisions.length === 1 ? "" : "s"}
              </Link>
            )}
          </div>
        )}
      </Section>
      <FilePreview attachmentId={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Remove this file?"
        body="The file and its extracted text are removed from this workspace. Analyses that already cited it keep their quotes."
        confirmLabel="Remove file"
        onConfirm={async () => { await api.deleteAttachment(del!); setDel(null); await qc.invalidateQueries({ queryKey: ["workspace", ws.id] }); }} />
    </div>
  );
}
