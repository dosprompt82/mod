#!/usr/bin/env bash
# First-time setup for Personal Superpower (Linux/macOS). Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31mSetup failed:\033[0m %s\n' "$*" >&2; exit 1; }

# Python 3.12+
PY=""
for c in python3.13 python3.12 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
[ -n "$PY" ] || fail "Python 3.12 or newer is required. Install it from https://www.python.org/downloads/ and run this again."

# Node 18+ (only needed to build the interface)
command -v node >/dev/null 2>&1 || fail "Node.js 18 or newer is required to build the interface. Install it from https://nodejs.org/ and run this again."
node -e 'process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)' || fail "Node.js 18 or newer is required (found $(node -v))."
command -v npm >/dev/null 2>&1 || fail "npm was not found. It is installed with Node.js."

say "1/3  Python environment ($($PY --version))"
[ -x backend/.venv/bin/python ] || "$PY" -m venv backend/.venv
backend/.venv/bin/python -m pip install --quiet --upgrade pip
backend/.venv/bin/python -m pip install --quiet -r backend/requirements.txt

say "2/3  Interface dependencies (Node $(node -v))"
(cd frontend && npm ci --no-audit --no-fund --loglevel=error)

say "3/3  Building the interface"
(cd frontend && npm run build --silent >/dev/null)

say "Setup complete. Start the app with ./start.sh (macOS: double-click start.command)."
