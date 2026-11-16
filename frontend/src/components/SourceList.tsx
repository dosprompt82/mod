import { useState } from "react";
import { FileSearch } from "lucide-react";
import type { SourceRef } from "../lib/types";
import { FilePreview } from "./FilePreview";
import { VerificationBadge } from "./ui";

export function SourceList({ sources, compact }: { sources: SourceRef[]; compact?: boolean }) {
  const [open, setOpen] = useState<SourceRef | null>(null);
  if (!sources.length) return <p className="text-sm text-muted">No direct quotations were cited.</p>;
  return (
    <>
      <ol className="space-y-2.5">
        {sources.map((s) => (
          <li key={s.id} className={`rounded-lg border border-line ${compact ? "p-2.5" : "p-3"} ${s.verification === "unverified" ? "bg-danger-soft/40" : "bg-sunken/40"}`}>
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="font-medium text-ink">{s.filename ?? s.label}</span>
              {s.page != null && <span className="font-mono">p. {s.page}</span>}
              {s.section && <span className="truncate">§ {s.section}</span>}
              <VerificationBadge v={s.verification} />
              {s.attachment_id && (
                <button className="ml-auto inline-flex items-center gap-1 text-accent hover:underline" onClick={() => setOpen(s)}>
                  <FileSearch className="h-3.5 w-3.5" /> View in document
                </button>
              )}
            </div>
            <blockquote className="font-serif text-[0.92rem] leading-relaxed text-ink">“{s.quote}”</blockquote>
            {s.explanation && !compact && <p className="mt-1 text-xs text-muted">{s.explanation}</p>}
          </li>
        ))}
      </ol>
      <FilePreview attachmentId={open?.attachment_id ?? null} chunkId={open?.chunk_id} quote={open?.quote} onClose={() => setOpen(null)} />
    </>
  );
}
