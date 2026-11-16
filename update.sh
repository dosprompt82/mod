#!/usr/bin/env bash
# Updates Personal Superpower to the newest version. Your data (the data/ folder) is never touched,
# and a backup of it is made first.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
PORT="${PS_PORT:-8765}"
PYBIN="$ROOT/backend/.venv/bin/python"
version() { sed -n 's/^VERSION = "\(.*\)"/\1/p' backend/app/config.py; }

if [ -x "$PYBIN" ] && "$PYBIN" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$PORT/api/health', timeout=1)" >/dev/null 2>&1; then
  echo "Personal Superpower is running. Stop it first (press Ctrl+C in its window), then run this again."
  exit 1
fi

OLD="$(version)"
DB="${PS_DATA_DIR:-$ROOT/data}/superpower.db"
if [ -f "$DB" ] && [ -x "$PYBIN" ]; then
  echo "1/3  Backing up your data…"
  (cd backend && "$PYBIN" -c "from app.services.backup import create_backup; print('     Saved', create_backup('pre-update'))")
else
  echo "1/3  No existing data to back up."
fi

echo "2/3  Downloading the newest version…"
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  if ! git pull --ff-only; then
    echo "Couldn't download the update automatically (see the message above). See UPDATING.md → 'If the update fails'." >&2
    exit 1
  fi
else
  echo "     This folder wasn't installed with Git, so it can't download updates by itself."
  echo "     Follow the 'Updating a ZIP download' steps in UPDATING.md."
  exit 1
fi

echo "3/3  Installing and rebuilding…"
./setup.sh
NEW="$(version)"
if [ "$OLD" = "$NEW" ]; then echo "You're on version $NEW."; else echo "Updated from version $OLD to $NEW."; fi
echo "Start the app as usual."
