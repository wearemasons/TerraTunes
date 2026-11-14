# Deploying TerraTunes

How to put TerraTunes online, and which option to choose. Everything here follows how the code runs today. Where an option needs a code change first, the guide says so.

## What has to be deployed

| Part | What it is | Runtime needs |
|---|---|---|
| Web app | `frontend/`, a static single-page app built by `bun run build` into `frontend/dist/` | Any static host. It calls the API at the **relative** path `/api/...`. |
| API | `backend/`, a FastAPI app (`app.main:app`, Python 3.12, uv) | One Python process. Writable disk for the render cache. ~600 MB of data (below). |
| Data | `backend/data/` | `tracks/` (20 MB) is committed. `samples/` (~540 MB, CC0 instrument bank) is generated with `uv run python -m app.cli samples`. `cache/` fills up as soundscapes are rendered. |

Four facts shape every option:

1. **The web app needs the API on the same origin under `/api`.** In development Vite proxies `/api/*` to `:8000` and strips the prefix (`frontend/vite.config.ts`). In production something else must do that rewrite: a reverse proxy, or the static host's rewrite rules.
2. **There is no static-only mode.** Every sound comes from calibrated API data; `dev.mjs` says so, and the static export in `docs/TASKS.md` is still open. A plain static host cannot run TerraTunes on its own.
3. **The Orchestra sound needs the instrument samples.** Without `data/samples/`, Orchestra waits and falls back to Clear tone. Bake the samples into the image or put them on a volume.
4. **Soundscape renders take seconds of CPU the first time**, then they are cached on disk (`data/cache/audio/`). An ephemeral disk is fine because the cache rebuilds itself. A persistent disk just avoids paying for the render again after a restart.

## Recommendation

**For judging and the demo period: a single container on Fly.io or Render.** It contains the built web app, the API and the samples, with a small reverse proxy in front. That gives one URL with no CORS to configure and nothing that sleeps mid-demo (if you keep at least one machine running). It costs a few USD a month and goes up in about an hour.

**For a same-day public link:** run it locally and expose it with a Cloudflare quick tunnel (option 4). This takes about 5 minutes, but it only stays up while the laptop is on.

## Options compared

| # | Option | Setup time | Monthly cost (rough) | Cold start | Good for | Watch out for |
|---|---|---|---|---|---|---|
| 1 | **One container (proxy + API + web) on Fly.io / Render / Railway / a VPS** | ~1 h | ~USD 5–15 | none if always-on | judging, a stable public URL | the image is ~1.2 GB because of the samples |
| 2 | Split: static web on Vercel or Netlify, API container on Fly / Render / Cloud Run | ~1.5 h | ~USD 0–15 | depends on the API host | a fast global CDN for the art and video | needs `/api` rewrites; Cloudflare Pages can't proxy to another origin without a Function |
| 3 | Scale-to-zero container: Google Cloud Run / Azure Container Apps | ~1.5 h | ~USD 0–5 at demo traffic | 5–20 s for a 1.2 GB image | lowest cost | the first visitor after idle waits; set min instances to 1 during judging |
| 4 | Local machine + Cloudflare quick tunnel | ~5 min | free | none | demo day, a live walkthrough | the URL changes on every run; down when the laptop sleeps |
| 5 | Fully static (no API) | days | ~free | none | offline kiosks | not built: needs pre-rendered scores, frames and audio for every track and mode |

## Option 1: one container (recommended)

Layout inside the container:

```
Caddy :8080
  /api/*  → strip "/api" → uvicorn 127.0.0.1:8000 (app.main:app)
  /*      → frontend/dist (SPA: unknown paths fall back to index.html)
```

### Dockerfile (sketch)

```dockerfile
# 1) web build
FROM oven/bun:1 AS web
WORKDIR /web
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# 2) API + samples + proxy
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends caddy && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
RUN uv run python -m app.cli samples          # bakes the CC0 instrument bank into the image
COPY --from=web /web/dist /app/web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
ENV TERRATUNES_DATA_DIR=/app/backend/data
EXPOSE 8080
CMD ["sh", "-c", "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 & caddy run --config /etc/caddy/Caddyfile"]
```

### Caddyfile

```
:8080 {
    encode zstd gzip
    handle_path /api/* {
        reverse_proxy 127.0.0.1:8000
    }
    handle {
        root * /app/web
        try_files {path} /index.html
        file_server
    }
    request_body {
        max_size 12MB            # the scan upload allows up to 10 MB
    }
}
```

### Platform notes

- **Fly.io:** `fly launch` with the Dockerfile and `internal_port = 8080`. Add a health check on `/api/healthz`. Set `min_machines_running = 1` and `auto_stop_machines = false` for judging. Mount a volume at `/app/backend/data/cache` if you want renders to survive deploys. Use 1 shared CPU and 1 GB RAM to start.
- **Render:** a "Web Service" from the Dockerfile, a paid instance (free instances sleep), and a health check path of `/api/healthz`. Optionally add a persistent disk at `/app/backend/data/cache`.
- **A VPS (Hetzner, DigitalOcean, Lightsail):** `docker run -p 80:8080`, and swap `:8080` for your domain in the Caddyfile so Caddy issues HTTPS automatically.

## Option 2: split static web + API

- **Web on Vercel:** set the build command to `bun run build`, the output directory to `dist`, and the root directory to `frontend`. Add `vercel.json`:
  ```json
  { "rewrites": [
      { "source": "/api/:path*", "destination": "https://<your-api-host>/:path*" },
      { "source": "/(.*)", "destination": "/index.html" } ] }
  ```
- **Web on Netlify:** add `frontend/public/_redirects`:
  ```
  /api/*  https://<your-api-host>/:splat  200
  /*      /index.html                     200
  ```
- **API:** the same backend image without the Caddy and web stages. Run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Because the static host proxies `/api`, the browser sees one origin, so CORS needs no change. If you call the API host directly instead, set `TERRATUNES_CORS_ORIGINS='["https://your-site"]'`.

## Option 3: scale to zero (Cloud Run / Azure Container Apps)

Use the option 1 image. The container must listen on `$PORT`: replace `:8080` in the Caddyfile with `:{$PORT}`. Use 1 vCPU and 1–2 GiB. During judging, set minimum instances to 1; otherwise the first visitor waits for the large image to start. The disk is in-memory and ephemeral, so the render cache rebuilds after each cold start. That's acceptable, and the memory limit must allow for it.

## Option 4: local + Cloudflare quick tunnel (demo day)

```bash
node dev.mjs --skip-install                         # API :8000 + web :5173
cloudflared tunnel --url http://localhost:5173      # prints a https://*.trycloudflare.com URL
```

The Vite dev server already allows any host (`allowedHosts: true`) and proxies `/api`, so the tunnel URL works as-is. Keep the laptop plugged in and stop it from sleeping. For a stable URL, use a named tunnel on your own domain.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TERRATUNES_DATA_DIR` | `backend/data` | Where tracks, samples and the cache live |
| `TERRATUNES_CORS_ORIGINS` | localhost dev ports | Only needed if the browser calls the API host directly |
| `TERRATUNES_SVS_*` | see `backend/app/core/config.py` | NASA SVS client (base URL, user agent, rate limit, timeout) used by `app.cli build` |
| `API_TARGET` | `http://127.0.0.1:8000` | Development only: where Vite's `/api` proxy points |

Settings can also go in `backend/.env`, which is gitignored.

## Operating it

- **Health:** `GET /api/healthz` returns `{"status":"ok","tracks":9}`.
- **Refreshing NASA data:** the SVS visualizations update daily. Rebuild with `uv run python -m app.cli build` (~350 MB of downloads, ~10 min), then redeploy. Or run it on the host and restart. Committed tracks mean a deploy never depends on NASA being reachable.
- **Caching:** frames and renders are served with immutable cache headers, so put a CDN in front for free speed.
- **Uploads:** the scan page accepts images up to 10 MB. Keep the proxy body limit above that.
- **Logs:** every response carries `x-request-id`. Errors return `{"error":{"code","message","request_id"}}`.
- **Credits:** NASA imagery and the CC0 VSCO-2 samples must keep their credit lines (`docs/DATA_SOURCES.md`).

## Before you deploy

- [ ] `cd frontend && bun run build` succeeds from a clean clone. The web app must be in `frontend/src` for this; see "Known blocker" below.
- [ ] `cd backend && uv run pytest` passes.
- [ ] `uv run python -m app.cli samples` completed, so Orchestra has its instruments.
- [ ] `/api/healthz` reports 9 tracks on the deployed URL.
- [ ] A fresh browser profile can pick a record, drop the needle, open the Data Deck and scan a bundled frame.
- [ ] The README links to the live URL and the demo film.

## Known blocker (2026-11-14)

In the current working tree, `frontend/src/` shows as deleted and a copy of it sits at `frontend/public/src/`. That change isn't committed. Vite copies `public/` verbatim and doesn't compile it, so the production build breaks, and the source would be published as raw files. Move it back (or restore it from git) before building any of the options above.
