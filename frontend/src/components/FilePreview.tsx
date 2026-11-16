import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { Dialog } from "./Dialog";
import { Spinner } from "./ui";

function Highlighted({ text, quote }: { text: string; quote?: string }) {
  const parts = useMemo(() => {
    if (!quote) return [text];
    const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
    const segs = quote.split(/\.\.\.|…/).map((s) => s.trim().replace(/^["“]|["”]$/g, "")).filter((s) => s.length >= 4);
    if (!segs.length) return [text];
    // Map normalised positions back onto the original text so line breaks are preserved.
    const map: number[] = [];
    let flat = "";
    for (let i = 0; i < text.length; i++) {
      const c = /\s/.test(text[i]) ? " " : text[i].toLowerCase();
      if (c === " " && flat.endsWith(" ")) continue;
      flat += c;
      map.push(i);
    }
    const idx = flat.indexOf(norm(segs[0]));
    if (idx < 0) return [text];
    const start = map[idx];
    const endFlat = Math.min(map.length - 1, idx + norm(segs[0]).length - 1);
    const end = map[endFlat] + 1;
    return [text.slice(0, start), <mark key="m" className="hit">{text.slice(start, end)}</mark>, text.slice(end)];
  }, [text, quote]);
  return <>{parts}</>;
}

export function FilePreview({ attachmentId, onClose, chunkId, quote }: { attachmentId: string | null; onClose: () => void; chunkId?: number | null; quote?: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["att-text", attachmentId], queryFn: () => api.attachmentText(attachmentId!), enabled: !!attachmentId });
  const [tab, setTab] = useState<"text" | "original">("text");
  const a = data?.attachment;
  useEffect(() => {
    if (a?.kind === "image") setTab("original");
    else setTab("text");
  }, [a?.kind, attachmentId]);
  useEffect(() => {
    if (chunkId && data) setTimeout(() => document.getElementById(`chunk-${chunkId}`)?.scrollIntoView({ block: "center" }), 50);
  }, [chunkId, data]);
  const url = attachmentId ? `/api/attachments/${attachmentId}/content` : "";
  return (
    <Dialog open={!!attachmentId} onClose={onClose} wide title={a?.filename ?? "File"}
      description={a ? `${a.kind.toUpperCase()}${a.page_count ? ` · ${a.page_count} page${a.page_count > 1 ? "s" : ""}` : ""}${a.status === "needs_vision" ? " · text not yet read (image)" : ""}` : undefined}>
      {isLoading || !data ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div>
          <div className="mb-3 flex items-center gap-1 border-b border-line">
            {(["text", "original"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                {t === "text" ? "Extracted text" : "Original"}
              </button>
            ))}
            <a className="btn-ghost btn-sm ml-auto" href={url + (a?.kind === "docx" ? "?download=true" : "")} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open original
            </a>
          </div>
          {tab === "original" ? (
            a?.kind === "image" ? <img src={url} alt={a.filename} className="mx-auto max-h-[60vh] rounded border border-line" />
              : a?.kind === "pdf" ? <iframe title={a.filename} src={url} className="h-[60vh] w-full rounded border border-line" />
                : <p className="text-sm text-muted">This file type opens in its own application. Use “Open original”.</p>
          ) : data.chunks.length === 0 ? (
            <p className="text-sm text-muted">{a?.status === "failed" ? a.error : a?.kind === "image" || a?.status === "needs_vision"
              ? "No machine-readable text yet. The AI model reads this image when you ask about it, and its transcription will appear here, labelled as such."
              : "No text was extracted."}</p>
          ) : (
            <div className="space-y-3">
              {data.chunks.map((c) => (
                <div key={c.id} id={`chunk-${c.id}`} className={`rounded-lg border p-3 ${c.id === chunkId ? "border-accent bg-accent-soft/40" : "border-line"}`}>
                  <div className="mb-1 flex flex-wrap gap-2 text-2xs text-muted">
                    {c.page && <span className="font-mono">Page {c.page}</span>}
                    {c.section && <span>§ {c.section}</span>}
                    {c.text_source === "vision" && <span className="badge bg-warn-soft text-warn">AI transcription of an image</span>}
                  </div>
                  <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                    {c.id === chunkId ? <Highlighted text={c.text} quote={quote} /> : c.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
