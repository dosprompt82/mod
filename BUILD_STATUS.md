# Build status

Last verified: 2026-11-16. Legend: **Implemented & tested** (automated tests exercise it) · **Implemented** (works in manual/browser checks, no dedicated automated test) · **Partial** · **Unverified** · **Unavailable**.

## Live AI

| Item | Status |
|---|---|
| Real Anthropic API request | **UNVERIFIED.** No API key could be provided in the build environment, so no authenticated request was made. The provider code is tested against a fake SDK client (request shape, image blocks, prompt caching, refusal fallback parameter, retries/backoff, error mapping, mid-stream cancellation). Run `tests/test_live_smoke.py` with a key to verify. |
| Vision on real screenshots | **UNVERIFIED** (same reason). Images are sent as base64 image blocks; tall screenshots are tiled with overlap. |
| Analysis quality | **UNVERIFIED.** All automated results come from the labelled offline mock provider. |

## Features

| Area | Feature | Status |
|---|---|---|
| Updates | `update.*` scripts (backup → pull → rebuild), automatic rebuild detection in launchers, newer-data guard | Implemented & tested on Linux; Windows/macOS scripts **not executed** |
| Foundation | FastAPI + SQLite + versioned migrations, one-command launchers | Implemented & tested (Linux `start.sh`/`setup.sh` run from a clean copy; `start.bat`, `setup.bat`, `start.command` written but **not executed**: no Windows/macOS machine available) |
| Input | Multi-file drag-drop, file picker, add files mid-conversation, remove before sending | Implemented & tested (Vitest, Playwright) |
| Input | Clipboard screenshot paste (Ctrl/Cmd+V) | Implemented & tested (Vitest + real Chromium paste event) |
| Input | Content-based type validation, size limit, checksums/duplicates, generated storage names | Implemented & tested |
| Input | Previews (images, PDF original, extracted text by page/section) | Implemented |
| Extraction | PDF text by page, image-only page detection; DOCX paragraphs, headings, tables; TXT/MD; images | Implemented & tested |
| Extraction | Real processing states (uploaded → extracting → ready / needs vision / failed), honest failure messages | Implemented & tested |
| Extraction | Vision transcription of images and image-only PDF pages | Implemented & tested with mock; **live unverified** |
| Email | Structured analysis A–F, thread reconstruction, deadlines, decisions, uncertainties, draft | Implemented & tested (mock); prompt quality **unverified** live |
| Email | Writing controls (8 presets + custom), each creates a new version | Implemented & tested |
| Email | Copy only the draft | Implemented & tested |
| Documents | Source-grounded analysis, verified quotes with file/page/section, unverified quotes flagged | Implemented & tested |
| Documents | Multi-document comparison, follow-up questions without re-upload | Implemented & tested (routing/context); quality **unverified** live |
| Analyst | 8-step reasoning prompt, concise vs full answers, external-guidance caveats | Implemented (prompt); **unverified** live |
| Reviewer | "Challenge this" with severities, counterargument, revised conclusion; works on analyses and drafts | Implemented & tested |
| Reviewer | Revised analysis as a new version + side-by-side comparison; original never overwritten | Implemented & tested |
| Knowledge | SQLite FTS5 search: keywords, phrases, titles, type, provenance, dates, tags, workspace | Implemented & tested |
| Knowledge | Save/Edit/Delete/Export; provenance labels; nothing saved automatically | Implemented & tested |
| Writing | Writing profile: propose → edit → approve; applied to drafts when approved | Implemented & tested (mock) |
| Document Studio | DOCX (headings, numbered memo sections, lists, tables, sources, page numbers), PDF, MD, TXT | Implemented & tested (DOCX opened by python-docx and converted by LibreOffice) |
| Document Studio | Version history, restore, word-level diff | Implemented & tested (API); diff view implemented |
| Assistant | Tasks/decisions, extraction from results (user confirms), grounded briefings, daily/weekly summaries | Implemented & tested |
| Assistant | Meeting talking points and follow-up drafts | Implemented (writing workflow) |
| Strategy | Strategic review over stored records only, observations vs recommendations | Implemented & tested (mock) |
| Workspaces | Create, rename, status, tags, archive, delete with confirmation, export (.zip), auto title | Implemented & tested |
| Orchestration | Routing with user override, bounded context, structured validation + one repair, retries, timeouts, cancellation, token/cost tracking | Implemented & tested |
| Security | Localhost binding, Host check, CSRF header, path-traversal protection, safe Markdown, CSP, audit log, prompt-injection fencing | Implemented & tested (see SECURITY.md) |
| Settings | AI provider, appearance, writing, knowledge, privacy (consent, backup/restore, clear history), diagnostics | Implemented & tested (API); UI implemented |
| UX | Light/dark/system theme, responsive layout, keyboard shortcuts | Implemented; axe (WCAG 2 A/AA) shows no serious/critical violations on the main screens in light and dark |
| Embeddings / semantic search | | Unavailable by design (FTS first) |
| Calendar/email integrations | | Unavailable by design (v1 scope) |

## Test results (2026-11-16)

| Suite | Result |
|---|---|
| Backend pytest | 83 passed, 1 skipped (live smoke test, needs a key) |
| Frontend Vitest | 14 passed |
| TypeScript (`tsc -b`) | clean |
| ESLint | clean |
| Production build (`vite build`) | succeeds |
| Playwright E2E (real backend, mock AI) | 4 passed: email screenshot → draft → edit → save → reload → export; multi-page PDF → question → evidence → analysis → review → DOCX opens; real clipboard paste; axe accessibility scan |
| Clean-copy install (`setup.sh`) + backend tests | passed |
| Update rehearsal (Linux): install → add data → publish new version → `update.sh` | passed: refused while running, pre-update backup made, version 1.0.0 → 1.0.1, data kept, new interface served; launcher auto-rebuilt after an update applied without the script; older version refused newer data with a clear message |

## Known limitations

- Live AI behaviour (accuracy, vision legibility, prompt quality, cost) has not been observed. Expect to tune prompts after first real use.
- No local OCR: text in images is read only by the AI model, and its transcriptions are labelled as such.
- DOCX "footnotes" are rendered as a numbered Sources section, not Word footnotes. PDF export is clean but typographically simpler than DOCX.
- The accessibility scan covers the main screens, not every result state; no manual screen-reader pass was done.
- When attachments exceed the per-request budget (~120k characters, about 35 pages), documents up to ~20 pages are sent in full and longer ones (e.g. guides) contribute the passages that best match the request and the topics of the shorter documents. Relevant guide passages that use different wording can still be missed.
- Cancellation stops streaming between events; an in-flight HTTP connection may take a moment to close.
- Single-user, single-machine design; not intended for network exposure.
