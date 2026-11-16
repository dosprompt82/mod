import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePen, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { Empty, Spinner } from "../components/ui";
import { Dialog } from "../components/Dialog";

const KINDS = ["", "email", "memo", "summary", "report", "research_note", "decision_brief", "meeting_summary", "post", "letter", "talking_points", "document"];

export default function Drafts() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState("document");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["drafts", q, kind], queryFn: () => api.drafts(q || undefined, kind || undefined) });
  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold">Drafts</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New draft</button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
          <input className="input pl-9" placeholder="Search drafts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search drafts" />
        </div>
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Draft type">
          {KINDS.map((k) => <option key={k} value={k}>{k ? k.replace("_", " ") : "All types"}</option>)}
        </select>
      </div>
      {isLoading ? <Spinner /> : !data?.drafts.length ? (
        <Empty icon={<FilePen className="h-6 w-6" />} title={q || kind ? "No drafts match" : "No drafts yet"}>
          Email replies, memos and other deliverables you generate are saved here with their full version history.
        </Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {data.drafts.map((d) => (
            <li key={d.id}>
              <Link to={`/drafts/${d.id}`} className="block px-4 py-3 hover:bg-sunken/60">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{d.title}</span>
                  <span className="badge bg-sunken capitalize text-muted">{d.kind.replace("_", " ")}</span>
                  {d.status === "final" && <span className="badge bg-ok-soft text-ok">Final</span>}
                  <span className="ml-auto shrink-0 text-xs text-faint">v{d.current_version} · {timeAgo(d.updated_at)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{d.body.slice(0, 240)}</p>
                {d.workspace_title && <p className="mt-0.5 text-xs text-faint">From {d.workspace_title}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title="New draft"
        footer={<button className="btn-primary" disabled={!newTitle.trim()} onClick={async () => {
          const d = await api.createDraft({ title: newTitle.trim(), kind: newKind, body: "" });
          await qc.invalidateQueries({ queryKey: ["drafts"] });
          navigate(`/drafts/${d.id}`);
        }}>Create</button>}>
        <div className="space-y-3">
          <div><label className="label" htmlFor="nd-title">Title</label><input id="nd-title" className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>
          <div><label className="label" htmlFor="nd-kind">Type</label>
            <select id="nd-kind" className="input" value={newKind} onChange={(e) => setNewKind(e.target.value)}>
              {KINDS.filter(Boolean).map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
            </select></div>
        </div>
      </Dialog>
    </div>
  );
}
