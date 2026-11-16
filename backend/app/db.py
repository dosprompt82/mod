"""Database engine, session and versioned migrations (SQLite + FTS5)."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


_engine = None
_Session: sessionmaker | None = None


def engine():
    global _engine, _Session
    if _engine is None:
        settings.ensure_dirs()
        _engine = create_engine(f"sqlite:///{settings.db_path}", connect_args={"check_same_thread": False})

        @event.listens_for(_engine, "connect")
        def _fk(dbapi_conn, _):  # referential integrity
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

        _Session = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def reset_engine() -> None:
    """Used by tests and restore: drop the cached engine so a new data dir / DB is picked up."""
    global _engine, _Session
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _Session = None


def session() -> Session:
    engine()
    assert _Session is not None
    return _Session()


def get_db() -> Iterator[Session]:
    db = session()
    try:
        yield db
    finally:
        db.close()


# ---- migrations -------------------------------------------------------------

def _m1(conn) -> None:
    from . import models  # noqa: F401  (register tables)

    Base.metadata.create_all(conn)
    conn.execute(text(
        "CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5("
        "kind UNINDEXED, ref_id UNINDEXED, workspace_id UNINDEXED, provenance UNINDEXED, "
        "title, body, tags, created UNINDEXED, tokenize='porter unicode61')"
    ))


MIGRATIONS = [(1, "initial schema + FTS5 index", _m1)]


def migrate() -> int:
    eng = engine()
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, description TEXT, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)"))
        current = conn.execute(text("SELECT COALESCE(MAX(version), 0) FROM schema_version")).scalar_one()
        for version, desc, fn in MIGRATIONS:
            if version > current:
                fn(conn)
                conn.execute(text("INSERT INTO schema_version(version, description) VALUES (:v, :d)"), {"v": version, "d": desc})
                current = version
    return current
