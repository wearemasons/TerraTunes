# API Contract (v0)

Base URL (dev): `http://localhost:8000`. JSON, UTF-8. OpenAPI at `/docs` and `/openapi.json`; the frontend generates types from it (`openapi-typescript`). Pydantic models in `backend/app/schemas/` are the source of truth. Change them first, then this file.

## Conventions
- IDs are slugs: `sea-level-2023`.
- Errors: `{ "error": { "code": "string", "message": "string", "request_id": "string" } }` with proper HTTP status.
- All responses include `x-request-id`.
- Scores are deterministic per `(track_id, preset, mapping_version)`; use `ETag`.

## Endpoints

### `GET /healthz` → `{ "status": "ok", "version": "0.1.0" }`

### `GET /tracks`
```json
[{
  "id": "sea-level-2023",
  "title": "Rising Seas",
  "theme": "sea_level",
  "summary": "string",
  "frame_count": 36,
  "duration_s": 60,
  "thumbnail_url": "/media/sea-level-2023/thumb.webp",
  "credit": "NASA/SVS ...",
  "source_url": "https://svs.gsfc.nasa.gov/..."
}]
```

### `GET /tracks/{id}`
Adds: `description` (long text), `audio_key` (text), `legend`, `presets[]`, `frame_labels[]`, `transcript[]` `{frame, text}`.

`legend`:
```json
{
  "label": "Fine particulate matter (PM2.5)",
  "unit": "µg/m³",
  "min": 0.4,
  "max": 409.6,
  "anchors": [{ "position": 0, "rgb": [255, 245, 183] }],
  "ticks": [{ "position": 0, "value": 0.4, "label": null }, { "position": 1, "value": 409.6 }],
  "log": true
}
```
`anchors` are colours sampled from the source colorbar (data colours). `ticks` map colorbar positions to real values; between ticks values are linear, or logarithmic when `log` is true. Without ticks, `min..max` is linear. Clients convert a normalized value `v` (0..1) to a real value with the same rule (`app/mapping/rules.py:to_real`, `frontend/apps/web/src/lib/legend.ts:legendValue`).

Themes: the nine EIC areas plus `weather` and `ocean`.

### `GET /tracks/{id}/frames/{n}` → image (WebP/PNG), cacheable.

### `GET /tracks/{id}/score?preset=default`
```json
{
  "mapping_version": "1",
  "track_id": "sea-level-2023",
  "preset": "default",
  "key": { "root": "D", "scale": "dorian", "bpm": 72 },
  "grid": { "cols": 96, "rows": 54 },
  "frames": [{
    "index": 0,
    "t": 0.0,
    "tension": 0.12,
    "loudness": 0.4,
    "brightness": 0.55,
    "rhythm_density": 2,
    "column_notes": [62, 64, 64, 67],
    "hotspot": { "x": 0.71, "y": 0.33, "note": 74, "strength": 0.8 },
    "stats": { "mean": 0.42, "max": 0.97, "extreme_share": 0.08 },
    "description": "string"
  }],
  "value_grid": { "frame": 0, "cells_b64": "…uint8 rows×cols…" }
}
```
Notes: `column_notes` are MIDI numbers per scan step (length = `cols` after any decimation); `-1` means silent. `value_grid` is 8-bit normalized value for explore mode, per frame is available via the next endpoint.

### `GET /tracks/{id}/frames/{n}/grid` → `{ cols, rows, cells_b64, real_min, real_max, unit }`
Used by explore mode. `cells_b64` is uint8, row-major north→south, 96×48: `0..250` = normalized colorbar position, `255` = no data. Convert to real values with the track legend (see above), not linearly with `real_min/real_max`.

### `GET /tracks/{id}/thumbnail` → WebP image for the jukebox card.

### `POST /analyze` (stretch)
Multipart `file` (PNG/JPEG/WebP ≤ 10 MB), optional `preset`, optional `theme`. Returns a single-frame `score` (as above, one frame) with `calibrated: false`.

### `GET /tracks/{id}/render?preset=default&format=wav|mp3` → audio file
Pre-rendered if present, else rendered and cached. Returns `Content-Disposition` with a sensible filename.

### `GET /tracks/{id}/describe?n=12` → `{ "text": "string" }`
Template description for frame `n`.

## Static export (offline mode)
`scripts/export_static.py` writes to `frontend/apps/web/public/static/`:
```
tracks.json
<id>/track.json  <id>/score.default.json  <id>/frames/NNNN.webp  <id>/audio.mp3
```
The web client falls back to these when the API is unreachable (`VITE_STATIC_MODE=1` forces it).

## Versioning
Bump `mapping_version` whenever mapping rules change so caches and exports invalidate. Breaking contract changes → `/v1` prefix; for the hackathon, coordinate in chat and update this file in the same PR.
