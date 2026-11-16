import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "../pages/Home";
import Knowledge from "../pages/Knowledge";
import { DraftEditor } from "../components/DraftEditor";
import WorkspacePage from "../pages/Workspace";
import { Sidebar } from "../components/Sidebar";
import type { Draft } from "../lib/types";
import { calls, mockFetch, renderApp, settings } from "./utils";

const run = { id: "r1", workspace_id: "w1", workflow: "reasoning", steps: ["reasoning"], status: "queued", step_label: "Queued", provider: "mock", model: "m",
  input_tokens: 0, output_tokens: 0, cost_estimate: null, duration_ms: null, calls: 0, error: null, result_type: null, result_id: null, message_id: null,
  created_at: new Date().toISOString(), finished_at: null };

test("home: submitting creates a workspace, starts the run and opens the workspace", async () => {
  mockFetch([
    ["GET", /\/api\/workspaces/, { workspaces: [] }], ["GET", /\/api\/health/, { status: "ok", provider: "mock", ai_configured: true, model: "m", version: "1" }],
    ["GET", /\/api\/assistant\/brief/, { headline: "", items: [], basis: "" }], ["GET", /\/api\/settings/, settings],
    ["POST", /\/api\/workspaces$/, { id: "w1", title: "Untitled workspace" }],
    ["POST", /\/api\/workspaces\/w1\/runs$/, { run, steps: ["reasoning"] }],
  ]);
  renderApp(<Home />);
  await userEvent.type(screen.getByLabelText("Instruction"), "Is a renewal option a modification?");
  await userEvent.click(screen.getByTestId("submit"));
  expect(await screen.findByText("navigated")).toBeInTheDocument();
  const start = calls.find((c) => c.url === "/api/workspaces/w1/runs")!;
  expect(start.body).toMatchObject({ instruction: "Is a renewal option a modification?", attachment_ids: [] });
});

test("home: AI errors are shown plainly and no empty workspace is left behind", async () => {
  mockFetch([
    ["GET", /\/api\/workspaces/, { workspaces: [] }], ["GET", /\/api\/health/, { status: "ok", provider: "anthropic", ai_configured: false, model: "m", version: "1" }],
    ["GET", /\/api\/assistant\/brief/, { headline: "", items: [], basis: "" }], ["GET", /\/api\/settings/, settings],
    ["POST", /\/api\/workspaces$/, { id: "w9", title: "Untitled workspace" }],
    ["POST", /\/api\/workspaces\/w9\/runs$/, () => ({ status: 400, body: { detail: { message: "No Anthropic API key is configured. Add one in Settings → AI Provider.", code: "not_configured" } } })],
    ["DELETE", /\/api\/workspaces\/w9/, { deleted: "w9" }],
  ]);
  renderApp(<Home />);
  expect(await screen.findByText(/Add your Anthropic API key/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Instruction"), "Hello");
  await userEvent.click(screen.getByTestId("submit"));
  expect(await screen.findByText(/No Anthropic API key is configured/)).toBeInTheDocument();
  expect(calls.some((c) => c.method === "DELETE" && c.url.startsWith("/api/workspaces/w9"))).toBe(true);
  expect(screen.getByLabelText("Instruction")).toHaveValue("Hello"); // nothing lost
});

const draft: Draft = { id: "d1", workspace_id: "w1", title: "Reply", kind: "email", status: "draft", source_analysis_id: "a1", current_version: 1,
  created_at: "", updated_at: "", subject: "Re: Brightline", body: "Hi Dana,\n\nHere is my view.", version_count: 1,
  versions: [{ version: 1, subject: "Re: Brightline", body: "Hi Dana,\n\nHere is my view.", note: "Generated", author: "ai", provider: "mock", created_at: "" }] };

test("draft editor: edit, save as new version, and copy only the draft text", async () => {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  mockFetch([["PUT", /\/api\/drafts\/d1$/, { ...draft, current_version: 2 }], ["GET", /.*/, {}]]);
  renderApp(<DraftEditor draft={draft} />);
  const body = screen.getByTestId("draft-body");
  expect(screen.getByTestId("save-draft")).toBeDisabled();
  await userEvent.type(body, " Thanks.");
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  await userEvent.click(screen.getByTestId("save-draft"));
  await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ body: "Hi Dana,\n\nHere is my view. Thanks.", subject: "Re: Brightline" }));
  await userEvent.click(screen.getByTestId("copy-draft"));
  expect(writeText).toHaveBeenCalledWith("Hi Dana,\n\nHere is my view. Thanks.");
});

test("draft editor: writing controls request a real revision", async () => {
  mockFetch([
    ["GET", /\/api\/settings/, settings],
    ["POST", /\/api\/drafts\/d1\/rewrite$/, { run: { ...run, id: "r2" } }],
    ["GET", /\/api\/runs\/r2$/, { ...run, id: "r2", status: "succeeded" }],
    ["GET", /.*/, {}],
  ]);
  renderApp(<DraftEditor draft={draft} />);
  await userEvent.click(screen.getByTestId("rewrite-firmer"));
  await waitFor(() => expect(calls.find((c) => c.url === "/api/drafts/d1/rewrite")?.body).toEqual({ preset: "firmer" }));
  expect(await screen.findByText(/Revised draft ready/)).toBeInTheDocument();
});

test("knowledge search shows highlighted excerpts with source references", async () => {
  mockFetch([
    ["GET", /\/api\/knowledge/, { items: [] }],
    ["GET", /\/api\/search/, { relaxed: false, results: [{ kind: "chunk", id: "12", title: "credit-agreement.pdf", excerpt: "a [[commitment]] fee of 0.35%", provenance: "source_document",
      workspace_id: "w1", workspace_title: "Credit facility", created_at: new Date().toISOString(), attachment_id: "a1", page: 2, section: "ARTICLE 2", doctype: "pdf" }] }],
  ]);
  renderApp(<Knowledge />, { route: "/knowledge", path: "/knowledge" });
  await userEvent.type(screen.getByTestId("search-input"), "commitment fee");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  const results = await screen.findByTestId("search-results");
  expect(results).toHaveTextContent("credit-agreement.pdf");
  expect(results).toHaveTextContent("p. 2");
  expect(results.querySelector("mark")?.textContent).toBe("commitment");
  expect(calls.find((c) => c.url.startsWith("/api/search"))!.url).toContain("q=commitment+fee");
});

test("navigation: sidebar lists recent workspaces and main sections", async () => {
  mockFetch([
    ["GET", /\/api\/workspaces/, { workspaces: [{ id: "w1", title: "Brightline revenue", status: "active", tags: [], description: "", created_at: "", updated_at: "", file_count: 3, message_count: 2 }] }],
    ["GET", /\/api\/health/, { status: "ok", provider: "mock", ai_configured: true, model: "m", version: "1" }],
  ]);
  renderApp(<Sidebar />);
  expect(await screen.findByRole("link", { name: /Brightline revenue/ })).toHaveAttribute("href", "/w/w1");
  for (const name of ["Home", "Knowledge", "Drafts", "Decisions", "Settings"]) expect(screen.getByRole("link", { name: new RegExp(name) })).toBeInTheDocument();
  expect(await screen.findByText("Offline mock AI")).toBeInTheDocument();
});

test("workspace: missing workspace shows a clear error", async () => {
  mockFetch([["GET", /\/api\/workspaces\/nope/, () => ({ status: 404, body: { detail: { message: "Workspace not found.", code: "not_found" } } })], ["GET", /.*/, {}]]);
  renderApp(<WorkspacePage />, { route: "/w/nope", path: "/w/:id" });
  expect(await screen.findByText("Workspace not found.")).toBeInTheDocument();
});
