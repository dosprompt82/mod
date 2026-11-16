"""Detects whether setup must run again after an update.

The interface is pre-built and Python packages are installed once, so after an update those can be stale.
This script fingerprints everything setup depends on and compares it with the fingerprint saved when
setup last finished.

  python tools/setup_stamp.py check   -> exit 0 if up to date, 1 if setup should run
  python tools/setup_stamp.py write   -> record the current fingerprint (called at the end of setup)
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAMP = ROOT / ".setup-stamp"
FILES = ["backend/requirements.txt", "frontend/package.json", "frontend/package-lock.json", "frontend/index.html",
         "frontend/vite.config.ts", "frontend/tailwind.config.js", "frontend/postcss.config.js",
         "frontend/tsconfig.json", "frontend/tsconfig.app.json", "frontend/tsconfig.node.json"]
DIRS = ["frontend/src", "frontend/public"]


def fingerprint() -> str:
    h = hashlib.sha256()
    paths = [ROOT / f for f in FILES]
    for d in DIRS:
        paths += sorted(p for p in (ROOT / d).rglob("*") if p.is_file())
    for p in paths:
        if p.exists():
            h.update(p.relative_to(ROOT).as_posix().encode())
            h.update(p.read_bytes().replace(b"\r\n", b"\n"))  # same result for Windows line endings
    return h.hexdigest()


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "write":
        STAMP.write_text(fingerprint())
        return 0
    if not (ROOT / "frontend" / "dist" / "index.html").exists():
        return 1
    try:
        return 0 if STAMP.read_text().strip() == fingerprint() else 1
    except OSError:
        return 1


if __name__ == "__main__":
    sys.exit(main())
