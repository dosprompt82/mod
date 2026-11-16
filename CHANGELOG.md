# Changelog

Versions follow `major.minor.patch`. The running version is shown in Settings → Application.

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
