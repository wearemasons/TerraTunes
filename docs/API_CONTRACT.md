# API contract — main-engine-latest

This branch imports main at `d7674b9`. Pydantic models in `backend/app/schemas/models.py` are authoritative; browser types live in `frontend/src/main-engine/lib/api/types.ts`. The frontend calls `/api`, forwarded by Vite to `127.0.0.1:8000`. Backend OpenAPI is at `/docs` and `/openapi.json`.

## Routes

| Route | Result |
|---|---|
| `GET /healthz` | Status, application version and track count |
| `GET /tracks` | Summaries: id/title/theme, summary, dates, frame count, duration, thumbnail/source URLs, credit, calibrated/synthetic flags |
| `GET /tracks/{id}` | Summary plus description, audio key, legend, presets, frame labels, transcript and optional soundscape information |
| `GET /tracks/{id}/score?preset=orchestra|clear|musical` | Main score; API default is `musical`, UI explicitly starts with `orchestra` |
| `GET /tracks/{id}/thumbnail` | WebP sleeve thumbnail |
| `GET /tracks/{id}/frames/{n}` | WebP frame, zero-based index |
| `GET /tracks/{id}/frames/{n}/grid` | cols, rows, cells_b64, real_min, real_max, unit |
| `GET /tracks/{id}/render` | Natural soundscape export; parameters mode=sweep/overview, format=mp3/wav, melody=true/false |
| `GET /samples/manifest.json`, `/samples/{file}` | Prepared VSCO-2 CC0 recordings for browser Orchestra |
| `POST /analyze` | Artistic uploaded-image adapter, described below |

Errors use `{error:{code,message,request_id}}` with appropriate HTTP status. Middleware provides `x-request-id`; scores have ETag/cache headers and `x-mapping-version`.

## Main score

`mapping_version` is `"2"`, main's existing version. Score fields: track_id, preset, key (root/root_midi/scale/bpm), grid (cols/rows), steps_per_frame, frames and optional sound. Each frame has index, label, tension, loudness, brightness, rhythm_density, sixteen column_notes (MIDI; -1 means no data), hotspot (x/y/note/strength) or null, stats (mean/min/max/extreme_share), description and optional soundscape layers.

Main does not require the Manus v17 seed, chord_progression, instruments, per-voice duration/gain/pitch-target fields or gain-envelope arrays. Main's layers preserve phenomenon intensity, column/band intensity, peaks, coverage, alerts and named regions; these are not the Orchestra instrument roster.

## Grids and scientific legends

Cells are decoded uint8, row-major north to south: 0–250 is normalized colourbar position, 255 is no data. Convert positions through legend ticks and the log flag, not hue guessing or naive min/max conversion. Legends include label, unit, min/max, colour anchors and optional ticks/log.

## Playback versus downloads

Browser audio is main's Web Audio player: Orchestra, Clear tone and Musical, with Scan, Overview and Explore. Timing follows main BPM and tension; visuals use player.getPlayhead(), not a fixed four-second clock. The backend render route takes no browser preset and exports a natural soundscape with optional data melody. Links explicitly say “natural soundscape WAV”; they do not claim to capture the active Orchestra sound.

## Artistic upload adapter

POST /analyze takes multipart file, at most 10 MB. It rejects invalid images and oversized dimensions, converts image luminance to a 96 × 48 grid, then delegates to main's unchanged build_score with weather theme and Orchestra preset. Envelope: `{calibrated:false,width,height,score}`. Arbitrary photos have no supplied scientific colourbar and are explicitly labelled artistic, not calibrated. A single frame supplies no measured temporal change. This is UI compatibility glue added to main's API, not a new engine.

## Caches and availability

Main audio caches use mapping version 2, not v17. Run `uv run python -m app.cli samples` once to download/export the regenerable gitignored bank. The source is API-only: missing NASA data is not silently replaced by synthetic demo data. See [ENGINE_COMPARISON.md](ENGINE_COMPARISON.md) for provenance.
