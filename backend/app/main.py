from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.routes import router
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
