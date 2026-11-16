import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Swords, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { DraftEditor } from "../components/DraftEditor";
import { ConfirmDialog } from "../components/Dialog";
import { useToast } from "../components/useToast";
import { useAI } from "../hooks/useAI";
import { Spinner } from "../components/ui";

export default function DraftPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { start, consentDialog } = useAI();
  const [del, setDel] = useState(false);
  const { data: d, isLoading, error } = useQuery({ queryKey: ["draft", id], queryFn: () => api.draft(id) });
  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  if (error || !d) return <div className="p-10 text-center text-sm text-muted">Draft not found.</div>;

  const challenge = async () => {
    // Reviews run inside a workspace; drafts created on their own get one.
    let wsId = d.workspace_id;
    if (!wsId) wsId = (await api.createWorkspace(`Review: ${d.title}`)).id;
    const s = await start(() => api.startRun(wsId!, { action: "challenge", target_type: "draft", target_id: d.id }));
    if (s) navigate(`/w/${wsId}`);
  };
  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to={d.workspace_id ? `/w/${d.workspace_id}` : "/drafts"} className="btn-ghost -ml-2"><ArrowLeft className="h-4 w-4" /> {d.workspace_id ? "Workspace" : "Drafts"}</Link>
        <span className="badge bg-sunken capitalize text-muted">{d.kind.replace("_", " ")}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary btn-sm" onClick={challenge}><Swords className="h-3.5 w-3.5" /> Challenge this</button>
          <button className={`btn-sm ${d.status === "final" ? "btn-secondary" : "btn-ghost"}`} onClick={async () => {
            await api.saveDraft(d.id, { status: d.status === "final" ? "draft" : "final" });
            await qc.invalidateQueries();
            toast(d.status === "final" ? "Marked as draft" : "Marked as final");
          }}><CheckCircle2 className="h-3.5 w-3.5" /> {d.status === "final" ? "Final" : "Mark final"}</button>
          <button className="btn-ghost btn-sm text-danger" onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>
      </div>
      <DraftEditor draft={d} mode="full" />
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Delete this draft?" body="All versions of this draft are deleted. This cannot be undone."
        onConfirm={async () => { await api.deleteDraft(d.id); await qc.invalidateQueries(); toast("Draft deleted"); navigate("/drafts"); }} />
      {consentDialog}
    </div>
  );
}
