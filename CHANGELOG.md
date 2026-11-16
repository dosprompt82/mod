# Changelog

Versions follow `major.minor.patch`. The running version is shown in Settings → Application.

## 1.3.1 (2026-11-16)
- Fixed: "database is locked" when starting a request while large PDFs were still being processed. The app now waits for the database (up to 60 seconds) and saves large documents in short steps, so it never holds the database for long.
- If the database is still busy, you get a plain message instead of an error.
- The app warns, on the Home screen, in Settings and when it starts, if it's running from a OneDrive, Dropbox or iCloud folder. INSTALL.md now recommends your user folder, with steps for moving an existing install.

## 1.3.0 (2026-11-16)
- New **Document review** mode for reviewing someone else's memo or report. Ask "Review this memo…", or use the Review a document button or the Document review workflow. The output follows a reviewer's format:
  - a scope note: what was reviewed, Word comments and tracked changes, and missing source documents;
  - a score out of 10, with the reasons it lost points;
  - an elevator pitch;
  - a key-questions table (Issue / Memo conclusion / My view);
  - issues by tier (primary P1…, secondary S1…);
  - paste-ready comments, each with its own Copy button, plus Copy all.
  It exports to Word with the same structure. "Draft revised memo" turns the review into a revised draft.
- Document reviews always send the whole document under review (up to about 45 pages), with room left for guide excerpts.
- Word documents: text inside tracked insertions is no longer dropped (it was before), deleted text is excluded, Word comments are read and can be cited, and the page count is taken from Word.

## 1.2.0 (2026-11-16)
- Much better handling of large reference documents (e.g. accounting guides attached next to a memo): shorter documents such as the memo are always sent in full, and guide passages are chosen by the topics the memo discusses, not just the words of your request. Guide passages are marked as reference excerpts so the AI reviews your document against them.
- Preparing very large PDFs for search is far faster (it no longer slows down with each additional page).
- Progress now says what's happening while the AI reads and thinks, and long answers have more room before being cut off.
- Fixed: elapsed times and "x min ago" were wrong outside the UTC time zone (the progress timer stayed at 0s).

## 1.1.2 (2026-11-16)
- Fixed: mentioning a memo ("review this memo") no longer makes the app write a new memo; it only drafts one when you ask it to ("prepare a memo…").

## 1.1.1 (2026-11-16)
- Fixed (Windows): exporting to DOCX, PDF, Markdown or TXT failed because of a date format Windows doesn't support.
- Fixed (Windows): restoring a backup could fail because Windows won't replace an open file.
- Windows setup finds newer Python versions, shows download progress, and explains package-install failures; the browser now opens only once the app is ready.
- A clear message when your Anthropic account is out of credit.

## 1.1.0 (2026-11-16)
- Updates are now automatic to apply: the launcher detects a new version and rebuilds on first start.
- New `update.command` / `update.bat` / `update.sh`: back up your data, download the newest version, rebuild.
- Safety: an older version refuses to open data upgraded by a newer one (and refuses such backups), with a plain explanation.
- Setup now shows the actual error if the interface can't be built.
- Fixed: a fresh install could fail to build the interface.
- New guides: INSTALL.md (step by step) and UPDATING.md.

## 1.0.0 (2026-11-16)
- First release: universal input (drag, drop, paste screenshots), email screenshot intelligence, document analysis with verified citations, critical reviewer with versioned revisions, drafts with version history and DOCX/PDF/MD/TXT export, knowledge search (SQLite FTS5), tasks and decisions with grounded briefings, strategic review, settings, backups.
