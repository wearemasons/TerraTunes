# TerraTunes backend

FastAPI service that turns NASA Earth Information Center visualizations into **sonification scores**.
It downloads visualizations from NASA's Scientific Visualization Studio (SVS), recovers real data values from the false-colour frames using each visualization's own colorbar, and serves the scores the web app plays.

## Run

```bash
uv sync
uv run python -m app.cli build          # download + process the tracks in data/catalog.yaml (~350 MB of video, ~10 min)
uv run fastapi dev app/main.py          # http://localhost:8000/docs
```

Then point the frontend at it: `frontend/apps/web/.env.local` → `VITE_API_URL=http://localhost:8000`.

## How data gets in

```
SVS gallery 40467 (EIC) ──discover──► candidates.json   (which visualizations can be sonified)
data/catalog.yaml (human-curated) ──build──►
   /api/<id> page ─► flat 2:1 movie + colorbar image ─► sample N frames (PyAV)
   ─► colorbar strip → 256 colours ─► per-pixel nearest colour in CIELAB ─► value grid 96×48
   ─► data/tracks/<id>/{meta.json, grids.npy, frames/*.webp, thumb.webp}
```

| Command | What it does |
|---|---|
| `uv run python -m app.cli discover` | Crawls the EIC gallery and its dashboards, ranks visualizations: flat world map + colorbar = best |
| `uv run python -m app.cli build [ids…]` | Builds all enabled catalog tracks, or only the ids given |
| `uv run python -m app.cli list` | Lists built tracks |
| `uv run python -m app.cli render [ids…] [--mode sweep\|overview\|both] [--format mp3\|wav] [--no-melody]` | Renders soundscapes to `data/exports/playlist/` with a caption file per track and `playlist.m3u` |

Calibration rules:
- Values come from matching each pixel to the colorbar (ΔE ≤ 14 in CIELAB). Pixels that match nothing (land on ocean maps, labels) become **no data** and play as silence.
- Logos and date stamps are masked per track (`masks` in the catalog).
- Colorbar numbers (ticks, units, log scales) are transcribed by a person from the labelled colorbar into `catalog.yaml`. They are the only hand-entered values.

## Layout

```
app/
  main.py            FastAPI app, CORS, error shape, request ids
  api/routes.py      /healthz, /tracks, /tracks/{id}, /score, /frames/{n}, /frames/{n}/grid, /thumbnail
  mapping/rules.py   image→music rules (single source of truth, MAPPING_VERSION)
  sonify/            soundscape engine: sound specs, per-frame layers, procedural synth, render + cache
  vision/            colorbar extraction, value scales, frame calibration
  ingest/            catalog, video sampling, build pipeline
  svs/client.py      polite SVS client (rate limit, retries, disk cache, resumable downloads)
  store.py           processed tracks on disk
  cli.py             discover / build / list
data/
  catalog.yaml       curated tracks
  tracks/            built tracks (committed snapshot, ~20 MB, so the demo works without downloading)
  raw/               downloads and SVS API cache (git-ignored)
```

## Checks

```bash
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run mypy app
```

## Notes and limits

- SVS pages used here are **updated daily**. A rebuild captures the latest run; frame labels are forecast steps (GEOS-FP) or approximate dates (SST), because frame timestamps are only burned into the pixels.
- Colours that appear twice on a colorbar can be confused; the per-cell median keeps this rare. `valid_share` in each `meta.json` reports how much of the map matched.
- NASA media is generally public domain. Each track keeps its SVS credit and source link; TerraTunes is not endorsed by NASA.
