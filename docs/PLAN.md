# Project Plan — TerraTunes

## 1. Challenge summary

Build an "Earth Jukebox": pair NASA EIC visual frames with sonifications generated from those frames. Deliverable can be an interactive app, API, or curated audio set with an explanation. Accessibility (blind and low-vision users) is a core theme. Balance data fidelity with musicality. Document the "why".

Source brief: pasted challenge text. The challenge page and its Resources tab could not be fetched (TLS error), so **verify the Resources tab manually** and update [DATA_SOURCES.md](DATA_SOURCES.md).

## 2. Product vision

One sentence: *a jukebox where every EIC visualization has a track, and the track is derived from the pixels.*

Three promises:
1. **Accessible first.** Fully usable without sight (keyboard + screen reader + audio key + text descriptions).
2. **Honest mapping.** Sound encodes real values (recovered from the colorbar), not just "vibes". The audio key explains the rules.
3. **Musical.** Scales, harmony and rhythm rules keep output pleasant, not noise.

## 3. Scope

### MVP (must ship)
- 6–9 curated EIC visualizations (one per EIC theme where possible).
- Jukebox UI: pick a track, play/pause, scrub, see frame and hear it.
- Real-time sonification in the browser from the current frame.
- Backend that ingests a frame or video, extracts features, and returns a sonification "score" and a text description.
- Audio key (legend) per track: what pitch, loudness and rhythm mean.
- Keyboard and screen-reader operation. WCAG 2.2 AA target.
- Pre-rendered WAV/MP3 per curated track as fallback and as the "playlist" deliverable.

### Stretch
- Upload your own image or frame and sonify it.
- Spatial mode: explore the image with pointer/touch/arrow keys and hear the local value (sonic "fingertip").
- Time-series mode: play a whole animation as a piece, with change between frames driving tension.
- Haptics via Vibration API on mobile.
- LLM-generated descriptions (pre-generated and cached for curated tracks).
- Shareable links with state.

### Out of scope
- User accounts, database, payments.
- Raw scientific data pipelines (NetCDF/HDF). We work from the **visual frames**, as the challenge asks.
- Accuracy claims beyond what the colorbar supports.

## 4. Timeline

Event: **Nov 14–15, 2026** (per web search, verify). Today is Nov 13, so the plan is: prep today, build over a 48 h window.

| Block | Output |
|---|---|
| **T-1 (today)** | Repo + docs, backend scaffold, pick 6–9 visualizations, download frames, confirm licenses, read Resources tab |
| **H0–6** | Walking skeleton: web fetches `/tracks`, shows a frame, plays a hard-coded tone. FastAPI `/analyze` returns features for one frame |
| **H6–16** | Mapping v1: colorbar → value → scale degree; scanline playback; audio key; backend renderer |
| **H16–26** | UI/UX: jukebox, scrubber, keyboard map, ARIA live descriptions; second and third themes |
| **H26–36** | Time-series mode, pre-render all tracks, accessibility pass with screen reader (NVDA) |
| **H36–44** | Polish sound design (reverb, spatial pan, dynamics), responsive layout, error states |
| **H44–48** | Demo video, write-up, README screenshots, submission, freeze at H46 |

## 5. Milestones and exit criteria

| # | Milestone | Done when |
|---|---|---|
| M0 | Skeleton | Web loads, calls API, plays a tone |
| M1 | One track end to end | Frame → features → score → sound, with audio key |
| M2 | Jukebox | ≥6 tracks selectable, keyboard-only playable |
| M3 | Accessibility | Checklist in [ACCESSIBILITY.md](ACCESSIBILITY.md) passes, NVDA run recorded |
| M4 | Time series | One full animation plays as a piece |
| M5 | Submission | Demo video, write-up, deployed or runnable via 2 commands |

## 6. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Resources page unreachable or data endpoints change | Blocked ingest | Download curated frames and videos to `backend/data/` today and commit small samples |
| Colormaps differ per visualization | Wrong values | Per-track `colormap.json` (anchor colors → values), manual calibration for curated set |
| Video compression artifacts | Noisy audio | Downsample to ~64×36 grid, median filter, temporal smoothing |
| Output sounds like noise | Judges bounce | Quantize to scale, limit polyphony (≤4 voices), consistent tempo, tested presets |
| Browser autoplay and audio latency | Demo fails | Explicit Play button, resume AudioContext on gesture, pre-rendered fallback files |
| Accessibility treated as an afterthought | Misses core theme | A11y is a milestone (M3) with named tests; a11y reviewer agent on every UI PR |
| Backend offline during demo | Demo fails | Static export of curated tracks (JSON score + audio) so the web app works without the API |
| Licensing of media | Disqualification risk | Track credit lines in `data/tracks.json`; use NASA public-domain media only |

## 7. Team and tracks

Assign owners on day 0. Suggested split for 3–5 people:

| Track | Owner | Primary docs |
|---|---|---|
| Sonification and audio | TBD | [SONIFICATION_DESIGN.md](SONIFICATION_DESIGN.md) |
| Backend / CV | TBD | [ARCHITECTURE.md](ARCHITECTURE.md), [API_CONTRACT.md](API_CONTRACT.md) |
| Frontend / a11y | TBD | [ACCESSIBILITY.md](ACCESSIBILITY.md) |
| Story, demo, data curation | TBD | [SUBMISSION.md](SUBMISSION.md), [DATA_SOURCES.md](DATA_SOURCES.md) |

## 8. Definition of done (per track)

- Works from a clean clone with the documented commands.
- Has a keyboard path and a text equivalent.
- Mapping rules are written in the audio key and in SONIFICATION_DESIGN.md.
- Types pass (`tsc`, `mypy`/`pyright`), lint clean, one test for the core function.

## 9. Open decisions

1. Frontend runtime: stay on **TanStack Router + Vite SPA** (already scaffolded) vs migrate to TanStack Start for SSR. Default: stay; SSR adds no value for a demo.
2. Browser synth: raw Web Audio vs Tone.js. Default: Tone.js for scheduling and effects, unless bundle size or latency hurts.
3. Python renderer: NumPy synth vs Pedalboard/FluidSynth. Default: NumPy for zero system deps.
4. Hosting: local-run plus static export vs Fly/Render. Default: static export first.
