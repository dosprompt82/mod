#!/usr/bin/env bash
# Starts Personal Superpower and opens it in your browser. Runs first-time setup if needed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
HOST="${PS_HOST:-127.0.0.1}"
PORT="${PS_PORT:-8765}"
URL="http://${HOST}:${PORT}"
case "$ROOT" in
  *OneDrive*|*Dropbox*|*"Mobile Documents"*|*CloudStorage*|*iCloud*)
    echo "WARNING: this folder is synced by a cloud service, which can lock or damage the app's database."
    echo "Move it somewhere that isn't synced (e.g. your home folder). See INSTALL.md, 'Moving the app'." ;;
esac
PYBIN="$ROOT/backend/.venv/bin/python"

open_browser() {
  if command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  else echo "Open $URL in your browser."; fi
}
healthy() { "$PYBIN" -c "import urllib.request,sys; urllib.request.urlopen('$URL/api/health', timeout=1)" >/dev/null 2>&1; }

if [ ! -x "$PYBIN" ] || [ ! -f frontend/dist/index.html ]; then
  echo "First run: setting things up (a few minutes, once)…"
  ./setup.sh
elif ! "$PYBIN" tools/setup_stamp.py check; then
  echo "A new version was installed: updating packages and rebuilding the interface (about a minute)…"
  ./setup.sh
fi

if healthy; then
  echo "Personal Superpower is already running at $URL"
  open_browser
  exit 0
fi

cd backend
"$PYBIN" -m uvicorn app.main:app --host "$HOST" --port "$PORT" --log-level warning &
PID=$!
trap 'kill $PID 2>/dev/null || true' INT TERM EXIT

for _ in $(seq 1 60); do
  if healthy; then break; fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "The server stopped during startup." >&2
    LOG="${PS_DATA_DIR:-$ROOT/data}/logs/app.log"
    [ -f "$LOG" ] && { echo "Last log lines:" >&2; tail -n 5 "$LOG" >&2; }
    echo "If port $PORT is in use, set PS_PORT in .env to another port." >&2
    exit 1
  fi
  sleep 0.5
done
healthy || { echo "The server did not respond at $URL. See data/logs/app.log." >&2; exit 1; }

echo "Personal Superpower is running at $URL"
echo "Keep this window open while you use it. Press Ctrl+C to stop."
open_browser
wait "$PID"
