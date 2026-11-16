import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// End-to-end tests run the real backend (serving the production build) in offline mock-AI mode
// against a throwaway data directory. Build the frontend first: npm run build.
const dataDir = mkdtempSync(join(tmpdir(), "ps-e2e-"));
const python = process.platform === "win32" ? "..\\backend\\.venv\\Scripts\\python.exe" : "../backend/.venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:8799", acceptDownloads: true, viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8799`,
    cwd: "../backend",
    url: "http://127.0.0.1:8799/api/health",
    env: { PS_DATA_DIR: dataDir, PS_AI_PROVIDER: "mock", PS_PORT: "8799" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
