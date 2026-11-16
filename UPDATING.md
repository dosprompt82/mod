# Updating Personal Superpower

## The one idea to understand

The app's folder holds two different things:

| | What it is | What updates do to it |
|---|---|---|
| **The program** | Everything except the `data` folder: the code, the screens, the start files | **Replaced** with the new version |
| **Your data** | The `data` folder: workspaces, uploaded files, drafts, knowledge, settings, your API key, backups | **Never touched** by an update |

So updating is safe for your work. The update scripts also make a backup of your data first, just in case.

## Where updates come from

The program's code lives on GitHub in `dosprompt82/mod`. An "update" is simply a newer version of that code.

**How updates get made.** You (or anyone with access) open a Claude Code session on the repository and ask for a change, for example *"make the email drafts shorter by default"* or *"add a button that exports all drafts"*. Claude changes the code, tests it, and **pushes** it to GitHub. **Nothing changes on your computer until you download the update.** The copy you're running keeps working exactly as before.

**Branches, in one sentence.** A branch is a named line of versions. The app currently lives on the branch **`claude/new-session-nyeqzu`**, and your copy follows that branch. When you ask for changes, ask for them on that branch (*"push it to claude/new-session-nyeqzu"*). If a change lands on a different branch, either ask Claude to merge it into this one, or switch branch in GitHub Desktop (Current branch → pick the new one). Many people eventually merge everything into `main` and follow `main` as the "stable" version; ask Claude to open a pull request when you want that.

## How to install an update

**Before any method: close the app** (close its Terminal / black window, or press Ctrl+C in it). A running app keeps using the old code until it's restarted.

### Option 1: GitHub Desktop (easiest)
1. Optional but wise: in the app, Settings → Privacy → **Create backup**. Then close the app.
2. Open GitHub Desktop. Make sure **Current repository** is `mod` and **Current branch** is `claude/new-session-nyeqzu`.
3. Click **Fetch origin**. If there's an update, the button changes to **Pull origin**. Click it.
4. Double-click **`start.command`** / **`start.bat`** as usual. The first start after an update shows *"A new version was installed: updating packages and rebuilding the interface (about a minute)…"*. That's expected, and it only happens once per update.

### Option 2: the update script (backs up automatically)
1. Close the app.
2. Double-click **`update.command`** (Mac) or **`update.bat`** (Windows). Linux: `./update.sh`.
3. It checks the app is closed, **backs up your data** (to `data/backups/…-pre-update.zip`), downloads the newest version, rebuilds, and tells you e.g. *"Updated from version 1.1.0 to 1.2.0."*
4. Start the app as usual.

The script needs the `git` command:
- Mac: the first time, macOS may offer to install "command line developer tools". Click **Install**.
- Windows: install **Git for Windows** from https://git-scm.com/ (default options).

It only works if you installed with GitHub Desktop or Git, not from a ZIP.

### Option 3: you installed from a ZIP
1. Close the app and make a backup (Settings → Privacy → **Create backup**) before closing.
2. Download the new ZIP (INSTALL.md, Step 4, option B) and unzip it to a **new** folder.
3. From the **old** folder, move these into the new folder:
   - the **`data`** folder (all your work);
   - the **`.env`** file, if you created one. It's hidden: on a Mac press **Cmd + Shift + .** in Finder to show hidden files; on Windows, View → **Hidden items**.
4. Start the app from the **new** folder (the first start takes a minute to set up).
5. Once everything looks right, delete the old folder.

## What happens when you launch a new version

- **First start rebuilds.** About a minute, once per update; then it's back to normal speed. (The launcher detects updates by itself, so even if you forget the update script it won't run a stale interface.)
- **Your data upgrades itself** if the new version needs a different database layout. This is automatic and keeps everything.
- **Check which version you're on:** Settings → Application → **Version**. [CHANGELOG.md](CHANGELOG.md) lists what changed in each version.
- **If the page looks odd** after an update, do a hard refresh: **Cmd + Shift + R** (Mac) or **Ctrl + F5** (Windows).
- **AI requests that were running** when you closed the app show "Interrupted… run it again". Nothing else is lost.
- **Only one copy runs at a time** on the same address. If you keep an old folder around, don't start both.

## Going back to an earlier version

The cleanest way: ask Claude Code to **revert** the change you don't want (*"revert the last update on claude/new-session-nyeqzu"*). That creates a new version without it, which you install like any update.

**If the newer version had already upgraded your data**, an older version will refuse to start and say *"Your data was created by a newer version…"*. This protects your data from being damaged. To go back anyway:
1. Close the app. In the app's folder, rename `data` to `data-newer`.
2. Start the older version. It starts empty.
3. Settings → Privacy → **Restore from backup…** and choose the `…-pre-update.zip` file inside `data-newer/backups`.
4. Re-enter your API key (Settings → AI provider). Keys are never stored in backups.

## If the update fails

| Message | What it means / what to do |
|---|---|
| "Personal Superpower is running. Stop it first" | Close the app's window, then run the update again. |
| "Your local changes … would be overwritten" / "Not possible to fast-forward" | Files in the folder were edited by hand. In GitHub Desktop, look at **Changes**, right-click → **Discard changes** (only if you don't need them), then pull again. Unsure? Ask Claude Code. |
| "The interface could not be built" | Run the update again (a network hiccup is the usual cause). If it repeats, copy the error into a Claude Code session. |
| "This folder wasn't installed with Git" | Use Option 3 (ZIP), or reinstall with GitHub Desktop and move your `data` folder across. |

## Checklist for whoever makes an update

1. Bump `VERSION` in `backend/app/config.py` and add an entry to `CHANGELOG.md`.
2. Any database change goes in a **new** migration at the end of `MIGRATIONS` in `backend/app/db.py`. Never edit an existing migration.
3. Run the tests: `backend: .venv/bin/python -m pytest -q`; `frontend: npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`.
4. Push to the branch users follow (currently `claude/new-session-nyeqzu`).
