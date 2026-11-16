# Personal Superpower

*Your intelligence, amplified.*

A local-first personal AI workstation. Paste email screenshots, drop documents, or type a short instruction; get source-grounded analysis, a critical second opinion, and polished, editable deliverables. Everything you create is saved locally and searchable.

> **Status:** see [BUILD_STATUS.md](BUILD_STATUS.md). All automated tests pass using an offline mock AI provider. **Live Anthropic API calls have not yet been verified** in the build environment because no API key was available there; the first real request on your machine is the live test.

**New here? Follow [INSTALL.md](INSTALL.md)** (step by step, no experience needed). To get new versions, see **[UPDATING.md](UPDATING.md)**.

---

## First-time setup

Requirements: **Python 3.12+** and **Node.js 18+** (Node is only used to build the interface).

| System | Do this once |
|---|---|
| macOS | Open Terminal in this folder and run `./setup.sh` (or just double-click `start.command`; it runs setup automatically the first time) |
| Linux | `./setup.sh` |
| Windows | Double-click `setup.bat` |

Setup creates `backend/.venv`, installs the Python packages, installs the interface packages and builds the interface. It takes about a minute and is safe to re-run.

## Everyday start

| System | Start |
|---|---|
| macOS | Double-click **`start.command`** |
| Linux | `./start.sh` |
| Windows | Double-click **`start.bat`** |

The app opens at **http://127.0.0.1:8765**. Keep the window open while you work; press Ctrl+C (or close the window) to stop. If setup hasn't been run, the launcher runs it first.

## Updating

Close the app, then run `update.command` (macOS), `update.bat` (Windows) or `./update.sh` (Linux): it backs up `data/`, pulls the newest version and rebuilds. Or pull with GitHub Desktop; the launcher notices the new version and rebuilds on the next start. Your `data/` folder is never touched by updates. Details: [UPDATING.md](UPDATING.md).

## Configure the AI

1. Get an API key from **console.anthropic.com** → API Keys.
2. In the app, open **Settings → AI provider**, paste the key and click **Save**. (Alternatively put `ANTHROPIC_API_KEY=...` in a `.env` file in this folder; see `.env.example`.)
3. Click **Test connection**.
4. The model defaults to `claude-opus-5-5`. Change **Model** to any vision-capable Claude model identifier if you prefer.
5. The first time you ask for analysis, you'll be asked to confirm that selected content is sent to Anthropic for processing.

The key is stored in `data/secrets.json` with owner-only permissions, is shown only masked, and is never written to logs or backups.

**Offline mode:** set `PS_AI_PROVIDER=mock` to run without any external calls. Results are clearly labelled placeholders; useful for trying the interface and for the test suite.

## Using it

- **Home → "What's on your mind?"** Drop files, paste screenshots (Ctrl/Cmd+V), and type a request. Ctrl/Cmd+Enter sends. Each request becomes a **workspace** you can return to.
- **Email screenshots:** "What do they actually want from me, and how should I respond?" gives you what they're asking, context, decisions, approach, a ready-to-edit draft (with Shorter / More direct / Warmer / Firmer / More diplomatic / More technical / More executive / Rewrite in my style), and uncertainties. **Copy email** copies only the draft.
- **Documents:** ask anything; every quote is checked against the extracted text and shown with file, page and section. Click **View in document** to see it highlighted in place.
- **Reviewing someone else's memo:** attach it (plus the agreements and guide chapters it relies on) and ask *"Review this memo as a senior technical reviewer."* You get a scope note, a score out of 10 with reasons, an elevator pitch, a key-questions table, issues by tier, and paste-ready comments with copy buttons.
- **Challenge this** runs an independent critical review (severity-rated). **Create revised analysis** produces a new version; the original is never overwritten, and you can compare them side by side.
- One request can chain steps: "Analyze this, identify the important issues, challenge your conclusion, and prepare a professional memo."
- **Drafts** keep full version history with word-level comparison and export to DOCX, PDF, Markdown or TXT.
- **Knowledge** is full-text search over documents, analyses, drafts and saved knowledge, with filters. Nothing is saved to Knowledge unless you choose **Save to Knowledge**.
- **Decisions** answers "What am I waiting on?", "What do I need to respond to?", "What decisions are outstanding?" and "What should I focus on today?" from your saved tasks and decisions only, plus daily/weekly summaries and an AI strategic review of your recent work.
- **Settings → Application → Load demo workspaces** adds fictional sample material to explore.

## Where your data lives

Everything is under `data/` in this folder (override with `PS_DATA_DIR`):

| What | Location |
|---|---|
| Database (SQLite + FTS5 search) | `data/superpower.db` |
| Uploaded files (stored under generated names) | `data/files/` |
| Exported documents | `data/exports/` |
| Backups (Settings → Privacy) | `data/backups/` |
| API key | `data/secrets.json` |
| Log (no prompts, file contents or keys) | `data/logs/app.log` |

## Development and tests

```bash
# Backend (FastAPI): API + mock-AI workflow tests
cd backend && .venv/bin/python -m pytest -q

# Frontend (React + Vite + Tailwind)
cd frontend && npm run typecheck && npm run lint && npm test && npm run build

# End-to-end (Playwright, real backend in mock-AI mode; build the frontend first)
cd frontend && npx playwright install chromium   # once, if you don't have a Playwright Chromium
npm run e2e

# Optional live API smoke test (sends fictional demo files to Anthropic)
cd backend && PS_LIVE_TEST=1 ANTHROPIC_API_KEY=sk-ant-... .venv/bin/python -m pytest tests/test_live_smoke.py -s

# Interface hot-reload during development (API on :8765, UI on :5173)
cd backend && PS_AI_PROVIDER=mock .venv/bin/python -m app.main
cd frontend && npm run dev
```

## Architecture

```
frontend/  React + TypeScript + Vite + Tailwind; TanStack Query; safe Markdown (no raw HTML)
backend/   FastAPI + SQLAlchemy + SQLite (FTS5); served on 127.0.0.1 together with the built UI
  app/ai/        provider abstraction (Anthropic + offline mock), prompts, schemas, context, workflows
  app/services/  storage, extraction (PyMuPDF, python-docx, Pillow), search, exports, backups, jobs
  app/api/       HTTP routes
demo-data/ fictional demonstration files (+ generate.py)
```

See [DECISIONS.md](DECISIONS.md), [SECURITY.md](SECURITY.md), [ROADMAP.md](ROADMAP.md) and [TASKS.md](TASKS.md).
