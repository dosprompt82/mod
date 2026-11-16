import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode; description?: string }

export function Dialog({ open, onClose, title, children, wide, footer, description }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((el) => !el.hasAttribute("disabled"));
    (focusables()[1] ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[8vh] backdrop-blur-[1px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`panel w-full shadow-pop ${wide ? "max-w-5xl" : "max-w-lg"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[0.95rem] font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <button className="btn-ghost -mr-2 px-1.5" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = "Delete", typed }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; typed?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-danger" id="confirm-btn" onClick={() => {
          const input = document.getElementById("confirm-typed") as HTMLInputElement | null;
          if (typed && input?.value !== typed) { input?.focus(); return; }
          onConfirm();
        }}>{confirmLabel}</button>
      </>}>
      <div className="space-y-3 text-sm text-muted">
        {body}
        {typed && (
          <div>
            <label className="label" htmlFor="confirm-typed">Type {typed} to confirm</label>
            <input id="confirm-typed" className="input font-mono" autoComplete="off" />
          </div>
        )}
      </div>
    </Dialog>
  );
}
