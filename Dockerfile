# TerraTunes as one service: the sonification API and the site it serves.
#
# Render hands the container a PORT environment variable and routes to it, so
# the API is started on whatever port it is given. The virtual environment is
# put on PATH because uv sync creates one instead of installing system-wide.

FROM oven/bun:1 AS web
WORKDIR /web
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    TERRATUNES_WEB_DIR=/srv/web \
    TERRATUNES_DATA_DIR=/srv/app/backend/data \
    PATH="/srv/app/backend/.venv/bin:$PATH"
WORKDIR /srv/app/backend
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev --no-install-project
COPY backend/app ./app
COPY backend/data/tracks ./data/tracks
COPY backend/data/samples/web ./data/samples/web
COPY --from=web /web/dist /srv/web

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+(os.environ.get('PORT') or '8000')+'/healthz')"
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\""]
