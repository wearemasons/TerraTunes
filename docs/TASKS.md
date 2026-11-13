# Task Backlog

Legend: P0 must ship · P1 should · P2 stretch. Mark `[x]` when merged.

Frontend work is broken into phases in [FRONTEND_PLAN.md](FRONTEND_PLAN.md); Track C below summarizes it.

## Track A — Data and curation
- [ ] P0 Read Resources tab; fill [DATA_SOURCES.md](DATA_SOURCES.md)
- [ ] P0 Pick 6–9 EIC visualizations, one per theme where possible
- [ ] P0 `scripts/fetch_assets.py`: download by SVS ID, store credit + URL
- [ ] P0 Extract frames with ffmpeg (≤ 40 per track, ≤ 1280 px)
- [ ] P0 Transcribe colorbar anchors → `colormaps/<id>.json`
- [ ] P0 Write descriptions and transcripts (human-reviewed)
- [ ] P1 Thumbnails (WebP) and `tracks.json`

## Track B — Backend (FastAPI)
- [ ] P0 Scaffold: `uv init`, FastAPI, ruff, mypy, pytest, `/healthz`, CORS
- [ ] P0 Pydantic schemas = [API_CONTRACT.md](API_CONTRACT.md)
- [ ] P0 `GET /tracks`, `/tracks/{id}`, `/frames/{n}`
- [ ] P0 `vision/colormap.py`: Lab nearest-anchor → value grid (+ tests)
- [ ] P0 `vision/features.py`: mean, max, extreme share, variance, hot-spot, Δ between frames
- [ ] P0 `mapping/`: scales, pitch quantizer (monotonic test), rhythm bands, tension
- [ ] P0 `GET /score` + disk cache + ETag
- [ ] P1 `render/synth.py` NumPy synth + `/render` + `scripts/prerender.py`
- [ ] P1 `/describe` templates
- [ ] P1 `scripts/export_static.py`
- [ ] P2 `/analyze` upload with luminance fallback
- [ ] P2 Optional LLM description generation (offline script)

## Track C — Frontend (TanStack)
- [ ] P0 Add deps: `@tanstack/react-query`, `tone` (or raw Web Audio), `openapi-typescript`
- [ ] P0 Routes: `/`, `/track/$id`, `/about`, `__root` with skip link and live region
- [ ] P0 Typed API client + Query hooks + static fallback
- [ ] P0 `AudioEngine`: init on gesture, voices (drone, melody, rhythm, accent), master limiter
- [ ] P0 Player: canvas, transport, scrubber, volume, audio key panel
- [ ] P0 Scan-mode playback from `column_notes`
- [ ] P0 Keyboard shortcuts + help dialog
- [ ] P1 Explore mode (pointer + arrow keys, value readout)
- [ ] P1 Time-series playback with tension
- [ ] P1 Presets: Musical / Clear tone; Light / Dark / High contrast
- [ ] P1 Transcript panel synced to playback
- [ ] P2 Haptics, shareable URL state, PWA/offline

## Track D — Accessibility and QA
- [ ] P0 axe-core in CI or pre-demo script
- [ ] P0 NVDA full-flow test and notes
- [ ] P0 Keyboard-only walkthrough
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
