import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ApiError, waitForRun, type RunStart } from "../lib/api";
import type { Run } from "../lib/types";
import { useToast } from "../components/useToast";
import { useConsentGate } from "../components/ConsentDialog";

/** Starts AI work behind the consent gate and reports errors plainly. */
export function useAI() {
  const { ensure, dialog } = useConsentGate();
  const toast = useToast();
  const qc = useQueryClient();

  const start = useCallback(async (fn: () => Promise<RunStart>): Promise<RunStart | null> => {
    if (!(await ensure())) return null;
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong.";
      toast(msg, "error");
      return null;
    }
  }, [ensure, toast]);

  /** Start and wait for completion (for actions outside the workspace conversation). */
  const run = useCallback(async (fn: () => Promise<RunStart>, onUpdate?: (r: Run) => void): Promise<Run | null> => {
    const s = await start(fn);
    if (!s) return null;
    const r = await waitForRun(s.run.id, onUpdate);
    await qc.invalidateQueries();
    if (r.status === "failed") toast(r.error ?? "The AI request failed.", "error");
    if (r.status === "cancelled") toast("Cancelled.", "info");
    return r;
  }, [start, qc, toast]);

  return { start, run, consentDialog: dialog };
}
