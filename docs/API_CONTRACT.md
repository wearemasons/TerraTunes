# API Contract (v0)

## mapping_version 17 changes (current)

The contract is **unchanged**: same endpoints, same fields, same score shape, same
`steps_per_frame`, `instruments[]` and `frames[].voices`. v17 changes the audio a render writes, not
what `/score` returns.

* `mapping_version` is the string `"17"`; the notes, durations, pitch targets, occupied/rest slots,
  chords, rounded swells and peak emphasis are identical to v16. See
  `docs/SONIFICATION_DESIGN.md` for the two presentational accents `backend/app/sonify/render.py`
  adds (`data_beat` and the hotspot accent with `heat_burst`) and why they are placed 120 ms early.
* Only prose fields changed: `audio_key`, `frames[].description`, `sound.listening_guide` and
  `transcript` now disclose the sparse beat and the anticipatory hotspot accent as presentation, not
  measurement, and say that the heat/smoke accent is not a measurement of fire. Field names, types
  and ordering are as in the v16 section below.
* `/render` response shape is unchanged, but cached audio invalidates: the cache key embeds the
  mapping version, so a v16 file is not served for a v17 request. The accents appear only in
  `mode=sweep` with `melody=true`.

## mapping_version 16 changes (historical: the contract v17 keeps)

`GET /tracks/{id}/score` (`TerraScore`) gained, and `docs/SONIFICATION_DESIGN.md` explains why:

* `steps_per_frame` is **8**: the static spatial scan remains eight half-second slots per frame;
  the pulse is one quarter note at `key.bpm` = 120. `frames[].column_notes` and
  `frames[].layers.column_intensity` have that length.
* `instruments: InstrumentInfo[]` - the roster the audio key speaks:
  `{instrument: "bass"|"harp"|"flute", family, carries, entry, note_range, range_low, range_high}`.
* `frames[].voices: VoicePart[]` - one entry per instrument, same order as `instruments`:
  `{instrument, notes, gains, durations, values, pitch_targets}`. Notes are MIDI per scan step
  and **-1 = silence**. New attacks are current-chord tones within the voice's two-octave
  register; equal consecutive notes are tied through valid slots. This is the only place pitches,
  durations, occupancy, and gains are decided (`backend/app/mapping/rules.py`); clients realize
  the score. v16 keeps the v15 notes, durations, pitch targets, occupied/rest slots, and authored
  chord phrase unchanged. `gains` are already multipliers and may be greater than 1; this does
  not change the response shape.
* `frames[].chord_name`, `frames[].chord_pcs`, `frames[].activity`, and `frames[].gain_envelope`
  disclose the seeded eight-frame authored chord phrase and activity articulation. The phrase is
  composition, not a measurement of environmental change. Activity uses track-relative 10th/90th
  percentiles, denominator floor 0.15, flat-activity cutoff 0.05, and gain floor 0.08.
* `frames[].rhythm_density` is a score summary; it does not alter the fixed eight-slot pulse.
* `TrackDetail.duration_s` / `TrackSummary.duration_s` now equal `frame_count x 4.0` s, which is what
  `/render?mode=sweep` actually writes (it used to claim 7.5 s per frame while the audio was 4 s).
* `/render` behaviour is unchanged in shape (`mode`, `format`, `melody`, `v` cache key), but the
  v16 audio is a score-driven realization: v14 acoustic instruments and hall, v15 notes,
  durations, pitch targets, occupancy, and authored chords, plus the v16 activity gain contrast.
  `smooth_gain` uses C1 cubic easing in dB (`3u² - 2u³`) without overshoot; knot differences are
  clamped to `max_db_s * step_s / 1.5`, with 35 dB/s voice plus 10 dB/s ensemble control for a
  45 dB/s combined bound. The overall rendered sample peak remains normalized to 0.89, so the
  stronger peaks are relative contrast rather than a higher output ceiling or guaranteed absolute
  loudness. The backend streamed MP3 is authoritative; browser WebAudio timbre is approximate but
  uses scored notes, durations, and gains. `melody=false` now plays the scored low plucked line
  alone. Endpoint list unchanged: `/healthz`, `/tracks`, `/tracks/{id}`, `/score`, `/frames/{n}`,
  `/frames/{n}/grid`, `/thumbnail`, `/render`.
* The generated accessibility strings (`audio_key`, `frames[].description`, `sound.listening_guide`,
  `transcript`) were rewritten for these instruments; `sound.description` still labels the measured
  phenomenon, now as words rather than as a noise generator.
* `frontend/src/lib/audio/phenomena.ts` is a documented **fallback** engine used only when the
  render stream is unavailable; its timbre is approximate and it must use the score, not re-derive
  pitches. The backend `render.py` stream is the audible reference.


Base URL (dev): `http://localhost:8000`. JSON, UTF-8. OpenAPI is served at `/docs` and
`/openapi.json`; this document is a manual mirror of that contract, not generated TypeScript.
Pydantic models in `backend/app/schemas/` are the source of truth. Change them first, then this
file.

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
  "mapping_version": "17",
  "track_id": "sea-level-2023",
  "preset": "default",
  "key": { "root": "D3", "scale": "dorian", "bpm": 120 },
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

### `GET /tracks/{id}/render?mode=sweep|overview&format=mp3|wav&melody=true` → audio file
The authoritative backend realization of the score, normally streamed as MP3: v14 acoustic
instruments and hall, v15 score structure, v16 activity gain contrast, v17 centred `data_beat` and
anticipatory hotspot accent (sweep mode with `melody=true` only), and text-only threshold
annotations. Gains remain multipliers (including values above 1); the rendered sample peak is
still normalized to 0.89. The accents are presentation and add no measured field to the response.
Rendered on first request, then cached on disk. `Content-Disposition` gives
`terratunes-<id>-<mode>.<fmt>`.

### Historical soundscape fields (mapping_version 2)
- `TrackDetail.sound` / `Score.sound`: `{phenomenon, description, listening_guide, thresholds[{value,label,above}], render_url}`.
- `FrameScore.layers`: `{intensity, column_intensity[16], band_intensity{north,tropics,south}, band_peak_value{…}, coverage, alerts[{label,value,x,y,region,share,new}], regions[{region,where,value,x,y}]}`.
`alerts[].new` was true only on the frame where a threshold was first crossed (with a chime in
that historical model). In v16 and v17 thresholds remain text-only; `regions` are historical fields.

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
