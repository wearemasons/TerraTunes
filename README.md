# TeraTones — The Earth Information Jukebox

> NASA Space Apps 2026 challenge: *The Earth Information Jukebox*.
> Pick a NASA Earth Information Center (EIC) visualization. Watch it. **Hear it.**

TeraTones turns EIC visual frames (sea level, air quality, wildfires, greenhouse gases, water, agriculture, biodiversity, energy, disasters) into musical soundscapes in real time. Blind and low-vision users get an equal way in. Sighted users get a second sense for the data.

## Status

Working end to end: nine tracks built from live NASA SVS visualizations (temperature, wind, rain, PM2.5, ozone, CO, NOx, sea surface temperature, vegetation), a FastAPI service that serves calibrated scores, and an accessible web jukebox that plays them. Plan and backlog: [docs/PLAN.md](docs/PLAN.md), [docs/TASKS.md](docs/TASKS.md).

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + **TanStack Router** (+ TanStack Query), Vite, Tailwind 4, shadcn/ui (`packages/ui`), bun |
| Audio (browser) | Web Audio API (Tone.js optional) |
| Backend | **FastAPI** (Python 3.12, uv), Pydantic v2, NumPy, Pillow, PyAV (bundled ffmpeg), httpx |
| Offline render | NumPy synth + soundfile → WAV/MP3 |
| Data | NASA SVS (EIC visualizations), NASA GIBS (tiles) |

## Repo layout

```
TeraTones/
├─ frontend/               # frontend monorepo (bun workspaces)
│  ├─ apps/web/            # TanStack Router app
│  └─ packages/ui/         # shared shadcn/ui
├─ backend/                # FastAPI service, SVS ingest, calibration, mapping rules
├─ docs/                   # plan, architecture, design, a11y, data, API, submission
├─ .claude/agents/         # project sub-agents
├─ AGENTS.md / CLAUDE.md   # rules for AI coding agents
└─ README.md
```

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

## Quick start

```bash
# backend (processed tracks are committed, so no download is needed)
cd backend && uv sync && uv run fastapi dev app/main.py   # http://localhost:8000/docs

# frontend, pointed at the backend
cd frontend && bun install
echo VITE_API_URL=http://localhost:8000 > apps/web/.env.local
bun run dev:web                                            # http://localhost:3000
```

Without the backend the web app falls back to synthetic demo tracks. To refresh tracks from NASA (they update daily): `cd backend && uv run python -m app.cli build`.

## Credits

Imagery: NASA Scientific Visualization Studio / Earth Information Center. NASA media is generally public domain, but check each asset's credit line. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
