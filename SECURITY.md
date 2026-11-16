# Security

Personal Superpower is a single-user application that runs on your own computer. It has **not** been independently security-reviewed and is not represented as suitable for regulated or confidential data.

## What stays local, and what doesn't

- Files, extracted text, analyses, drafts, knowledge, settings and backups are stored only in `data/` on this machine.
- **AI processing is not local.** When you request analysis, the request and the content it needs (document excerpts, screenshots, relevant saved knowledge, prior results in the workspace) are sent to Anthropic's API using your key. Uploading a file never sends it anywhere by itself.
- A one-time consent is required (and enforced by the server) before the first external AI request. Settings → Privacy explains this and lets you withdraw consent.
- No telemetry, analytics or third-party scripts. Fonts are bundled; the UI makes no external requests.

## Controls

| Risk | Control |
|---|---|
| Network exposure | Binds to 127.0.0.1 by default; `TrustedHostMiddleware` rejects other Host headers (DNS-rebinding) |
| Cross-site requests from other websites | Every state-changing API request must carry `x-ps-client: 1`, which browsers can't send cross-origin without a CORS preflight the server never grants |
| API key exposure | Stored in `data/secrets.json` (mode 0600), outside Git (`.gitignore`) and excluded from backups; only a masked form is ever returned; not logged; HTTP client loggers are silenced |
| Malicious uploads | Type detected from content (magic bytes / DOCX structure), extension mismatch rejected, size limit (25 MB default), max 20 files per request |
| Path traversal | Files stored under generated names; every path is built with `safe_join`, which rejects anything outside its root; files are served only by database ID |
| Served-file attacks | Uploaded files are served with `nosniff` and a sandbox CSP (PDFs excepted so the browser viewer works); DOCX always downloads |
| XSS | Markdown rendered with raw HTML disabled; app CSP forbids inline and third-party scripts |
| Prompt injection | Untrusted content is wrapped in tagged blocks and the system prompt instructs the model to treat it as data, ignore embedded instructions and report suspected injection; the model has no tools and cannot take actions |
| Fabricated citations | Quotes are verified against stored text; unverified quotes are flagged, and page/section are never taken from the model |
| Error leakage | API errors return plain messages; stack traces go only to `data/logs/app.log` |
| Data loss | Backups (consistent SQLite snapshot + files) with strict validation on restore (allow-listed entries, integrity check) and an automatic pre-restore safety backup; destructive actions need typed confirmation |
| Accountability | Audit log of actions (IDs only, never content, prompts or keys) |

## Reporting

This is a personal project. If you find a problem, open an issue in the repository without including sensitive data.
