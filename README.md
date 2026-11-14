# TerraTunes — The Earth Information Jukebox

> NASA Space Apps 2026 challenge: *The Earth Information Jukebox*.
> Pick a NASA Earth Information Center (EIC) visualization. Watch it. **Hear it.**

TerraTunes turns EIC visual frames (sea level, air quality, wildfires, greenhouse gases, water, agriculture, biodiversity, energy, disasters) into musical soundscapes in real time. Blind and low-vision users get an equal way in. Sighted users get a second sense for the data.

## Status

This is `main-engine-latest`: upstream main’s Orchestra/Clear tone/Musical engine in the illustrated jukebox, with the complete phenomenon-player controls restyled in the Data Deck. The previous Manus v17 engine and current visuals are preserved separately on `manus-engine-latest`. See [engine comparison and setup](docs/ENGINE_COMPARISON.md).

Working end to end: nine tracks built from live NASA SVS visualizations (temperature, wind, rain, PM2.5, ozone, CO, NOx, sea surface temperature, vegetation), a FastAPI service that serves calibrated scores, and an accessible web jukebox that plays them. Plan and backlog: [docs/PLAN.md](docs/PLAN.md), [docs/TASKS.md](docs/TASKS.md).

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + **TanStack Router** (+ TanStack Query), Vite, Tailwind 4, custom parchment/brass components, bun |
| Audio (browser) | Web Audio API (Tone.js optional) |
| Backend | **FastAPI** (Python 3.12, uv), Pydantic v2, NumPy, Pillow, PyAV (bundled ffmpeg), httpx |
| Offline render | NumPy synth + soundfile → WAV/MP3 |
| Data | NASA SVS (EIC visualizations), NASA GIBS (tiles) |

## Repo layout

```
TerraTunes/
├─ frontend/               # the web app: one flat Vite + React 19 package
│  ├─ src/routes/          # three pages — the jukebox, scan a frame, the method
│  ├─ src/components/      # cabinet, painted world, opening film, data deck
│  ├─ src/lib/             # API client, the two sonification engines, scene table
│  ├─ public/art/          # painted backdrops, discs, character stills (webp)
│  ├─ public/video/        # the opening film and the character loops (webm/vp9 alpha)
│  └─ tools/               # scripts that rebuild those assets from raw sources
├─ backend/                # FastAPI service, SVS ingest, calibration, mapping rules
├─ docs/                   # plan, architecture, design, a11y, data, API, submission
├─ .claude/agents/         # project sub-agents
├─ AGENTS.md / CLAUDE.md   # rules for AI coding agents
├─ dev.mjs                 # one command that runs the whole thing
└─ README.md
```
> The frontend is a single package on this branch. Several planning documents still
> describe the original bun workspace (`apps/web`, `packages/ui`, shadcn); where they
> disagree with the tree above, the tree is the truth.

## Docs

| Doc | Purpose |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Goals, MVP scope, timeline, risks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, split of work between frontend and backend |
| [docs/SONIFICATION_DESIGN.md](docs/SONIFICATION_DESIGN.md) | Image-to-sound mapping rules |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Accessibility requirements and test checklist |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | NASA sources, licensing, curated dataset list |
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | REST contract between web and backend |
| [docs/TASKS.md](docs/TASKS.md) | Backlog by track |
| [docs/FRONTEND_PLAN.md](docs/FRONTEND_PLAN.md) | Frontend build phases, shadcn-only and tweakcn rules |
| [docs/SUBMISSION.md](docs/SUBMISSION.md) | Deliverables, demo script, creative write-up |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment options compared, recommended setup, config and operations |
| [docs/DEMO_FILM.md](docs/DEMO_FILM.md) | The 30-second demo film: story, shot list, and how to rebuild it on the GPU |
| [docs/ENGINE_COMPARISON.md](docs/ENGINE_COMPARISON.md) | The two sonification engine branches and how to switch |

## Quick start

Needs [Node](https://nodejs.org), [bun](https://bun.sh) and [uv](https://docs.astral.sh/uv/).

```bash
cd backend && uv sync && uv run python -m app.cli samples  # one-time CC0 instrument bank
cd ..
node dev.mjs            # starts API (:8000) and web app (:5173)
```

| Command | What it does |
|---|---|
| `node dev.mjs --open` | Same, and opens the browser |
| `node dev.mjs --rebuild` | Re-download the NASA visualizations (they update daily) and rebuild tracks first |
| `node dev.mjs --skip-install` | Start what is already installed, touching nothing else |
| `API_PORT=8010 WEB_PORT=3010 node dev.mjs` | Other ports; CORS and the `/api` proxy follow |

Ctrl+C stops everything. Processed tracks are committed, so the first run needs no NASA downloads.

The live API provides calibrated NASA grids and scores; there is no silent synthetic-demo fallback. Orchestra accompaniment is disclosed music around measured notes, not another measurement. Natural soundscape downloads are a separate renderer, not a capture of the active browser preset.

Running the parts by hand: `cd backend && uv sync && uv run uvicorn app.main:app --port 8000`,
then `cd frontend && bun install && bun run dev`. The app calls `/api` and Vite forwards it
to `http://127.0.0.1:8000`; point `API_TARGET` somewhere else if your API is not there.

## Credits

Imagery: NASA Scientific Visualization Studio / Earth Information Center. NASA media is generally public domain, but check each asset's credit line. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
