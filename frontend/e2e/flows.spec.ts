import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const DEMO = resolve(HERE, "../../demo-data/files");
const PY = resolve(HERE, process.platform === "win32" ? "../../backend/.venv/Scripts/python.exe" : "../../backend/.venv/bin/python");

async function acceptConsentIfShown(page: Page) {
  // Shown once, before the first external AI request.
  const btn = page.getByTestId("consent-accept");
  const shown = await btn.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false);
  if (shown) await btn.click();
}

test("email screenshot → draft reply → edit → save → reload → export", async ({ page }) => {
  // 1-2. Launch and create a workspace
  await page.goto("/");
  await page.getByRole("button", { name: "New workspace" }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f]{32}$/);
  await expect(page.getByTestId("ws-title")).toHaveText("Untitled workspace");
  // 3. Upload a synthetic email screenshot
  await page.getByTestId("file-input").setInputFiles(join(DEMO, "email-thread-1.png"));
  await expect(page.getByText("Image: read by AI on request")).toBeVisible({ timeout: 15_000 });
  // 4. Ask for a reply
  await page.getByLabel("Instruction").fill("What do they want from me? Draft a reply.");
  await page.getByTestId("submit").click();
  await acceptConsentIfShown(page);
  // 5. Result appears
  const result = page.getByTestId("email-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.getByTestId("email-asking")).not.toBeEmpty();
  // 6-7. Edit and save the draft
  const body = result.getByTestId("draft-body");
  await body.click();
  await body.press("End");
  await body.pressSequentially("\nP.S. Edited in the end-to-end test.");
  await result.getByTestId("save-draft").click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  // 8-9. Reload and confirm persistence
  await page.reload();
  await expect(page.getByTestId("draft-body")).toHaveValue(/P\.S\. Edited in the end-to-end test\./);
  // 10. Export the draft
  const download = page.waitForEvent("download");
  await page.getByTestId("email-result").getByRole("button", { name: "Export" }).first().click();
  await page.getByRole("menuitem", { name: "Plain text" }).click();
  const file = await download;
  const path = await file.path();
  expect(file.suggestedFilename()).toMatch(/\.txt$/);
  expect(readFileSync(path!, "utf8")).toContain("P.S. Edited in the end-to-end test.");
});

test("multi-page PDF → question → evidence → analysis → critical review → DOCX", async ({ page }) => {
  // 1. Upload a synthetic multi-page PDF
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(join(DEMO, "credit-agreement.pdf"));
  await expect(page.getByTestId("universal-input").getByText(/^Ready/)).toBeVisible({ timeout: 15_000 });
  // 2. Ask a substantive question
  await page.getByLabel("Instruction").fill("What are the financial covenants, and are they consistent with the definitions?");
  await page.keyboard.press("Control+Enter");
  await acceptConsentIfShown(page);
  // 3-4. Analysis with extracted, verified evidence
  const analysis = page.getByTestId("analysis-result");
  await expect(analysis).toBeVisible({ timeout: 30_000 });
  await expect(analysis.getByTestId("exec-conclusion")).not.toBeEmpty();
  await analysis.getByRole("button", { name: /Supporting evidence/ }).click();
  await expect(analysis.getByText("Verified quote").first()).toBeVisible();
  await expect(analysis.getByText(/^p\. \d+$/).first()).toBeVisible();
  await analysis.getByRole("button", { name: "View in document" }).first().click();
  await expect(page.locator("mark.hit")).toBeVisible();
  await page.keyboard.press("Escape");
  // 5. Request a critical review
  await analysis.getByTestId("challenge").click();
  const review = page.getByTestId("review-result");
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review.getByText(/Needs revision|Sound|Unsound/).first()).toBeVisible();
  // 6. Export the analysis as DOCX
  const download = page.waitForEvent("download");
  await analysis.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "Word (.docx)" }).click();
  const file = await download;
  const path = (await file.path())!;
  expect(file.suggestedFilename()).toMatch(/\.docx$/);
  // 7. The DOCX opens and contains the analysis with page-referenced sources
  const out = execFileSync(PY, ["-c", "import sys, docx; d = docx.Document(sys.argv[1]); print('\\n'.join(p.text for p in d.paragraphs))", path]).toString();
  expect(out).toContain("Executive conclusion");
  expect(out).toMatch(/credit-agreement\.pdf, p\. \d/);
});

test("pasting a screenshot from the clipboard attaches it (real browser paste event)", async ({ page }) => {
  await page.goto("/");
  const png = readFileSync(join(DEMO, "email-thread-3.png")).toString("base64");
  await page.getByLabel("Instruction").click();
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "image.png", { type: "image/png" }));
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, png);
  await expect(page.getByText("Pasted screenshot 1.png")).toBeVisible();
  await expect(page.getByText("Image: read by AI on request")).toBeVisible({ timeout: 15_000 });
});

test("main screens have no serious accessibility violations (axe)", async ({ page }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const [path, scheme] of [["/", "light"], ["/knowledge", "light"], ["/drafts", "light"], ["/decisions", "light"], ["/settings", "light"],
    ["/", "dark"], ["/settings", "dark"]] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path} (${scheme}): ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
  }
});
