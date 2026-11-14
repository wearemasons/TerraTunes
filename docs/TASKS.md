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
- [x] P1 `render/synth.py` offline WAV/MP3 + `/render` (playlist deliverable; v15 backend stream)
- [ ] P1 Scheduled daily rebuild (SVS pages update daily)
- [ ] P2 `/analyze` upload with luminance fallback

## Track C — Frontend (TanStack)
- [x] P0 Add deps: `@tanstack/react-query`, raw Web Audio (no Tone.js needed). `openapi-typescript` waits for the backend
- [x] P0 Routes: `/`, `/track/$id`, `/about`, `__root` with skip link and live region
- [x] P0 Typed API client + Query hooks + demo fallback (synthetic data when the API is down)
- [x] P0 `AudioEngine`: init on gesture, score-driven notes/durations/gains, approximate WebAudio timbre, master limiter
- [x] P0 Player: canvas, transport, scrubber, volume, audio key panel
- [x] P0 Scan-mode playback from scored eight-slot frames (backend render is authoritative)
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
- [ ] P2 Deploy: options compared in [DEPLOYMENT.md](DEPLOYMENT.md); recommended is one container (Caddy + API + built web) on Fly/Render. A fully static export is still unbuilt.

## Dependency order
Data (A) → colormap (B) → score (B) → player (C) → a11y pass (D) → submission (E).
Frontend can start in parallel against a **mock score** (`docs/examples/score.mock.json`, create on day 0).

- [x] Historical SAC26: re-voice the sonification as three instruments in a hall (mapping_version 14) - quantised bass/harp/flute lines, one note set per 0.5 s scan step, additive entry, static centred imaging, Schroeder hall (RT60 2.2 s, wet 0.30), noise/drone/tick/chime layers removed; contract (`instruments`, `voices`, 8 steps/frame), generated accessibility copy, tests and docs updated. Frontend `phenomena.ts` is now a documented fallback.
- [x] Current v15 candidate: authored seeded eight-frame chord phrase disclosed as composition; every new attack is a current chord tone; relative within-frame contour, activity-driven density/ringing/gain, valid-slot ties, text-only thresholds, and no-data/no-new-note behavior documented. Candidate EBU LRA: SST 5.3 LU, wind 13.4 LU, vegetation 13.6 LU. Backend: 35 tests passed, ruff and mypy green. Frontend verification remains in progress. Candidate is not validated with blind users and is not claimed to be an ideal sonification.
