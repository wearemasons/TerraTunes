# TerraTunes as one service: the sonification API and the site it serves.
FROM oven/bun:1 AS web
WORKDIR /web
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 TERRATUNES_WEB_DIR=/srv/web
WORKDIR /srv/app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN pip install --no-cache-dir uv && uv sync --frozen
COPY backend/app ./app
COPY backend/data/tracks ./data/tracks
COPY --from=web /web/dist /srv/web
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
