"""Filesystem safety helpers: sanitised names and paths that cannot escape their root."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path


class UnsafePathError(ValueError):
    pass


def sanitize_filename(name: str, default: str = "file", max_len: int = 120) -> str:
    """A display/download name safe on every common filesystem. Never used to build storage paths."""
    name = unicodedata.normalize("NFKC", name or "")
    name = name.replace("\\", "/").split("/")[-1]  # drop any directory component
    name = re.sub(r"[\x00-\x1f\x7f<>:\"|?*]", "", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name or name in {".", ".."}:
        name = default
    stem, dot, ext = name.rpartition(".")
    if dot and len(ext) <= 10:
        stem = stem[: max_len - len(ext) - 1]
        name = f"{stem}.{ext}" if stem else f"{default}.{ext}"
    else:
        name = name[:max_len]
    reserved = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
    if name.split(".")[0].lower() in reserved:
        name = f"_{name}"
    return name


def slugify_title(title: str, default: str = "document", max_len: int = 80) -> str:
    """Filename stem derived from a document title."""
    s = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return (s[:max_len].rstrip("-") or default)


def safe_join(root: Path, name: str) -> Path:
    """Join a generated storage name to root, refusing anything that resolves outside root."""
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", name or "") or name.startswith("."):
        raise UnsafePathError("Invalid storage name")
    root = root.resolve()
    p = (root / name).resolve()
    if p.parent != root:
        raise UnsafePathError("Path escapes storage root")
    return p
