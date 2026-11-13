# Architecture

## Principles
- API first: the web app only talks to the backend through [API_CONTRACT.md](API_CONTRACT.md).
- The backend produces a **score** (a small JSON). The browser turns the score into sound. The same score can be rendered offline to WAV.
- Typed end to end: Pydantic models on the backend, generated TypeScript types on the frontend (OpenAPI → `openapi-typescript`).
- Graceful degradation: curated tracks work from static files if the API is down.
- No database. Filesystem cache keyed by content hash.

## Components

```
            ┌────────────────────────── Browser (TanStack Router SPA) ─────────────────────────┐
            │  /            Jukebox (track list)                                               │
            │  /track/$id   Player: frame canvas, transport, audio key, description            │
            │  /explore     Pointer/keyboard exploration of a frame                            │
            │  /about       Method and credits                                                 │
            │                                                                                  │
            │  TanStack Query ─► API client (typed)       AudioEngine (Web Audio / Tone.js)    │
            │  Frame canvas ─► pixel sampler ─► live params ─► voices ─► master bus            │
            └───────────────▲───────────────────────────────────────────────▲──────────────────┘
                            │ REST/JSON, audio files                         │ static fallback
            ┌───────────────┴────────────── FastAPI ───────────────────┐    │
            │ /tracks  /tracks/{id}  /tracks/{id}/frames/{n}            │    │
            │ /analyze (upload)  /score  /render  /describe             │    │
            │                                                           │    │
            │ ingest ─► frames ─► vision ─► mapping ─► score ─► render  │────┘ exports/
            │ (ffmpeg)  (Pillow)  (NumPy/OpenCV)  (rules)   (JSON)  (WAV)│
            └───────────────────────────────┬───────────────────────────┘
                                            │
                              backend/data/  (frames, colormaps, cache, exports)
                              NASA SVS / GIBS (download scripts only)
```

## Work split: what runs where

| Concern | Backend (Python) | Frontend (TS) |
|---|---|---|
| Frame extraction from video | ✔ ffmpeg | |
| Colorbar calibration, value recovery | ✔ | |
| Feature extraction (palette, edges, regions) | ✔ | Light version for live pointer sampling |
| Scale/harmony/rhythm rules | ✔ (source of truth, in `mapping/`) | Mirrors via score fields |
| Real-time playback | | ✔ |
| Offline WAV render | ✔ | |
| Text descriptions | ✔ template + optional LLM | Renders in ARIA live region |

Rule: **mapping logic lives in one place** (backend `mapping/`). The frontend consumes score fields (`notes`, `rhythm`, `timbre`) and never re-derives musical decisions, except for the live pointer mode which uses the `value_grid` from the score.

## Backend layout (planned)

```
backend/
├─ pyproject.toml            # uv, ruff, mypy, pytest
├─ app/
│  ├─ main.py                # FastAPI app, CORS, routers
│  ├─ api/                   # routers: tracks, analyze, render, describe
│  ├─ core/                  # settings (pydantic-settings), logging
│  ├─ ingest/                # download.py (SVS/GIBS), frames.py (ffmpeg)
│  ├─ vision/                # colormap.py, grid.py, features.py
│  ├─ mapping/               # scales.py, pitch.py, rhythm.py, timbre.py, score.py
│  ├─ render/                # synth.py (NumPy), export.py (WAV/MP3)
│  ├─ describe/              # templates.py, llm.py (optional)
│  └─ schemas/               # Pydantic models = API contract
├─ data/
│  ├─ tracks.json            # curated catalogue and credits
│  ├─ colormaps/<id>.json    # anchor colors → physical values + units
│  ├─ frames/<id>/NNNN.png
│  └─ cache/ exports/
├─ scripts/                  # fetch_assets.py, prerender.py, export_static.py
└─ tests/
```

## Frontend layout (planned, inside `frontend/apps/web/src`)

```
routes/            # file-based: index, track.$id, explore, about, __root
features/jukebox/  # TrackList, TrackCard
features/player/   # FrameCanvas, Transport, AudioKey, Description
features/audio/    # engine.ts, voices.ts, scheduler.ts, useAudio.ts
lib/api/           # generated client + TanStack Query hooks
lib/a11y/          # announce(), focus helpers, shortcuts
```

## Core data flow (one track)

1. `GET /tracks/{id}` → metadata, `frame_count`, audio key, colormap legend.
2. `GET /tracks/{id}/score` → per-frame score (compact arrays). Cached; static in export.
3. Player draws frame *n* on canvas and schedules voices from `score.frames[n]`.
4. Optional: scanline mode sweeps a playhead across the frame, pitch from `value_grid` column.
5. `announce()` posts a short text update to an `aria-live="polite"` region on frame/event change (throttled).

## Quality bars
- Latency: pressing Play to first sound < 300 ms (AudioContext pre-warmed on first gesture).
- Score payload: < 200 KB per track (quantized arrays, gzip).
- Logging: structured logs with request id; `/healthz`.
- Security: validate upload type and size (≤ 10 MB, PNG/JPEG/WebP), no path traversal, CORS limited to the web origin.
- Config: `.env` via pydantic-settings (backend) and varlock (frontend, already installed).

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-11-13 | Keep TanStack Router + Vite SPA | Already scaffolded; SSR not needed |
| 2026-11-13 | FastAPI backend, score-based contract | Python CV ecosystem; one mapping source of truth |
| 2026-11-13 | No DB | Static catalogue + file cache is enough for 48 h |
