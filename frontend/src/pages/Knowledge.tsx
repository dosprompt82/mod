import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Download, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { KnowledgeItem, SearchResult } from "../lib/types";
import { CATEGORY_LABELS, highlightParts, timeAgo } from "../lib/format";
import { ConfirmDialog, Dialog } from "../components/Dialog";
import { Empty, ProvenanceBadge, Spinner } from "../components/ui";
import { FilePreview } from "../components/FilePreview";
import { useToast } from "../components/useToast";

const KIND_LABEL: Record<string, string> = { chunk: "Document", knowledge: "Knowledge", analysis: "Analysis", draft: "Draft" };

function Excerpt({ text }: { text: string }) {
  return <>{highlightParts(text).map((p, i) => p.hit ? <mark key={i} className="hit">{p.text}</mark> : <span key={i}>{p.text}</span>)}</>;
}

function ResultRow({ r, onOpenDoc }: { r: SearchResult; onOpenDoc: (r: SearchResult) => void }) {
  const href = r.kind === "draft" ? `/drafts/${r.id}` : r.workspace_id ? `/w/${r.workspace_id}` : undefined;
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="badge bg-sunken text-ink">{KIND_LABEL[r.kind]}</span>
        <span className="font-medium text-ink">{r.title}</span>
        {r.page != null && <span className="font-mono">p. {r.page}</span>}
        {r.section && <span className="truncate">§ {r.section}</span>}
        {r.category && <span>{CATEGORY_LABELS[r.category] ?? r.category}</span>}
        <ProvenanceBadge p={r.provenance} />
        {r.workspace_title && <span className="truncate">in {r.workspace_title}</span>}
        <span className="ml-auto text-faint">{timeAgo(r.created_at)}</span>
      </div>
      <p className="mt-1 font-serif text-[0.93rem] leading-relaxed text-ink"><Excerpt text={r.excerpt} /></p>
    </>
  );
  if (r.kind === "chunk") return <button className="block w-full px-4 py-3 text-left hover:bg-sunken/60" onClick={() => onOpenDoc(r)}>{body}</button>;
  return href ? <Link to={href} className="block px-4 py-3 hover:bg-sunken/60">{body}</Link> : <div className="px-4 py-3">{body}</div>;
}

function KnowledgeForm({ item, onClose }: { item: Partial<KnowledgeItem> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [category, setCategory] = useState(item?.category ?? "reference");
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  useEffect(() => { setTitle(item?.title ?? ""); setBody(item?.body ?? ""); setCategory(item?.category ?? "reference"); setTags((item?.tags ?? []).join(", ")); }, [item]);
  const save = async () => {
    const payload = { title, body, category, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) };
    try {
      if (item?.id) await api.updateKnowledge(item.id, payload);
      else await api.createKnowledge(payload);
      toast(item?.id ? "Knowledge updated" : "Saved to Knowledge");
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
      await qc.invalidateQueries({ queryKey: ["search"] });
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save.", "error");
    }
  };
  return (
    <Dialog open={!!item} onClose={onClose} title={item?.id ? "Edit knowledge" : "Add knowledge"}
      description="Saved knowledge is used as context when it's relevant to a request."
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!title.trim() || !body.trim()} onClick={save}>Save</button></>}>
      <div className="space-y-3">
        <div><label className="label" htmlFor="k-title">Title</label><input id="k-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="k-cat">Category</label>
          <select id="k-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className="label" htmlFor="k-body">Content</label><textarea id="k-body" className="input min-h-[10rem] font-serif" value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div><label className="label" htmlFor="k-tags">Tags (comma-separated)</label><input id="k-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
        {item?.provenance && <p className="text-xs text-muted">Provenance: <ProvenanceBadge p={item.provenance} /> {item.provenance.startsWith("ai_") && "Editing it marks it as approved by you."}</p>}
      </div>
    </Dialog>
  );
}

export default function Knowledge() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [submitted, setSubmitted] = useState(params.get("q") ?? "");
  const [kinds, setKinds] = useState("");
  const [provenance, setProvenance] = useState("");
  const [doctype, setDoctype] = useState("");
  const [tag, setTag] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Partial<KnowledgeItem> | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null);
  const [doc, setDoc] = useState<SearchResult | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const searching = !!(submitted || kinds || provenance || doctype || tag || from || to);
  const { data: results, isFetching } = useQuery({
    queryKey: ["search", submitted, kinds, provenance, doctype, tag, from, to],
    queryFn: () => api.search({ q: submitted, kinds, provenance, doctype, tag, date_from: from, date_to: to, limit: "50" }),
    enabled: searching,
  });
  const { data: items } = useQuery({ queryKey: ["knowledge", category], queryFn: () => api.knowledge(category || undefined) });

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold">Knowledge</h1>
        <a className="btn-ghost btn-sm" href="/api/knowledge/export?format=json"><Download className="h-3.5 w-3.5" /> JSON</a>
        <a className="btn-ghost btn-sm" href="/api/knowledge/export?format=md"><Download className="h-3.5 w-3.5" /> Markdown</a>
        <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Add knowledge</button>
      </div>
      <form className="mb-2 flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setSubmitted(q); setParams(q ? { q } : {}); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
          <input className="input pl-9" placeholder='Search documents, analyses, drafts and knowledge. Use "quotes" for phrases.' value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Search" data-testid="search-input" />
        </div>
        <button className="btn-secondary" type="button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal className="h-4 w-4" /> Filters</button>
        <button className="btn-primary" type="submit">Search</button>
      </form>
      {showFilters && (
        <div className="panel mb-4 grid gap-3 p-3 sm:grid-cols-3">
          <label className="text-xs"><span className="label">Type</span>
            <select className="input" value={kinds} onChange={(e) => setKinds(e.target.value)}>
              <option value="">Everything</option><option value="chunk">Documents</option><option value="knowledge">Knowledge</option>
              <option value="analysis">Analyses</option><option value="draft">Drafts</option>
            </select></label>
          <label className="text-xs"><span className="label">Source</span>
            <select className="input" value={provenance} onChange={(e) => setProvenance(e.target.value)}>
              <option value="">Any</option><option value="user_fact,user_approved">Your facts and approved knowledge</option><option value="source_document">Source documents</option>
              <option value="ai_interpretation,ai_draft">AI-generated</option>
            </select></label>
          <label className="text-xs"><span className="label">Document type</span>
            <select className="input" value={doctype} onChange={(e) => setDoctype(e.target.value)}>
              <option value="">Any</option>{["pdf", "docx", "txt", "md", "image"].map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
            </select></label>
          <label className="text-xs"><span className="label">Tag</span><input className="input" value={tag} onChange={(e) => setTag(e.target.value)} /></label>
          <label className="text-xs"><span className="label">From</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs"><span className="label">To</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}
      {searching && (
        <section className="mb-10">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            {isFetching ? <Spinner className="h-3.5 w-3.5" /> : <span>{results?.results.length ?? 0} result{results?.results.length === 1 ? "" : "s"}</span>}
            {results?.relaxed && <span>· no exact match for every word, showing closest matches</span>}
          </div>
          {results?.results.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" data-testid="search-results">
              {results.results.map((r) => <li key={`${r.kind}-${r.id}`}><ResultRow r={r} onOpenDoc={setDoc} /></li>)}
            </ul>
          ) : !isFetching && <Empty title="No matches">Try fewer words, a different phrase, or clear the filters.</Empty>}
        </section>
      )}
      <section>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[["", "All"], ...Object.entries(CATEGORY_LABELS)].map(([k, v]) => (
            <button key={k} className={`chip ${category === k ? "border-accent bg-accent-soft text-accent" : ""}`} onClick={() => setCategory(k)}>{v}</button>
          ))}
        </div>
        {!items?.items.length ? (
          <Empty icon={<BookOpen className="h-6 w-6" />} title="Nothing saved yet">
            Save useful analyses with “Save to Knowledge”, or add reference facts, decisions, preferences and writing examples yourself. Nothing is saved without your say-so.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {items.items.map((k) => (
              <li key={k.id} className="panel group p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{k.title}</span>
                  <span className="badge bg-sunken text-muted">{CATEGORY_LABELS[k.category] ?? k.category}</span>
                  <ProvenanceBadge p={k.provenance} />
                  {k.source_ref?.origin === "ai_generated" && <span className="text-2xs text-faint">originally AI-generated</span>}
                  <span className="ml-auto text-xs text-faint">{timeAgo(k.updated_at)}</span>
                  <button className="btn-ghost btn-sm px-1.5" onClick={() => setEditing(k)} aria-label={`Edit ${k.title}`}><Pencil className="h-3.5 w-3.5" /></button>
                  <button className="btn-ghost btn-sm px-1.5 hover:text-danger" onClick={() => setDeleting(k)} aria-label={`Delete ${k.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap font-serif text-sm leading-relaxed text-muted">{k.body}</p>
                {k.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{k.tags.map((t) => <span key={t} className="badge border border-line text-muted">#{t}</span>)}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <KnowledgeForm item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete this knowledge item?" body={`“${deleting?.title}” will be removed from Knowledge and search.`}
        onConfirm={async () => { await api.deleteKnowledge(deleting!.id); setDeleting(null); toast("Deleted"); await qc.invalidateQueries({ queryKey: ["knowledge"] }); await qc.invalidateQueries({ queryKey: ["search"] }); }} />
      <FilePreview attachmentId={doc?.attachment_id ?? null} chunkId={doc ? Number(doc.id) : null} onClose={() => setDoc(null)} />
    </div>
  );
}
