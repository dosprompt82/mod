import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniversalInput } from "../components/UniversalInput";
import { att, calls, mockFetch, renderApp } from "./utils";

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
  globalThis.URL.revokeObjectURL = vi.fn();
});

test("uploads chosen files, shows status, and removes them before submission", async () => {
  mockFetch([
    ["POST", /\/api\/attachments$/, { attachments: [att({ filename: "agreement.pdf", kind: "pdf", status: "ready", page_count: 4 })], errors: [] }],
    ["DELETE", /\/api\/attachments\/a1$/, { deleted: "a1" }],
  ]);
  const onSubmit = vi.fn(async () => true);
  renderApp(<UniversalInput onSubmit={onSubmit} />);
  const file = new File(["%PDF-1.7"], "agreement.pdf", { type: "application/pdf" });
  await userEvent.upload(screen.getByTestId("file-input"), file);
  expect(await screen.findByText("agreement.pdf")).toBeInTheDocument();
  expect(await screen.findByText("Ready")).toBeInTheDocument();
  const upload = calls.find((c) => c.method === "POST" && c.url === "/api/attachments")!;
  expect((upload.body as FormData).get("files")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Remove agreement.pdf" }));
  await waitFor(() => expect(screen.queryByText("agreement.pdf")).not.toBeInTheDocument());
  expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/attachments/a1")).toBe(true);
});

test("pasting a screenshot from the clipboard uploads it with a readable name", async () => {
  mockFetch([["POST", /\/api\/attachments$/, { attachments: [att({ filename: "Pasted screenshot 1.png" })], errors: [] }]]);
  renderApp(<UniversalInput onSubmit={vi.fn(async () => true)} />);
  const img = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });
  const evt = new Event("paste", { bubbles: true, cancelable: true }) as unknown as ClipboardEvent;
  Object.defineProperty(evt, "clipboardData", { value: { items: [{ kind: "file", getAsFile: () => img }] } });
  document.dispatchEvent(evt);
  expect(await screen.findByText("Pasted screenshot 1.png")).toBeInTheDocument();
  expect(evt.defaultPrevented).toBe(true);
  const fd = calls[0].body as FormData;
  expect((fd.get("files") as File).name).toBe("Pasted screenshot 1.png");
});

test("plain text paste is left alone", () => {
  mockFetch([]);
  renderApp(<UniversalInput onSubmit={vi.fn(async () => true)} />);
  const evt = new Event("paste", { bubbles: true, cancelable: true }) as unknown as ClipboardEvent;
  Object.defineProperty(evt, "clipboardData", { value: { items: [{ kind: "string", getAsFile: () => null }] } });
  document.dispatchEvent(evt);
  expect(evt.defaultPrevented).toBe(false);
  expect(calls.length).toBe(0);
});

test("unsupported files are rejected with a clear message and never uploaded", async () => {
  mockFetch([]);
  renderApp(<UniversalInput onSubmit={vi.fn(async () => true)} />);
  const input = screen.getByTestId("file-input") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "virus.exe")] } });
  expect(await screen.findByText(/isn't supported/)).toBeInTheDocument();
  expect(calls.length).toBe(0);
});

test("server-side rejection is shown on the attachment", async () => {
  mockFetch([["POST", /\/api\/attachments$/, () => ({ status: 400, body: { detail: { message: "'big.pdf' is larger than the 25 MB limit.", code: "upload_rejected" } } })]]);
  renderApp(<UniversalInput onSubmit={vi.fn(async () => true)} />);
  await userEvent.upload(screen.getByTestId("file-input"), new File(["%PDF"], "big.pdf", { type: "application/pdf" }));
  expect((await screen.findAllByText(/larger than the 25 MB limit/)).length).toBeGreaterThan(0);
});

test("Ctrl+Enter submits the instruction with the chosen action", async () => {
  mockFetch([]);
  const onSubmit = vi.fn(async () => true);
  renderApp(<UniversalInput onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole("button", { name: "Create a memo" }));
  const ta = screen.getByLabelText("Instruction");
  await userEvent.type(ta, "Memo on covenant compliance");
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ instruction: "Memo on covenant compliance", attachmentIds: [], action: "memo", workflow: null }));
  expect(ta).toHaveValue("");
});

test("files without an instruction prompt for an action instead of guessing", async () => {
  mockFetch([["POST", /\/api\/attachments$/, { attachments: [att({ status: "ready", kind: "pdf", filename: "a.pdf" })], errors: [] }]]);
  const onSubmit = vi.fn(async () => true);
  renderApp(<UniversalInput onSubmit={onSubmit} />);
  await userEvent.upload(screen.getByTestId("file-input"), new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
  await screen.findByText("Ready");
  await userEvent.click(screen.getByTestId("submit"));
  const prompt = await screen.findByText(/What would you like to do/);
  expect(onSubmit).not.toHaveBeenCalled();
  await userEvent.click(within(prompt.parentElement!).getByRole("button", { name: "Summarize" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ action: "summarize", attachmentIds: ["a1"] })));
});
