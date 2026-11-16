# Changelog

Versions follow `major.minor.patch`. The running version is shown in Settings → Application.

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
