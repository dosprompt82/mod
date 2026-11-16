import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { download } from "../lib/format";
import { useToast } from "./useToast";

const FORMATS = [["docx", "Word (.docx)"], ["pdf", "PDF"], ["md", "Markdown"], ["txt", "Plain text"]] as const;

export function ExportMenu({ sourceType, sourceId, version, small }: { sourceType: "draft" | "analysis" | "review"; sourceId: string; version?: number; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const go = async (format: string) => {
    setBusy(format);
    try {
      const e = await api.exportDoc({ source_type: sourceType, source_id: sourceId, format, version });
      download(e.url);
      toast(`Exported ${e.filename}`);
      setOpen(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Export failed.", "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button className={`btn-secondary ${small ? "btn-sm" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div role="menu" className="panel absolute right-0 z-20 mt-1 w-44 py-1 shadow-pop">
          {FORMATS.map(([f, label]) => (
            <button key={f} role="menuitem" className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-sunken" onClick={() => go(f)} disabled={!!busy}>
              {label} {busy === f && <span className="text-2xs text-muted">…</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
