"""Personal Superpower: FastAPI application."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .api import assistant, attachments, knowledge, results, system, workspaces
from .config import APP_NAME, VERSION, settings
from .db import migrate, session
from .models import Attachment
from .services.jobs import recover_after_restart
from .services.storage import stored_path

FRONTEND_DIST = Path(os.environ.get("PS_FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
log = logging.getLogger("superpower")


def _setup_logging() -> None:
    logs = settings.data_dir / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    if not any(isinstance(h, RotatingFileHandler) for h in root.handlers):
        h = RotatingFileHandler(logs / "app.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        root.addHandler(h)
    root.setLevel(logging.INFO)
    # HTTP client libraries can log request details; keep them quiet so prompts/keys never reach logs.
    for noisy in ("httpx", "httpx2", "anthropic", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _purge_staged(db) -> None:
    """Uploads that were never attached to a workspace are removed after 24 hours."""
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    for a in db.query(Attachment).filter(Attachment.workspace_id.is_(None), Attachment.created_at < cutoff).all():
        try:
            stored_path(a.stored_name).unlink(missing_ok=True)
        except OSError:
            pass
        db.delete(a)
    db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.ensure_dirs()
    _setup_logging()
    migrate()
    db = session()
    try:
        n = recover_after_restart(db)
        _purge_staged(db)
        if n:
            log.info("marked %d interrupted run(s) as failed", n)
    finally:
        db.close()
    log.info("%s %s started (provider=%s)", APP_NAME, VERSION, settings.ai_provider)
    yield


app = FastAPI(title=APP_NAME, version=VERSION, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url="/api/openapi.json")

allowed_hosts = ["127.0.0.1", "localhost", "[::1]", "::1", "testserver"] + [h for h in os.environ.get("PS_ALLOWED_HOSTS", "").split(",") if h]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)  # blocks DNS-rebinding attacks


@app.middleware("http")
async def guard(request: Request, call_next):
    # State-changing API calls must carry a custom header. Browsers cannot send it cross-site without a
    # CORS preflight (which this server never approves), so other websites cannot act on the local API.
    if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-ps-client") != "1":
        return JSONResponse({"detail": {"message": "Request blocked: missing client header.", "code": "csrf"}}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if not request.url.path.startswith("/api/"):
        response.headers.setdefault("Content-Security-Policy",
                                    "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
                                    "connect-src 'self'; font-src 'self' data:; object-src 'self'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'")
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail), "code": "http_error"}
    return JSONResponse({"detail": detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(x) for x in first.get("loc", [])[1:]) or "request"
    return JSONResponse({"detail": {"message": f"Invalid {field}: {first.get('msg', 'invalid value')}.", "code": "validation"}}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("unhandled error: %s", type(exc).__name__)
    return JSONResponse({"detail": {"message": "Unexpected error. Details were written to the application log.", "code": "internal"}}, status_code=500)


for r in (system.router, workspaces.router, attachments.router, results.router, knowledge.router, assistant.router):
    app.include_router(r, prefix="/api")


@app.get("/api/{path:path}", include_in_schema=False)
async def api_not_found(path: str):
    return JSONResponse({"detail": {"message": "Not found.", "code": "not_found"}}, status_code=404)


if FRONTEND_DIST.exists():
    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        candidate = (FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})
else:
    @app.get("/", include_in_schema=False)
    async def no_frontend():
        return JSONResponse({"message": f"{APP_NAME} API is running. The frontend has not been built; run the setup script."})


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, log_level="warning")


if __name__ == "__main__":
    run()
