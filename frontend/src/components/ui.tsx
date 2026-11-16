import { useState, type ReactNode } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { PROVENANCE_LABELS } from "../lib/format";

export const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => <Loader2 className={`animate-spin ${className}`} aria-hidden />;

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-2 text-faint">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

const SEV: Record<string, string> = {
  critical: "bg-danger text-white", high: "bg-danger-soft text-danger", medium: "bg-warn-soft text-warn", low: "bg-sunken text-muted",
};
export const SeverityBadge = ({ s }: { s: string }) => <span className={`badge uppercase tracking-wide ${SEV[s] ?? SEV.low}`}>{s}</span>;

export function VerificationBadge({ v }: { v: string }) {
  if (v === "verified") return <span className="badge bg-ok-soft text-ok" title="The quote was found word-for-word in the extracted document text.">Verified quote</span>;
  if (v === "vision") return <span className="badge bg-warn-soft text-warn" title="Read from an image by the AI model; not machine-verifiable.">Read from image</span>;
  return <span className="badge bg-danger-soft text-danger" title="This quote was not found in any source. Do not rely on it.">Not found in source</span>;
}

export const ProvenanceBadge = ({ p }: { p: string }) => (
  <span className={`badge ${p.startsWith("ai_") ? "bg-warn-soft text-warn" : p === "source_document" ? "bg-accent-soft text-accent" : "bg-ok-soft text-ok"}`}>
    {PROVENANCE_LABELS[p] ?? p}
  </span>
);

const STATUS: Record<string, string> = {
  active: "bg-accent-soft text-accent", waiting: "bg-warn-soft text-warn", completed: "bg-ok-soft text-ok", archived: "bg-sunken text-muted",
};
export const StatusBadge = ({ s }: { s: string }) => <span className={`badge capitalize ${STATUS[s] ?? STATUS.archived}`}>{s}</span>;

export function Collapsible({ title, children, defaultOpen = false, count, right }: {
  title: string; children: ReactNode; defaultOpen?: boolean; count?: number; right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line first:border-t-0">
      <div className="flex items-center justify-between">
        <button className="flex flex-1 items-center gap-1.5 py-2.5 text-left text-sm font-medium text-ink" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight className={`h-4 w-4 text-faint transition-transform ${open ? "rotate-90" : ""}`} />
          {title}
          {count !== undefined && <span className="text-xs font-normal text-muted">({count})</span>}
        </button>
        {right}
      </div>
      {open && <div className="pb-3 pl-5">{children}</div>}
    </div>
  );
}

export function BulletList({ items, className = "" }: { items: (string | ReactNode)[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={`space-y-1.5 text-[0.94rem] leading-relaxed ${className}`}>
      {items.map((x, i) => (
        <li key={i} className="flex gap-2"><span className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-faint" /><span>{x}</span></li>
      ))}
    </ul>
  );
}

export function MockNotice({ provider }: { provider?: string }) {
  if (provider !== "mock") return null;
  return (
    <div className="rounded-md border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
      Offline mock provider: this is placeholder output for testing, not a real AI analysis.
    </div>
  );
}
