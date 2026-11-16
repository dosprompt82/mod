import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { Dialog } from "./Dialog";

/** Ensures the one-time acknowledgement of external AI processing before the first AI operation. */
export function useConsentGate() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const ensure = useCallback(async (): Promise<boolean> => {
    const s = await qc.fetchQuery({ queryKey: ["settings"], queryFn: api.settings, staleTime: 5000 });
    if (s.ai.consent) return true;
    setOpen(true);
    return new Promise<boolean>((resolve) => { pending.current = resolve; });
  }, [qc]);

  const finish = async (ok: boolean) => {
    if (ok) {
      await api.consent(true);
      await qc.invalidateQueries({ queryKey: ["settings"] });
    }
    setOpen(false);
    pending.current?.(ok);
    pending.current = null;
  };

  const dialog = (
    <Dialog open={open} onClose={() => finish(false)} title="Before the first AI request"
      footer={<><button className="btn-secondary" onClick={() => finish(false)}>Not now</button>
        <button className="btn-primary" onClick={() => finish(true)} data-testid="consent-accept">I understand, continue</button></>}>
      <div className="space-y-3 text-sm leading-relaxed">
        <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-accent" /> Your files stay on this computer. AI processing does not.</div>
        <p className="text-muted">When you ask for analysis, the request and the content it needs (selected text, document excerpts and screenshots) are sent to Anthropic's API for processing. Uploading a file never sends it anywhere by itself.</p>
        <p className="text-muted">Only send material you are permitted to share with a third-party AI service. Personal Superpower has not been security-reviewed for regulated or confidential data.</p>
        <p className="text-xs text-faint">You can review this in Settings → Privacy at any time.</p>
      </div>
    </Dialog>
  );
  return { ensure, dialog };
}
