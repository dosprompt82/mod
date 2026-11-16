import type {
  Analysis, Attachment, BriefItem, Decision, Draft, KnowledgeItem, Message, Review, Run, SearchResult, SettingsData, Task,
  WorkspaceDetail, WorkspaceSummary, WritingProfile,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, raw = false): Promise<T> {
  const init: RequestInit = { method, headers: { "x-ps-client": "1" } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Can't reach the Personal Superpower server. Is it still running?", 0, "offline");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    let code = "error";
    try {
      const data = await res.json();
      const d = data?.detail;
      if (d && typeof d === "object") ({ message = message, code = code } = d);
      else if (typeof d === "string") message = d;
    } catch { /* non-JSON error */ }
    throw new ApiError(message, res.status, code);
  }
  if (raw) return res as unknown as T;
  return (await res.json()) as T;
}

const get = <T,>(u: string) => request<T>("GET", u);
const post = <T,>(u: string, b?: unknown) => request<T>("POST", u, b ?? {});
const put = <T,>(u: string, b: unknown) => request<T>("PUT", u, b);
const patch = <T,>(u: string, b: unknown) => request<T>("PATCH", u, b);
const del = <T,>(u: string) => request<T>("DELETE", u);
const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export interface RunStart { run: Run; message?: Message; steps?: string[]; labels?: string[] }
export interface RunRequest {
  instruction?: string; attachment_ids?: string[]; action?: string | null; workflow?: string | null;
  target_type?: "analysis" | "draft"; target_id?: string; draft_kind?: string;
}

export const api = {
  health: () => get<{ status: string; provider: string; ai_configured: boolean; model: string; version: string }>("/api/health"),
  // workspaces
  workspaces: (status?: string, limit = 50) => get<{ workspaces: WorkspaceSummary[] }>(`/api/workspaces${qs({ status, limit })}`),
  workspace: (id: string) => get<WorkspaceDetail>(`/api/workspaces/${id}`),
  createWorkspace: (title?: string) => post<WorkspaceSummary>("/api/workspaces", title ? { title } : {}),
  updateWorkspace: (id: string, b: Partial<Pick<WorkspaceSummary, "title" | "status" | "description" | "tags">>) => patch<WorkspaceSummary>(`/api/workspaces/${id}`, b),
  deleteWorkspace: (id: string) => del<{ deleted: string }>(`/api/workspaces/${id}?confirm=true`),
  related: (id: string) => get<{ items: { kind: string; ref_id: string; title: string; snip: string; provenance: string }[] }>(`/api/workspaces/${id}/related`),
  startRun: (wsId: string, b: RunRequest) => post<RunStart>(`/api/workspaces/${wsId}/runs`, b),
  // files
  upload: (files: File[], workspaceId?: string) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));
    if (workspaceId) fd.append("workspace_id", workspaceId);
    return request<{ attachments: Attachment[]; errors: { filename: string; message: string }[] }>("POST", "/api/attachments", fd);
  },
  attachment: (id: string) => get<Attachment>(`/api/attachments/${id}`),
  attachmentText: (id: string) => get<{ attachment: Attachment; pages: { page: number | null; text: string; text_source: string; needs_vision: boolean }[];
    chunks: { id: number; page: number | null; section: string | null; text: string; text_source: string }[] }>(`/api/attachments/${id}/text`),
  deleteAttachment: (id: string) => del(`/api/attachments/${id}`),
  retryAttachment: (id: string) => post<Attachment>(`/api/attachments/${id}/retry`),
  // runs & results
  run: (id: string) => get<Run>(`/api/runs/${id}`),
  cancelRun: (id: string) => post<Run>(`/api/runs/${id}/cancel`),
  analysis: (id: string) => get<Analysis>(`/api/analyses/${id}`),
  reviseAnalysis: (id: string) => post<RunStart>(`/api/analyses/${id}/revise`),
  review: (id: string) => get<Review>(`/api/reviews/${id}`),
  // drafts
  drafts: (q?: string, kind?: string) => get<{ drafts: Draft[] }>(`/api/drafts${qs({ q, kind })}`),
  draft: (id: string) => get<Draft>(`/api/drafts/${id}`),
  createDraft: (b: { title: string; kind?: string; subject?: string | null; body: string; workspace_id?: string | null }) => post<Draft>("/api/drafts", b),
  saveDraft: (id: string, b: { title?: string; subject?: string | null; body?: string; status?: "draft" | "final"; note?: string }) => put<Draft>(`/api/drafts/${id}`, b),
  restoreVersion: (id: string, v: number) => post<Draft>(`/api/drafts/${id}/restore/${v}`),
  rewrite: (id: string, b: { preset?: string; instruction?: string }) => post<RunStart>(`/api/drafts/${id}/rewrite`, b),
  deleteDraft: (id: string) => del(`/api/drafts/${id}`),
  exportDoc: (b: { source_type: "draft" | "analysis" | "review"; source_id: string; format: string; version?: number }) =>
    post<{ id: string; filename: string; url: string; size_bytes: number }>("/api/exports", b),
  // knowledge & search
  search: (p: Record<string, string | undefined>) => get<{ results: SearchResult[]; relaxed: boolean }>(`/api/search${qs(p)}`),
  knowledge: (category?: string) => get<{ items: KnowledgeItem[] }>(`/api/knowledge${qs({ category })}`),
  createKnowledge: (b: Partial<KnowledgeItem> & { title: string; body: string }) => post<KnowledgeItem>("/api/knowledge", b),
  updateKnowledge: (id: string, b: Partial<KnowledgeItem>) => patch<KnowledgeItem>(`/api/knowledge/${id}`, b),
  deleteKnowledge: (id: string) => del(`/api/knowledge/${id}`),
  saveToKnowledge: (b: { source_type: "analysis" | "draft" | "review"; source_id: string; category?: string; title?: string }) => post<KnowledgeItem>("/api/knowledge/from-result", b),
  profiles: () => get<{ approved: WritingProfile | null; proposed: WritingProfile | null }>("/api/writing-profile"),
  proposeProfile: (text: string) => post<RunStart>("/api/writing-profile/propose", { text }),
  editProfile: (id: string, profile: Record<string, unknown>) => put<WritingProfile>(`/api/writing-profile/${id}`, { profile }),
  approveProfile: (id: string) => post<WritingProfile>(`/api/writing-profile/${id}/approve`),
  deleteProfile: (id: string) => del(`/api/writing-profile/${id}`),
  // assistant
  tasks: (status?: string) => get<{ tasks: Task[] }>(`/api/tasks${qs({ status })}`),
  createTask: (b: Partial<Task> & { title: string }) => post<Task>("/api/tasks", b),
  updateTask: (id: string, b: Partial<Task>) => patch<Task>(`/api/tasks/${id}`, b),
  deleteTask: (id: string) => del(`/api/tasks/${id}`),
  decisions: (status?: string) => get<{ decisions: Decision[] }>(`/api/decisions${qs({ status })}`),
  createDecision: (b: Partial<Decision> & { title: string }) => post<Decision>("/api/decisions", b),
  updateDecision: (id: string, b: Partial<Decision>) => patch<Decision>(`/api/decisions/${id}`, b),
  deleteDecision: (id: string) => del(`/api/decisions/${id}`),
  brief: (question: string) => get<{ headline: string; items: BriefItem[]; basis: string }>(`/api/assistant/brief?question=${question}`),
  summary: (period: string) => get<{ lines: string[]; basis: string; workspaces: { id: string; title: string; status: string }[] }>(`/api/assistant/summary?period=${period}`),
  strategy: (days: number) => post<RunStart>("/api/assistant/strategy", { days }),
  strategies: () => get<{ analyses: Analysis[] }>("/api/assistant/strategy"),
  // settings & system
  settings: () => get<SettingsData>("/api/settings"),
  updateSettings: (b: Record<string, unknown>) => put<SettingsData>("/api/settings", b),
  setApiKey: (api_key: string | null) => put<{ key_configured: boolean; key_masked: string | null }>("/api/settings/api-key", { api_key }),
  consent: (accepted: boolean) => post<{ consent: boolean }>("/api/settings/consent", { accepted }),
  testConnection: () => post<{ ok: boolean; message: string; model: string }>("/api/settings/test-connection"),
  diagnostics: () => get<{ counts: Record<string, number>; search_index_rows: number; database_check: string; disk_free_bytes: number;
    recent_failures: { at: string; workflow: string; error: string }[]; log_file: string }>("/api/diagnostics"),
  audit: () => get<{ events: { at: string; action: string; entity_type: string | null; entity_id: string | null }[] }>("/api/audit?limit=40"),
  backups: () => get<{ backups: { name: string; size_bytes: number; created_at: string }[]; location: string }>("/api/backups"),
  createBackup: () => post<{ name: string }>("/api/backups"),
  restoreBackup: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ restored_from: string; safety_backup: string }>("POST", "/api/backups/restore", fd);
  },
  clearHistory: (scope: "history" | "knowledge" | "everything") => post<{ removed: Record<string, number> }>("/api/history/clear", { confirm: "DELETE", scope }),
  loadDemo: () => post<{ workspaces: number; files: number }>("/api/demo/load"),
};

/** Poll a run until it finishes. Resolves with the final run. */
export async function waitForRun(id: string, onUpdate?: (r: Run) => void, signal?: AbortSignal): Promise<Run> {
  for (;;) {
    if (signal?.aborted) throw new ApiError("Stopped waiting.", 0, "aborted");
    const r = await api.run(id);
    onUpdate?.(r);
    if (!["queued", "running"].includes(r.status)) return r;
    await new Promise((res) => setTimeout(res, 700));
  }
}
