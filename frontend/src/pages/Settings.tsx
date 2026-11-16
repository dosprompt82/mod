import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Database, Download, KeyRound, Palette, PenTool, Shield, Upload, Wrench } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { WritingProfile } from "../lib/types";
import { fileSize, timeAgo } from "../lib/format";
import { applyTheme, type Theme } from "../lib/theme";
import { useAI } from "../hooks/useAI";
import { ConfirmDialog } from "../components/Dialog";
import { MockNotice, Spinner } from "../components/ui";
import { useToast } from "../components/useToast";

function Card({ id, icon, title, children, description }: { id: string; icon: ReactNode; title: string; children: ReactNode; description?: string }) {
  return (
    <section id={id} className="panel scroll-mt-6 p-5">
      <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold">{icon}{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-start sm:gap-4">
      <div className="pt-1.5 text-sm text-muted">{label}</div>
      <div>{children}{hint && <p className="mt-1 text-xs text-faint">{hint}</p>}</div>
    </div>
  );
}

const PROFILE_FIELDS: [string, string][] = [
  ["summary", "Summary"], ["tone", "Tone"], ["sentence_length", "Sentence length"], ["structure", "Structure"], ["vocabulary", "Vocabulary"],
  ["technical_depth", "Technical depth"], ["directness", "Directness"], ["formatting", "Formatting"],
];

function ProfileEditor({ p, onApprove }: { p: WritingProfile; onApprove?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const v: Record<string, string> = {};
    for (const [k] of PROFILE_FIELDS) v[k] = String(p.profile[k] ?? "");
    v.do = ((p.profile.do as string[]) ?? []).join("\n");
    v.avoid = ((p.profile.avoid as string[]) ?? []).join("\n");
    setVals(v);
  }, [p]);
  const save = async () => {
    const profile: Record<string, unknown> = { ...vals, do: vals.do.split("\n").filter(Boolean), avoid: vals.avoid.split("\n").filter(Boolean) };
    await api.editProfile(p.id, profile);
    await qc.invalidateQueries({ queryKey: ["profiles"] });
    toast("Profile saved");
  };
  return (
    <div className="space-y-2.5 rounded-lg border border-line p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`badge ${p.status === "approved" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{p.status === "approved" ? "Approved, in use" : "Proposed, not used until you approve it"}</span>
        <span className="text-xs text-faint">{timeAgo(p.approved_at ?? p.created_at)}</span>
      </div>
      <MockNotice provider={p.provider} />
      {PROFILE_FIELDS.map(([k, label]) => (
        <div key={k}><label className="label" htmlFor={`wp-${k}`}>{label}</label>
          <textarea id={`wp-${k}`} rows={k === "summary" ? 2 : 1} className="input" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></div>
      ))}
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="label" htmlFor="wp-do">Do (one per line)</label><textarea id="wp-do" rows={3} className="input" value={vals.do ?? ""} onChange={(e) => setVals({ ...vals, do: e.target.value })} /></div>
        <div><label className="label" htmlFor="wp-avoid">Avoid (one per line)</label><textarea id="wp-avoid" rows={3} className="input" value={vals.avoid ?? ""} onChange={(e) => setVals({ ...vals, avoid: e.target.value })} /></div>
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" onClick={save}>Save edits</button>
        {onApprove && <button className="btn-primary btn-sm" onClick={async () => { await save(); onApprove(); }}><CheckCircle2 className="h-3.5 w-3.5" /> Approve and use</button>}
        <button className="btn-ghost btn-sm ml-auto text-danger" onClick={async () => { await api.deleteProfile(p.id); await qc.invalidateQueries({ queryKey: ["profiles"] }); }}>Discard</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { run, consentDialog } = useAI();
  const { data: s } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: profiles } = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });
  const { data: backups } = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const { data: diag, refetch: refetchDiag } = useQuery({ queryKey: ["diagnostics"], queryFn: api.diagnostics });
  const { data: audit } = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sample, setSample] = useState("");
  const [profiling, setProfiling] = useState(false);
  const [clear, setClear] = useState<null | "history" | "knowledge" | "everything">(null);
  const [restoring, setRestoring] = useState<File | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (s) setModel(s.ai.model); }, [s?.ai.model]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  const savePref = async (b: Record<string, unknown>) => {
    try { await api.updateSettings(b); await qc.invalidateQueries({ queryKey: ["settings"] }); await qc.invalidateQueries({ queryKey: ["health"] }); toast("Saved"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't save.", "error"); }
  };
  const mock = s.ai.provider === "mock";
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="mb-2 font-serif text-2xl font-semibold">Settings</h1>
      <nav className="mb-6 flex flex-wrap gap-3 text-sm text-muted" aria-label="Settings sections">
        {[["ai", "AI provider"], ["appearance", "Appearance"], ["writing", "Writing"], ["knowledge", "Knowledge"], ["privacy", "Privacy"], ["app", "Application"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="hover:text-ink">{l}</a>
        ))}
      </nav>
      <div className="space-y-5">
        <Card id="ai" icon={<KeyRound className="h-4 w-4" />} title="AI provider"
          description="Analysis runs on Anthropic's API using your own key. Content you submit for analysis is sent to Anthropic; files stay on this computer otherwise.">
          {mock && <MockNotice provider="mock" />}
          <Row label="API key" hint={s.ai.key_source === "environment" ? "Set by the ANTHROPIC_API_KEY environment variable." : "Stored in your data folder (secrets.json, owner-only permissions). Never shown again after saving and never included in backups."}>
            {s.ai.key_configured ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm" data-testid="key-masked">{s.ai.key_masked}</span>
                <span className="badge bg-ok-soft text-ok">Configured</span>
                {s.ai.key_source !== "environment" && <button className="btn-ghost btn-sm text-danger" onClick={async () => { await api.setApiKey(null); await qc.invalidateQueries(); toast("API key removed"); }}>Remove</button>}
              </div>
            ) : (
              <form className="flex gap-2" onSubmit={async (e) => {
                e.preventDefault();
                try { await api.setApiKey(key); setKey(""); await qc.invalidateQueries(); toast("API key saved"); }
                catch (err) { toast(err instanceof ApiError ? err.message : "Couldn't save the key.", "error"); }
              }}>
                <input type="password" autoComplete="off" className="input font-mono" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Anthropic API key" />
                <button className="btn-primary" disabled={key.length < 20}>Save</button>
              </form>
            )}
          </Row>
          <Row label="Model" hint={`Any vision-capable Claude model identifier. Default: ${s.ai.default_model}.`}>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void savePref({ model: model.trim() }); }}>
              <input className="input font-mono" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model identifier" />
              <button className="btn-secondary" disabled={model === s.ai.model}>Save</button>
            </form>
          </Row>
          <Row label="Connection">
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-secondary" disabled={testing || (!s.ai.key_configured && !mock)} onClick={async () => {
                setTesting(true); setTestResult(null);
                try { const r = await api.testConnection(); setTestResult({ ok: true, message: r.message }); }
                catch (e) { setTestResult({ ok: false, message: e instanceof ApiError ? e.message : "Connection failed." }); }
                finally { setTesting(false); }
              }}>{testing && <Spinner className="h-3.5 w-3.5" />} Test connection</button>
              {testResult && <span className={`text-sm ${testResult.ok ? "text-ok" : "text-danger"}`}>{testResult.message}</span>}
            </div>
          </Row>
          <Row label="Usage (30 days)" hint="Cost is an estimate from published per-token prices; check your Anthropic console for billing.">
            {s.usage.by_model.length === 0 ? <span className="text-sm text-faint">No AI requests yet.</span> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="font-normal">Model</th><th className="font-normal">Requests</th><th className="font-normal">Tokens in / out</th><th className="font-normal">Est. cost</th></tr></thead>
                <tbody>{s.usage.by_model.map((u) => (
                  <tr key={u.model + u.provider}><td className="font-mono text-xs">{u.provider === "mock" ? "mock" : u.model}</td><td>{u.runs}</td>
                    <td className="tabular-nums">{u.input_tokens.toLocaleString()} / {u.output_tokens.toLocaleString()}</td><td className="tabular-nums">{u.cost_estimate != null ? `$${u.cost_estimate.toFixed(2)}` : "n/a"}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Row>
          <Row label="Analysis depth" hint="Deep asks the model to reason harder on analysis and review. Slower and costs more.">
            <select className="input w-auto" value={s.prefs.analysis_depth} onChange={(e) => savePref({ analysis_depth: e.target.value })} aria-label="Analysis depth">
              <option value="standard">Standard</option><option value="deep">Deep</option>
            </select>
          </Row>
        </Card>

        <Card id="appearance" icon={<Palette className="h-4 w-4" />} title="Appearance">
          <Row label="Theme">
            <div className="flex gap-1.5" role="radiogroup" aria-label="Theme">
              {(["light", "dark", "system"] as Theme[]).map((t) => (
                <button key={t} role="radio" aria-checked={s.prefs.theme === t} className={`chip capitalize ${s.prefs.theme === t ? "border-accent bg-accent-soft text-accent" : ""}`}
                  onClick={() => { applyTheme(t); void savePref({ theme: t }); }}>{t}</button>
              ))}
            </div>
          </Row>
        </Card>

        <Card id="writing" icon={<PenTool className="h-4 w-4" />} title="Writing" description="Defaults applied to drafts. A writing profile is used only after you approve it.">
          <Row label="Preferred tone">
            <select className="input w-auto" value={s.prefs.tone} onChange={(e) => savePref({ tone: e.target.value })} aria-label="Preferred tone">
              {["direct", "warm", "formal", "neutral"].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
          </Row>
          <Row label="Preferred length">
            <select className="input w-auto" value={s.prefs.length} onChange={(e) => savePref({ length: e.target.value })} aria-label="Preferred length">
              {["concise", "standard", "detailed"].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
          </Row>
          <Row label="Use writing profile">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.prefs.use_writing_profile} onChange={(e) => savePref({ use_writing_profile: e.target.checked })} /> Apply my approved profile to new drafts</label>
          </Row>
          <Row label="Writing profile">
            <div className="space-y-3">
              {profiles?.approved && <ProfileEditor p={profiles.approved} />}
              {profiles?.proposed && <ProfileEditor p={profiles.proposed} onApprove={async () => {
                await api.approveProfile(profiles.proposed!.id); await qc.invalidateQueries({ queryKey: ["profiles"] }); toast("Writing profile approved");
              }} />}
              <div>
                <label className="label" htmlFor="wp-sample">Paste a few examples of your own writing (emails, memos). They're analysed, not stored.</label>
                <textarea id="wp-sample" className="input min-h-[7rem] font-serif" value={sample} onChange={(e) => setSample(e.target.value)} />
                <button className="btn-secondary mt-2" disabled={sample.trim().length < 300 || profiling} onClick={async () => {
                  setProfiling(true);
                  const r = await run(() => api.proposeProfile(sample));
                  setProfiling(false);
                  if (r?.status === "succeeded") { toast("Profile proposed. Review and approve it."); setSample(""); await qc.invalidateQueries({ queryKey: ["profiles"] }); }
                }}>{profiling && <Spinner className="h-3.5 w-3.5" />} Propose a profile</button>
                {sample.trim().length > 0 && sample.trim().length < 300 && <span className="ml-2 text-xs text-faint">At least 300 characters.</span>}
              </div>
            </div>
          </Row>
        </Card>

        <Card id="knowledge" icon={<Database className="h-4 w-4" />} title="Knowledge" description="Your saved knowledge, preferences and writing examples. Manage items on the Knowledge page.">
          <div className="flex flex-wrap gap-2">
            <a className="btn-secondary" href="/api/knowledge/export?format=json"><Download className="h-4 w-4" /> Export JSON</a>
            <a className="btn-secondary" href="/api/knowledge/export?format=md"><Download className="h-4 w-4" /> Export Markdown</a>
            <a className="btn-ghost" href="/knowledge?q=">Open Knowledge</a>
            <button className="btn-danger ml-auto" onClick={() => setClear("knowledge")}>Delete all knowledge…</button>
          </div>
        </Card>

        <Card id="privacy" icon={<Shield className="h-4 w-4" />} title="Privacy">
          <div className="space-y-2 text-sm leading-relaxed text-muted">
            <p><span className="font-medium text-ink">Local storage.</span> Workspaces, files, drafts and knowledge are stored only in <span className="font-mono text-xs">{String(s.storage.data_dir)}</span> on this computer. The app listens on {s.app.host} only and has no telemetry or analytics.</p>
            <p><span className="font-medium text-ink">External AI processing.</span> Local storage is not local AI. When you ask for analysis, the request and the content it needs (document excerpts, screenshots, relevant saved knowledge) are sent to Anthropic's API. Uploading alone never sends anything. Don't submit material you aren't permitted to share with a third-party AI service; this app has not been security-reviewed for regulated or confidential data.</p>
            <p><span className="font-medium text-ink">Retention.</span> Everything is kept until you delete it. Deleting a workspace removes its files and results; backups you create are kept until you remove them from the backups folder.</p>
          </div>
          <Row label="AI processing consent">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.ai.consent} onChange={async (e) => { await api.consent(e.target.checked); await qc.invalidateQueries({ queryKey: ["settings"] }); }} />
              I understand selected content is sent to Anthropic for processing {s.ai.consent_at && <span className="text-xs text-faint">(since {new Date(s.ai.consent_at).toLocaleDateString()})</span>}
            </label>
          </Row>
          <Row label="Backups" hint={`Saved to ${backups?.location ?? ""}. Includes the database and files; never your API key.`}>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={async () => { const b = await api.createBackup(); toast(`Backup created: ${b.name}`); await qc.invalidateQueries({ queryKey: ["backups"] }); }}>Create backup</button>
              <input ref={restoreRef} type="file" accept=".zip" className="hidden" onChange={(e) => { setRestoring(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <button className="btn-ghost" onClick={() => restoreRef.current?.click()}><Upload className="h-4 w-4" /> Restore from backup…</button>
            </div>
            {backups?.backups.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {backups.backups.slice(0, 5).map((b) => (
                  <li key={b.name} className="flex items-center gap-2"><a className="font-mono text-xs text-accent hover:underline" href={`/api/backups/${b.name}/download`}>{b.name}</a>
                    <span className="text-xs text-faint">{fileSize(b.size_bytes)} · {timeAgo(b.created_at)}</span></li>
                ))}
              </ul>
            ) : null}
          </Row>
          <Row label="Clear history">
            <div className="flex flex-wrap gap-2">
              <button className="btn-danger" onClick={() => setClear("history")}>Delete all workspaces and drafts…</button>
              <button className="btn-danger" onClick={() => setClear("everything")}>Delete everything…</button>
            </div>
          </Row>
        </Card>

        <Card id="app" icon={<Wrench className="h-4 w-4" />} title="Application">
          <Row label="Version">{s.app.name} {s.app.version} · schema v{s.app.schema_version} · Python {s.app.python}</Row>
          <Row label="Storage">
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-0.5 text-xs">
              {["database", "files", "exports", "backups"].map((k) => <Fragment key={k}><dt className="text-muted capitalize">{k}</dt><dd className="break-all font-mono">{String(s.storage[k])}</dd></Fragment>)}
              <dt className="text-muted">Size</dt><dd>{fileSize(Number(s.storage.database_bytes))} database · {fileSize(Number(s.storage.files_bytes))} files</dd>
            </dl>
          </Row>
          <Row label="Health">
            {diag ? (
              <div className="space-y-1 text-sm">
                {diag.storage_warning && <div className="rounded-md border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-warn">{diag.storage_warning}</div>}
                <div>Database check: <span className={diag.database_check === "ok" ? "text-ok" : "text-danger"}>{diag.database_check}</span> · {diag.search_index_rows.toLocaleString()} indexed passages · {fileSize(diag.disk_free_bytes)} free</div>
                <div className="text-xs text-muted">{Object.entries(diag.counts).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(" · ")}</div>
                {diag.recent_failures.length > 0 && (
                  <details className="text-xs"><summary className="cursor-pointer text-muted">Recent failed requests ({diag.recent_failures.length})</summary>
                    <ul className="mt-1 space-y-0.5">{diag.recent_failures.map((f) => <li key={f.at}>{timeAgo(f.at)} · {f.workflow}: {f.error}</li>)}</ul></details>
                )}
                <div className="text-xs text-faint">Log: <span className="font-mono">{diag.log_file}</span></div>
                <button className="btn-ghost btn-sm" onClick={() => refetchDiag()}>Re-check</button>
              </div>
            ) : <Spinner />}
          </Row>
          <Row label="Activity log" hint="Actions only: never file contents, prompts or keys.">
            <details className="text-xs"><summary className="cursor-pointer text-muted">Show recent activity</summary>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto font-mono">{audit?.events.map((e, i) => <li key={i}>{e.at.slice(0, 19).replace("T", " ")} {e.action}</li>)}</ul></details>
          </Row>
          <Row label="Demo data" hint="Adds four workspaces with fictional files (an email thread, a credit agreement, a weak memo, two contract versions). No AI is called.">
            <button className="btn-secondary" onClick={async () => { try { const r = await api.loadDemo(); toast(`Loaded ${r.workspaces} demo workspaces`); await qc.invalidateQueries(); } catch { toast("Demo files are not installed.", "error"); } }}>Load demo workspaces</button>
          </Row>
        </Card>
      </div>
      <ConfirmDialog open={!!clear} onClose={() => setClear(null)} typed="DELETE" confirmLabel="Delete permanently"
        title={clear === "knowledge" ? "Delete all knowledge?" : clear === "everything" ? "Delete everything?" : "Delete all workspaces and drafts?"}
        body={clear === "knowledge" ? "All saved knowledge and writing profiles are deleted." : clear === "everything"
          ? "All workspaces, files, drafts, tasks, decisions, knowledge and writing profiles are deleted. Settings and your API key are kept. Consider creating a backup first."
          : "All workspaces, uploaded files, analyses, drafts, tasks, decisions and AI history are deleted. Knowledge and settings are kept. Consider creating a backup first."}
        onConfirm={async () => { const r = await api.clearHistory(clear!); setClear(null); toast(`Deleted (${Object.values(r.removed).reduce((a, b) => a + b, 0)} records)`); await qc.invalidateQueries(); }} />
      <ConfirmDialog open={!!restoring} onClose={() => setRestoring(null)} confirmLabel="Restore" title="Restore from this backup?"
        body={<>Your current data will be replaced with <span className="font-mono">{restoring?.name}</span>. A safety backup of the current state is made first.</>}
        onConfirm={async () => {
          try { const r = await api.restoreBackup(restoring!); toast(`Restored. Safety backup: ${r.safety_backup}`); await qc.invalidateQueries(); }
          catch (e) { toast(e instanceof ApiError ? e.message : "Restore failed.", "error"); }
          setRestoring(null);
        }} />
      {consentDialog}
    </div>
  );
}
