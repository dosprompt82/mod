# Decisions

| # | Decision | Why |
|---|---|---|
| 1 | FastAPI serves both the API and the built React app on 127.0.0.1:8765 | One process, one URL, nothing else to start daily |
| 2 | SQLite with a small versioned migration runner (`app/db.py`) instead of Alembic | Single-user app; migrations stay explicit without extra tooling |
| 3 | `Attachment` is the Document entity; pages and chunks hang off it | Avoids duplicating file metadata; page/section provenance lives on chunks |
| 4 | Chunks never span pages or sections | Citations get exact page and section attribution |
| 5 | Quotes are verified verbatim (whitespace/quote-normalised, ellipsis-aware) against stored text; page/section come from the matched chunk, never from the model | Prevents fabricated citations and page numbers |
| 6 | Image text comes only from AI vision; transcriptions are stored as labelled "AI transcription" pages | No local OCR dependency; honesty about provenance |
| 7 | JSON-in-prompt + Pydantic validation + one repair call, instead of provider-specific structured output modes | Works with any configured model and with the mock; malformed output degrades to labelled plain text |
| 8 | Explicit routing (`ai/workflows.py::plan`) with user override; composite requests become step pipelines | Predictable, testable; no agent framework |
| 9 | Bounded context: ≤120k chars of sources (FTS-ranked when larger), ≤12 images, ≤4–8 knowledge items | Cost and latency control; avoids sending the whole knowledge base |
| 10 | Natural-language retrieval uses OR + stopword removal + BM25; typed searches use AND and relax only if empty | Precise search for users, recall for AI context |
| 11 | Background threads (2 AI, 2 extraction) with run state in the DB; restart marks interrupted runs failed | Non-blocking UI, survives refresh, no Redis/Celery |
| 12 | Default model `claude-opus-5-5`, configurable in Settings or `PS_MODEL`; refusal fallbacks enabled only for models known to accept them, auto-disabled if rejected | Current default model without hardcoding a dependency on it |
| 13 | Retries are explicit (3, exponential backoff with jitter) and SDK retries are off | So retries respect cancellation |
| 14 | Mock provider is a first-class provider (`PS_AI_PROVIDER=mock`), and every mock result is visibly labelled | Deterministic tests; never mistaken for real analysis |
| 15 | One-time consent before the first external AI call, enforced server-side (HTTP 412) | Uploading never transmits; external processing is explicit |
| 16 | Briefings ("What am I waiting on?") are computed deterministically from stored records | Grounded answers that cannot invent deadlines or activity |
| 17 | Extracted action items/decisions are proposed; the user clicks to track them | Human control; no silent saving |
| 18 | "Save to Knowledge" from AI output is stored as `user_approved` with `origin: ai_generated` | Distinguishes approval from authorship |
| 19 | Deleting a workspace removes its conversation, files, analyses and reviews; drafts, tasks, decisions and knowledge are kept and unlinked | Never lose user-edited deliverables by accident |
| 20 | Fonts are bundled (Fontsource; DejaVu for PDF) rather than loaded from a CDN | No third-party requests from the UI |
| 21 | Tailwind 3 with CSS-variable tokens; IBM Plex Sans for UI, Source Serif 4 for documents | Restrained, readable, consistent light/dark |
| 22 | TypeScript pinned to 5.9 | typescript-eslint does not support TS 6+ |
| 23 | Embeddings deferred | FTS5 first, as specified |
