from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

import os
from pathlib import Path

from app import __version__
from app.api.routes import router
from app.api.uploads import router as uploads_router
from app.core.config import get_settings
from app.core.logging import request_id_middleware, request_id_var, setup_logging

setup_logging()
settings = get_settings()

app = FastAPI(
    title="TerraTunes API",
    version=__version__,
    description="Sonification scores for NASA Earth Information Center visualizations.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["x-request-id", "etag"],
)
app.middleware("http")(request_id_middleware)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "request_id": request_id_var.get()}},
    )


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    code = {404: "not_found", 400: "bad_request", 413: "too_large", 415: "unsupported"}.get(
        exc.status_code, "error"
    )
    return _error(exc.status_code, code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return _error(422, "invalid_request", str(exc.errors()[0]["msg"]) if exc.errors() else "Invalid request")


app.include_router(router)
app.include_router(uploads_router)
# The site asks for /api/*; exposing both spellings keeps one image usable as a
# browser dev proxy target and as a single-origin production host.
app.include_router(router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
# Recorded orchestral notes for the browser's Orchestra sound (`python -m app.cli samples`).
app.mount(
    "/samples", StaticFiles(directory=settings.data_dir / "samples" / "web", check_dir=False), name="samples"
)


class SPAStaticFiles(StaticFiles):
    """Static site with an index.html fallback, so client routes resolve."""

    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or "." in path.rsplit("/", 1)[-1]:
                raise
            return await super().get_response("index.html", scope)
        if getattr(response, "status_code", 200) == 404 and "." not in path.rsplit("/", 1)[-1]:
            return await super().get_response("index.html", scope)
        return response


# Production single origin: `TERRATUNES_WEB_DIR=frontend/dist` makes the API serve
# the built site too, so Railway runs one service with no CORS and no second host.
_web = os.environ.get("TERRATUNES_WEB_DIR", "")
if _web and Path(_web).is_dir():
    app.mount("/", SPAStaticFiles(directory=Path(_web), html=True), name="web")
