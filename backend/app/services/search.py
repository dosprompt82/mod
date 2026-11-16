"""SQLite FTS5 search over document chunks, knowledge items, analyses and drafts."""
from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session


def _iso(dt) -> str:
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt or "")


def index(db: Session, kind: str, ref_id: str, workspace_id: str | None, provenance: str, title: str, body: str, tags: str = "", created=None) -> None:
    db.execute(text("DELETE FROM search_index WHERE kind=:k AND ref_id=:r"), {"k": kind, "r": ref_id})
    db.execute(
        text("INSERT INTO search_index(kind, ref_id, workspace_id, provenance, title, body, tags, created) VALUES (:k,:r,:w,:p,:t,:b,:g,:c)"),
        {"k": kind, "r": ref_id, "w": workspace_id or "", "p": provenance, "t": title or "", "b": body or "", "g": tags or "", "c": _iso(created)},
    )


def remove(db: Session, kind: str, ref_id: str) -> None:
    db.execute(text("DELETE FROM search_index WHERE kind=:k AND ref_id=:r"), {"k": kind, "r": ref_id})


def remove_many(db: Session, kind: str, ref_ids: list[str]) -> None:
    for r in ref_ids:
        remove(db, kind, r)


def remove_workspace(db: Session, workspace_id: str, kinds: tuple[str, ...]) -> None:
    for k in kinds:
        db.execute(text("DELETE FROM search_index WHERE kind=:k AND workspace_id=:w"), {"k": k, "w": workspace_id})


STOPWORDS = set("""a about above after again against all am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its
itself just me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that
the their them then there these they this those through to too under until up very was we were what when where which while who whom why
will with would you your yours tell show give find please need want know last time thing things get got make""".split())


def to_fts_query(q: str, any_terms: bool = False) -> str:
    """Turn free text into a safe FTS5 query: quoted phrases are kept, other terms are quoted
    individually (so punctuation can't break the syntax); the last bare term gets prefix matching.
    any_terms=True drops stopwords and ORs the terms (used for retrieval from natural-language questions)."""
    parts: list[str] = []
    tokens = re.findall(r'"([^"]+)"|(\S+)', q or "")
    for i, (phrase, word) in enumerate(tokens):
        if phrase:
            p = re.sub(r"[^\w\s'-]", " ", phrase).strip()
            if p:
                parts.append(f'"{p}"')
        else:
            w = re.sub(r"[^\w'-]", "", word).replace("'", "")
            if not w or w.upper() in {"AND", "OR", "NOT", "NEAR"}:
                continue
            if any_terms and (w.lower() in STOPWORDS or len(w) < 3):
                continue
            last = i == len(tokens) - 1
            parts.append(f'"{w}"*' if last and len(w) >= 3 and not any_terms else f'"{w}"')
    return (" OR " if any_terms else " ").join(parts)


def search(db: Session, q: str, *, kinds: list[str] | None = None, workspace_id: str | None = None,
           provenance: list[str] | None = None, date_from: str | None = None, date_to: str | None = None,
           tag: str | None = None, doctype: str | None = None, limit: int = 30, exclude_workspace: str | None = None,
           match: str = "all") -> list[dict]:
    """match="all": every term must appear (precise, for typed searches); "any": ranked OR over meaningful terms."""
    where, params = [], {"limit": limit}
    fts = to_fts_query(q, any_terms=match == "any")
    if match == "any" and q.strip() and not fts:
        return []
    if fts:
        where.append("search_index MATCH :q")
        params["q"] = fts
    if kinds:
        where.append("kind IN (" + ",".join(f":k{i}" for i in range(len(kinds))) + ")")
        params.update({f"k{i}": k for i, k in enumerate(kinds)})
    if provenance:
        where.append("provenance IN (" + ",".join(f":p{i}" for i in range(len(provenance))) + ")")
        params.update({f"p{i}": p for i, p in enumerate(provenance)})
    if workspace_id:
        where.append("workspace_id = :w")
        params["w"] = workspace_id
    if exclude_workspace:
        where.append("workspace_id != :xw")
        params["xw"] = exclude_workspace
    if date_from:
        where.append("created >= :df")
        params["df"] = date_from
    if date_to:
        where.append("created <= :dt")
        params["dt"] = date_to + "T23:59:59" if len(date_to) == 10 else date_to
    if tag:
        where.append("tags LIKE :tag")
        params["tag"] = f"%{tag}%"
    if doctype:
        where.append("tags LIKE :dtp")
        params["dtp"] = f"%doctype:{doctype}%"
    sql = ("SELECT kind, ref_id, workspace_id, provenance, title, created, "
           + ("snippet(search_index, 5, '[[', ']]', ' … ', 28) AS snip, bm25(search_index, 0, 0, 0, 0, 4.0, 1.0, 2.0, 0) AS score " if fts
              else "substr(body, 1, 220) AS snip, 0 AS score ")
           + "FROM search_index" + (" WHERE " + " AND ".join(where) if where else "")
           + (" ORDER BY score" if fts else " ORDER BY created DESC") + " LIMIT :limit")
    try:
        rows = db.execute(text(sql), params).mappings().all()
    except Exception:  # noqa: BLE001 - malformed query: fall back to no results rather than a 500
        return []
    return [dict(r) for r in rows]
