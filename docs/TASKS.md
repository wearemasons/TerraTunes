# Task Backlog

Legend: P0 must ship · P1 should · P2 stretch. Mark `[x]` when merged.

Frontend work is broken into phases in [FRONTEND_PLAN.md](FRONTEND_PLAN.md); Track C below summarizes it.

## Track A — Data and curation
- [ ] P0 Read Resources tab; fill [DATA_SOURCES.md](DATA_SOURCES.md) (page still unreachable)
- [x] P0 Pick EIC visualizations: 9 tracks across 6 themes (see DATA_SOURCES.md)
- [x] P0 SVS client: crawl gallery, fetch pages, resumable downloads (`app/svs/client.py`, `app.cli discover`)
- [x] P0 Sample frames from movies with PyAV (20 per track)
- [x] P0 Colorbar ticks transcribed into `backend/data/catalog.yaml`; strips extracted automatically
- [x] P0 Descriptions and transcripts generated from data; ozone note written by hand
- [x] P1 Thumbnails (WebP)
- [ ] P1 Human review of every description and transcript before the demo
- [ ] P2 Artistic-mapping mode for visualizations without a colorbar (sea ice, active fires)

## Track B — Backend (FastAPI)
- [x] P0 Scaffold: uv, FastAPI, ruff, mypy (strict), pytest, `/healthz`, CORS, request ids
- [x] P0 Pydantic schemas = [API_CONTRACT.md](API_CONTRACT.md) (+ log/piecewise legends, weather and ocean themes)
- [x] P0 `GET /tracks`, `/tracks/{id}`, `/frames/{n}`, `/frames/{n}/grid`, `/thumbnail`
- [x] P0 Colorbar calibration in CIELAB with masks, chroma check and despeckle (+ tests)
- [x] P0 Mapping rules ported to `app/mapping/rules.py` (monotonic, deterministic, tested)
- [x] P0 `GET /score` with ETag
- [ ] P1 `render/synth.py` offline WAV/MP3 + `/render` (playlist deliverable)
- [ ] P1 Scheduled daily rebuild (SVS pages update daily)
- [ ] P2 `/analyze` upload with luminance fallback

## Track C — Frontend (TanStack)
- [x] P0 Add deps: `@tanstack/react-query`, raw Web Audio (no Tone.js needed). `openapi-typescript` waits for the backend
- [x] P0 Routes: `/`, `/track/$id`, `/about`, `__root` with skip link and live region
- [x] P0 Typed API client + Query hooks + demo fallback (synthetic data when the API is down)
- [x] P0 `AudioEngine`: init on gesture, voices (drone, melody, rhythm, accent), master limiter
- [x] P0 Player: canvas, transport, scrubber, volume, audio key panel
- [x] P0 Scan-mode playback from `column_notes`
- [x] P0 Keyboard shortcuts + help dialog
- [x] P1 Explore mode (pointer + arrow keys, value readout)
- [x] P1 Time-series playback with tension (Overview mode)
- [x] P1 Presets: Musical / Clear tone; Light / Dark / High contrast
- [x] P1 Transcript panel synced to playback
- [x] P1 Mode, preset and frame in the URL (shareable)
- [ ] P0 Swap mock types for generated OpenAPI types once the backend exists
- [ ] P2 Haptics, PWA/offline

## Track D — Accessibility and QA
- [x] P0 axe-core pre-demo script (`bun run test:a11y`)
- [ ] P0 NVDA full-flow test and notes
- [x] P0 Keyboard-only walkthrough (automated in `test:a11y`; repeat by hand before the demo)
- [ ] P1 Listening review (3 people) per track; tune presets
- [ ] P1 Blind/low-vision feedback session

## Track E — Story and submission
- [ ] P0 Project title, one-liner, screenshots
- [ ] P0 Demo video (≤ 3 min) per [SUBMISSION.md](SUBMISSION.md)
- [ ] P0 Write-up: method, "why" per theme, limitations
- [ ] P1 Playlist of pre-rendered audio files with captions
- [ ] P1 Credits and license page

## Track F — Repo and DevOps
- [ ] P0 Root `.gitignore` (data/raw, cache, .venv, node_modules, .env)
- [ ] P0 Initial commit and branch protection convention (PR per track)
- [ ] P1 `Makefile` or `justfile`: `dev`, `test`, `lint`, `export`
- [ ] P1 GitHub Actions: lint + tests + type check
- [ ] P2 Deploy (static export to Cloudflare Pages/GitHub Pages; API on Fly/Render)

## Dependency order
Data (A) → colormap (B) → score (B) → player (C) → a11y pass (D) → submission (E).
Frontend can start in parallel against a **mock score** (`docs/examples/score.mock.json`, create on day 0).
