import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, FileText, FileType2, Image as ImageIcon, Paperclip, X, AlertTriangle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Attachment } from "../lib/types";
import { fileSize } from "../lib/format";
import { FilePreview } from "./FilePreview";
import { Spinner } from "./ui";
import { useToast } from "./useToast";
import { ACTIONS, WORKFLOWS } from "../lib/actions";

const ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown";
const SUPPORTED = /\.(pdf|docx|txt|md|markdown|png|jpe?g|webp)$/i;

export interface SubmitPayload { instruction: string; attachmentIds: string[]; action: string | null; workflow: string | null }

type Item = { key: string; file?: File; att?: Attachment; error?: string; preview?: string };

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Queued", extracting: "Reading…", ready: "Ready", needs_vision: "Image: read by AI on request", failed: "Couldn't read",
};

function KindIcon({ kind }: { kind?: string }) {
  if (kind === "image") return <ImageIcon className="h-4 w-4" />;
  if (kind === "pdf") return <FileType2 className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export function UniversalInput({ onSubmit, variant = "hero", busy = false, placeholder, footer, autoFocus = false }: {
  onSubmit: (p: SubmitPayload) => Promise<boolean>; variant?: "hero" | "compact"; busy?: boolean; placeholder?: string;
  footer?: ReactNode; autoFocus?: boolean;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [action, setAction] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState("");
  const [dragging, setDragging] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pasteCount = useRef(0);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const bad = files.filter((f) => !SUPPORTED.test(f.name) && !f.type.startsWith("image/"));
    bad.forEach((f) => toast(`“${f.name}” isn't supported. Use PDF, DOCX, TXT, MD, PNG, JPG or WEBP.`, "error"));
    const good = files.filter((f) => !bad.includes(f));
    if (!good.length) return;
    const pending: Item[] = good.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined }));
    setItems((cur) => [...cur, ...pending]);
    setSuggest(false);
    // One request per file: each file gets its own progress, result and error message.
    await Promise.all(pending.map(async (p) => {
      try {
        const res = await api.upload([p.file!]);
        const att = res.attachments[0];
        setItems((cur) => cur.map((i) => (i.key === p.key ? { ...i, att } : i)));
        if (att?.duplicate_of) toast(`“${att.filename}” was uploaded before; a new copy was attached.`, "info");
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Upload failed.";
        setItems((cur) => cur.map((i) => (i.key === p.key ? { ...i, error: msg } : i)));
        toast(msg, "error");
      }
    }));
  };

  // Screenshot paste (Ctrl/Cmd+V) anywhere on the page while this input is mounted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
      if (!files.length) return;
      e.preventDefault();
      const named = files.map((f) => {
        if (f.name && f.name !== "image.png") return f;
        pasteCount.current += 1;
        const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
        return new File([f], `Pasted screenshot ${pasteCount.current}.${ext}`, { type: f.type });
      });
      void addFiles(named);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll extraction status for staged files.
  useEffect(() => {
    const pendingIds = items.filter((i) => i.att && ["uploaded", "extracting"].includes(i.att.status)).map((i) => i.att!.id);
    if (!pendingIds.length) return;
    const t = setTimeout(async () => {
      const fresh = await Promise.all(pendingIds.map((id) => api.attachment(id).catch(() => null)));
      setItems((cur) => cur.map((i) => {
        const f = fresh.find((x) => x && x.id === i.att?.id);
        return f ? { ...i, att: f } : i;
      }));
    }, 600);
    return () => clearTimeout(t);
  }, [items]);

  useEffect(() => { if (autoFocus) taRef.current?.focus(); }, [autoFocus]);

  const remove = async (it: Item) => {
    setItems((cur) => cur.filter((i) => i !== it));
    if (it.preview) URL.revokeObjectURL(it.preview);
    if (it.att) await api.deleteAttachment(it.att.id).catch(() => undefined);
  };

  const uploading = items.some((i) => !i.att && !i.error);
  const ready = items.filter((i) => i.att && i.att.status !== "failed");
  const canSubmit = !busy && !submitting && !uploading && (text.trim().length > 0 || ready.length > 0 || action === "challenge");

  const submit = async (overrideAction?: string) => {
    const act = overrideAction ?? action;
    if (!text.trim() && !act && ready.length > 0) { setSuggest(true); return; }
    if (!canSubmit && !overrideAction) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit({ instruction: text.trim(), attachmentIds: ready.map((i) => i.att!.id), action: act === "ask" ? null : act, workflow: workflow || null });
      if (ok) {
        items.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
        setText(""); setItems([]); setAction(null); setSuggest(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hero = variant === "hero";
  const actionHint = ACTIONS.find((a) => a.id === action)?.hint;
  return (
    <div ref={rootRef}
      className={`panel relative transition-shadow ${dragging ? "border-accent ring-4 ring-accent/15" : "focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10"} ${hero ? "shadow-card" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!rootRef.current?.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)); }}
      data-testid="universal-input">
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-accent-soft/80 text-sm font-medium text-accent">
          Drop files to attach
        </div>
      )}
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-b border-line p-3" aria-label="Attachments">
          {items.map((it) => {
            const a = it.att;
            const status = it.error ? "failed" : a ? a.status : "uploading";
            return (
              <li key={it.key} className={`group flex max-w-[16rem] items-center gap-2 rounded-lg border bg-sunken/60 py-1.5 pl-1.5 pr-1 text-xs ${status === "failed" ? "border-danger/40" : "border-line"}`}>
                <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => a && setPreview(a.id)} disabled={!a} title={it.error ?? "Preview"}>
                  {it.preview ? <img src={it.preview} alt="" className="h-8 w-8 rounded object-cover object-top" />
                    : <span className="flex h-8 w-8 items-center justify-center rounded bg-surface text-muted"><KindIcon kind={a?.kind} /></span>}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{it.file?.name ?? a?.filename}</span>
                    <span className={`flex items-center gap-1 ${status === "failed" ? "text-danger" : "text-muted"}`}>
                      {(status === "uploading" || status === "extracting" || status === "uploaded") && <Spinner className="h-3 w-3" />}
                      {status === "failed" && <AlertTriangle className="h-3 w-3" />}
                      {status === "uploading" ? "Uploading…" : status === "failed" ? (it.error ?? a?.error ?? STATUS_LABEL.failed) : STATUS_LABEL[status]}
                      {a && status === "ready" && <span className="text-faint">· {fileSize(a.size_bytes)}{a.page_count ? ` · ${a.page_count}p` : ""}</span>}
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => remove(it)} className="rounded p-1 text-faint hover:bg-surface hover:text-ink" aria-label={`Remove ${it.file?.name ?? a?.filename}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} rows={hero ? 3 : 2}
        placeholder={actionHint ?? placeholder ?? "Paste screenshots, drop documents, or type what you need…"}
        aria-label="Instruction"
        className={`block w-full resize-none bg-transparent px-4 pt-3.5 text-ink placeholder:text-faint focus:outline-none ${hero ? "min-h-[6.5rem] text-[1.02rem]" : "min-h-[3.5rem] text-sm"}`}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
        onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 360)}px`; }} />
      {suggest && (
        <div className="mx-3 mb-2 rounded-lg bg-accent-soft/60 px-3 py-2 text-sm">
          <p className="mb-1.5 text-accent">What would you like to do with {ready.length === 1 ? "this file" : "these files"}?</p>
          <div className="flex flex-wrap gap-1.5">
            {(ready.some((i) => i.att!.kind === "image") ? ["reply", "summarize", "analyze"] : ["summarize", "analyze", "review_document", "memo"]).map((id) => (
              <button key={id} className="chip" onClick={() => void submit(id)}>{ACTIONS.find((a) => a.id === id)!.label}</button>
            ))}
            <button className="chip" onClick={() => { setSuggest(false); taRef.current?.focus(); }}>Type an instruction</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-1">
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" data-testid="file-input"
          onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <button type="button" className="btn-ghost px-2" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files (or paste a screenshot)">
          <Paperclip className="h-4 w-4" /> {hero && <span>Attach</span>}
        </button>
        {!hero && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="sr-only sm:not-sr-only">Workflow</span>
            <select value={workflow} onChange={(e) => setWorkflow(e.target.value)} className="w-auto rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink" aria-label="Workflow">
              {WORKFLOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </label>
        )}
        {footer}
        <span className="ml-auto hidden text-2xs text-faint sm:inline"><span className="kbd">Ctrl</span> <span className="kbd">Enter</span> to send · <span className="kbd">Ctrl</span> <span className="kbd">V</span> pastes screenshots</span>
        <button type="button" className="btn-primary ml-auto h-8 w-8 justify-center rounded-full p-0 sm:ml-0" onClick={() => void submit()} disabled={!canSubmit && !(ready.length && !text.trim())}
          aria-label="Send" data-testid="submit">
          {submitting || busy ? <Spinner /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
      {hero && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2.5" role="group" aria-label="Suggested actions">
          {ACTIONS.map((a) => (
            <button key={a.id} type="button" aria-pressed={action === a.id}
              className={`chip ${action === a.id ? "border-accent bg-accent-soft text-accent" : ""}`}
              onClick={() => { setAction(action === a.id ? null : a.id); taRef.current?.focus(); }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <FilePreview attachmentId={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
