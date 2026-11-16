import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { diffWords } from "diff";
import { Check, Copy, Eye, History, Maximize2, PenLine, RotateCcw, Save, Sparkles, Wand2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Draft, DraftVersion } from "../lib/types";
import { copyText, timeAgo } from "../lib/format";
import { useAI } from "../hooks/useAI";
import { ExportMenu } from "./ExportMenu";
import { Markdown } from "./Markdown";
import { useToast } from "./useToast";
import { PRESETS } from "../lib/actions";
import { Dialog } from "./Dialog";
import { Spinner } from "./ui";

export function DiffView({ a, b }: { a: string; b: string }) {
  const parts = useMemo(() => diffWords(a, b), [a, b]);
  return (
    <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
      {parts.map((p, i) => <span key={i} className={p.added ? "diff-add" : p.removed ? "diff-del" : ""}>{p.value}</span>)}
    </div>
  );
}

function versionText(v: DraftVersion) {
  return (v.subject ? `Subject: ${v.subject}\n\n` : "") + v.body;
}

export function DraftEditor({ draft, mode = "inline", onChanged }: { draft: Draft; mode?: "inline" | "full"; onChanged?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { run, consentDialog } = useAI();
  const isEmail = draft.kind === "email";
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const [title, setTitle] = useState(draft.title);
  const [preview, setPreview] = useState(!isEmail && draft.body.trim().length > 0);
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compare, setCompare] = useState<[number, number] | null>(null);

  // When the server copy changes (new version), refresh the editor unless the user has unsaved edits.
  const serverKey = `${draft.id}:${draft.current_version}`;
  const [loadedKey, setLoadedKey] = useState(serverKey);
  const dirty = body !== draft.body || (subject || "") !== (draft.subject || "") || title !== draft.title;
  useEffect(() => {
    if (serverKey !== loadedKey) {
      setBody(draft.body); setSubject(draft.subject ?? ""); setTitle(draft.title); setLoadedKey(serverKey);
    }
  }, [serverKey, loadedKey, draft.body, draft.subject, draft.title]);

  const refresh = async () => { await qc.invalidateQueries(); onChanged?.(); };

  const save = async (note?: string) => {
    setSaving(true);
    try {
      await api.saveDraft(draft.id, { title, subject: isEmail ? subject : undefined, body, note });
      toast("Draft saved");
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (mode !== "full") return;
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const rewrite = async (preset?: string, instruction?: string) => {
    if (dirty) await api.saveDraft(draft.id, { title, subject: isEmail ? subject : undefined, body, note: "Edited" });
    setRewriting(preset ?? "custom");
    const r = await run(() => api.rewrite(draft.id, preset ? { preset } : { instruction }));
    setRewriting(null);
    if (r?.status === "succeeded") { toast("Revised draft ready (previous version kept)"); setCustom(""); await refresh(); }
  };

  const copy = async () => {
    const ok = await copyText(body); // the draft text only, never the surrounding analysis
    setCopied(ok);
    toast(ok ? "Draft copied to clipboard" : "Couldn't access the clipboard.", ok ? "ok" : "error");
    setTimeout(() => setCopied(false), 1800);
  };

  const versions = draft.versions ?? [];
  const cur = versions[versions.length - 1];
  return (
    <div className={mode === "full" ? "grid gap-6 xl:grid-cols-[1fr_17rem]" : ""}>
      <div className="min-w-0">
        {mode === "full" && (
          <input className="mb-3 w-full bg-transparent font-serif text-2xl font-semibold tracking-tight focus:outline-none" value={title}
            onChange={(e) => setTitle(e.target.value)} aria-label="Draft title" />
        )}
        <div className="panel overflow-hidden">
          {isEmail && (
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm">
              <span className="text-muted">Subject</span>
              <input className="flex-1 bg-transparent focus:outline-none" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Email subject" />
              {subject && <button className="btn-ghost btn-sm" onClick={async () => { await copyText(subject); toast("Subject copied"); }}>Copy subject</button>}
            </div>
          )}
          {preview ? (
            <div className="min-h-[12rem] px-5 py-4"><Markdown>{body}</Markdown></div>
          ) : (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Draft text" data-testid="draft-body"
              className={`block w-full resize-y bg-transparent px-4 py-3 font-serif leading-relaxed text-ink focus:outline-none ${mode === "full" ? "min-h-[28rem] text-[1.02rem]" : "min-h-[14rem] text-[0.97rem]"}`} />
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/40 px-3 py-2">
            <button className="btn-primary btn-sm" onClick={copy} data-testid="copy-draft">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : isEmail ? "Copy email" : "Copy"}
            </button>
            <button className="btn-secondary btn-sm" onClick={() => save()} disabled={!dirty || saving} data-testid="save-draft">
              {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} Save{dirty ? "" : "d"}
            </button>
            {!isEmail && (
              <button className="btn-ghost btn-sm" onClick={() => setPreview(!preview)}>
                {preview ? <><PenLine className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Preview</>}
              </button>
            )}
            <ExportMenu sourceType="draft" sourceId={draft.id} small />
            {mode === "inline" && (
              <Link to={`/drafts/${draft.id}`} className="btn-ghost btn-sm"><Maximize2 className="h-3.5 w-3.5" /> Open editor</Link>
            )}
            <span className="ml-auto text-2xs text-faint">
              {dirty ? "Unsaved changes" : `v${draft.current_version}${cur?.note ? ` · ${cur.note}` : ""}`}
            </span>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted"><Wand2 className="h-3.5 w-3.5" /> Revise</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Writing controls">
            {PRESETS.map((p) => (
              <button key={p.id} className="chip" disabled={!!rewriting} onClick={() => rewrite(p.id)} data-testid={`rewrite-${p.id}`}>
                {rewriting === p.id && <Spinner className="h-3 w-3" />} {p.label}
              </button>
            ))}
          </div>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void rewrite(undefined, custom.trim()); }}>
            <input className="input py-1.5" placeholder="Or say how to change it, e.g. “mention the March 31 deadline”" value={custom}
              onChange={(e) => setCustom(e.target.value)} aria-label="Custom revision instruction" />
            <button className="btn-secondary" disabled={!custom.trim() || !!rewriting}>
              {rewriting === "custom" ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} Revise
            </button>
          </form>
        </div>
      </div>
      {mode === "full" && (
        <aside aria-label="Version history">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><History className="h-4 w-4" /> Versions</div>
          <ol className="space-y-1.5">
            {[...versions].reverse().map((v) => (
              <li key={v.version} className="rounded-lg border border-line bg-surface p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">v{v.version} {v.version === draft.current_version && <span className="text-accent">· current</span>}</span>
                  <span className="text-faint">{timeAgo(v.created_at)}</span>
                </div>
                <div className="mt-0.5 text-muted">{v.note || (v.author === "user" ? "Edited" : "Generated")} · {v.author === "user" ? "you" : "AI"}</div>
                {v.version !== draft.current_version && (
                  <div className="mt-1.5 flex gap-1">
                    <button className="btn-ghost btn-sm px-1.5" onClick={() => setCompare([v.version, draft.current_version])}>Compare with current</button>
                    <button className="btn-ghost btn-sm px-1.5" onClick={async () => { await api.restoreVersion(draft.id, v.version); toast(`Restored v${v.version} as a new version`); await refresh(); }}>
                      <RotateCcw className="h-3 w-3" /> Restore
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </aside>
      )}
      {compare && (
        <Dialog open onClose={() => setCompare(null)} wide title={`Compare v${compare[0]} → v${compare[1]}`} description="Green text was added; struck-through text was removed.">
          <DiffView a={versionText(versions.find((v) => v.version === compare[0])!)} b={versionText(versions.find((v) => v.version === compare[1])!)} />
        </Dialog>
      )}
      {consentDialog}
    </div>
  );
}
