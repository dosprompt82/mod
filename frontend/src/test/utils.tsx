import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { ToastProvider } from "../components/Toast";

type Handler = (url: string, init: RequestInit) => { status?: number; body: unknown } | undefined;
export const calls: { method: string; url: string; body: unknown }[] = [];

/** Route fetch() calls to handlers: [method, url regex, response or function]. */
export function mockFetch(routes: [string, RegExp, unknown | Handler][]) {
  calls.length = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    else if (init.body instanceof FormData) body = init.body;
    calls.push({ method, url, body });
    for (const [m, re, resp] of routes) {
      if (m === method && re.test(url)) {
        const r = typeof resp === "function" ? (resp as Handler)(url, init) : { body: resp };
        if (r) return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ detail: { message: `Unmocked ${method} ${url}`, code: "unmocked" } }), { status: 404 });
  }) as typeof fetch;
}

export function renderApp(ui: ReactNode, { route = "/", path = "/" }: { route?: string; path?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="*" element={<div>navigated</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const settings = {
  ai: { provider: "mock", model: "m", default_model: "m", key_configured: true, key_masked: "sk-ant-…ABCD", key_source: "settings", consent: true, consent_at: null },
  prefs: { theme: "system", tone: "direct", length: "concise", use_writing_profile: true, analysis_depth: "standard" },
  storage: {}, app: { name: "Personal Superpower", version: "1", schema_version: 1, python: "3", host: "127.0.0.1", port: 8765, max_upload_mb: 25 },
  usage: { days: 30, total_runs: 0, total_cost_estimate: 0, by_model: [] },
};

export const att = (over: Record<string, unknown> = {}) => ({
  id: "a1", workspace_id: null, filename: "shot.png", kind: "image", mime_type: "image/png", size_bytes: 1200, checksum: "x", duplicate_of: null,
  status: "needs_vision", error: null, page_count: 1, text_chars: 0, vision_pages: 0, transcribed: false, width: 10, height: 10, created_at: new Date().toISOString(), ...over,
});
