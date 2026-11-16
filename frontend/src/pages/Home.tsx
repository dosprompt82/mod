import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FolderOpen, KeyRound, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { plural, timeAgo } from "../lib/format";
import { useAI } from "../hooks/useAI";
import { UniversalInput, type SubmitPayload } from "../components/UniversalInput";
import { Empty, StatusBadge } from "../components/ui";
import { useToast } from "../components/useToast";

export default function Home() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { start, consentDialog } = useAI();
  const { data: recent } = useQuery({ queryKey: ["workspaces", "home"], queryFn: () => api.workspaces(undefined, 12) });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const { data: today } = useQuery({ queryKey: ["brief", "today"], queryFn: () => api.brief("today") });

  const onSubmit = async (p: SubmitPayload): Promise<boolean> => {
    let wsId: string | null = null;
    const s = await start(async () => {
      const ws = await api.createWorkspace();
      wsId = ws.id;
      try {
        return await api.startRun(ws.id, { instruction: p.instruction, attachment_ids: p.attachmentIds, action: p.action, workflow: p.workflow });
      } catch (e) {
        await api.deleteWorkspace(ws.id).catch(() => undefined); // don't leave an empty workspace behind
        throw e;
      }
    });
    if (!s || !wsId) return false;
    await qc.invalidateQueries({ queryKey: ["workspaces"] });
    navigate(`/w/${wsId}`);
    return true;
  };

  const loadDemo = async () => {
    try {
      const r = await api.loadDemo();
      toast(`Loaded ${r.workspaces} demo workspaces with ${r.files} fictional files`);
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
    } catch {
      toast("Demo files are not installed.", "error");
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-[9vh]">
      <p className="mb-1 text-sm text-muted">{greeting}.</p>
      <h1 className="mb-6 font-serif text-[2.1rem] font-semibold tracking-tight">What's on your mind?</h1>
      {health && !health.ai_configured && (
        <Link to="/settings" className="mb-4 flex items-center gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
          <KeyRound className="h-4 w-4" /> Add your Anthropic API key in Settings to enable analysis. Uploading and organising work already function.
          <ArrowRight className="ml-auto h-4 w-4" />
        </Link>
      )}
      <UniversalInput variant="hero" onSubmit={onSubmit} autoFocus />
      {today && today.items.length > 0 && (
        <Link to="/decisions" className="mt-4 flex items-center gap-2 rounded-lg px-1 text-sm text-muted hover:text-ink">
          <Sparkles className="h-4 w-4 text-warn" /> {today.headline} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
      <section className="mt-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow">Recent workspaces</h2>
        </div>
        {recent?.workspaces.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {recent.workspaces.map((w) => (
              <li key={w.id}>
                <Link to={`/w/${w.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{w.title}</span>
                    <span className="text-xs text-faint">{plural(w.file_count, "file")} · updated {timeAgo(w.updated_at)}</span>
                  </span>
                  <StatusBadge s={w.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<FolderOpen className="h-6 w-6" />} title="Your workspaces will appear here">
            Every request becomes a workspace you can return to. Want to explore first?
            <div className="mt-3"><button className="btn-secondary" onClick={loadDemo}>Load fictional demo files</button></div>
          </Empty>
        )}
      </section>
      {consentDialog}
    </div>
  );
}
