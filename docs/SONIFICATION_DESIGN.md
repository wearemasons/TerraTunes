# Sonification Design

## mapping_version 15 — composed harmony, measured contour, and breathing dynamics (current)

The v15 candidate keeps the v14 acoustic instruments and hall, but composes a disclosed,
seeded eight-frame chord phrase around measured contours. The phrase is authored musical
structure, not a measurement of environmental change. The backend's streamed MP3 is the
authoritative reference; the browser WebAudio renderer is an approximate timbre realization
that still uses the scored notes, durations, and gains.

| Channel measured per scan slice | Voice | Instrument family | Register |
| --- | --- | --- | --- |
| mean calibrated value of the slice | `bass` | low plucked string (upright bass / cello pizzicato) | D1-D3 |
| highest calibrated value of the slice | `harp` | harp (three detuned strings, inharmonic, long ring) | D3-D5 |
| signed change of the slice vs the previous frame | `flute` | flute (soft attack, steady sustain, late vibrato, breath) | D4-D6 |

* **Grid and spatial reading.** The static spatial scan is still eight half-second slots per
  frame: `STEPS_PER_FRAME = 8`, `step_s = 4.0 s / 8 = 0.5 s`, one quarter note at 120 BPM.
  The pulse never changes with data; early slots are west and late slots are east. Empty or
  low-activity slots may be rests.
* **Harmony is disclosed composition.** The seed selects a documented eight-frame chord phrase
  for the theme. It is not an environmental-change signal. Every newly attacked note is a tone
  of the current frame chord and remains within that voice's two-octave register.
* **Measured contour.** Bass follows slice mean, harp slice peak, and flute signed change from
  the prior frame. Within each frame, the mapping is continuous and relative: its minimum useful
  spans are 0.15 bass, 0.20 harp, and 0.05 flute. This is not full-range rank expansion; pitch is
  a relative contour, not an exact reading in units. Equal measured values remain equal. Equal
  consecutive notes are tied through valid slots rather than repeatedly attacked.
* **Activity and articulation.** Track-relative activity uses the 10th/90th percentiles with a
  denominator floor of 0.15; a flat-activity range below 0.05 skips that expansion. Activity
  chooses density, longer ringing, and gain, with a gain floor of 0.08. No-data slices schedule
  no new notes; low activity can produce rests, while hall tails may linger.
* **Rendering and dynamics.** v14's acoustic-modelled bass, harp, flute, and Schroeder hall are
  retained. Log control buses are smoothed at 35 dB/s, followed by a 10 dB/s ensemble control
  (45 dB/s combined). This is a bound on control automation, not on a waveform's acoustic pluck
  attack. The master remains fade-in -> hall -> soft-knee limiter -> peak normalise 0.89.
* **Imaging.** Fixed per-instrument offsets, |pan| <= 0.10 (bass centre, harp slightly right, flute
  slightly left); measured L/R correlation 0.98-0.99, L/R energy difference 0.45-0.8 dB. The hall is
  70 % shared between the ears and 30 % per-channel decorrelated, so it feels wide but the image
  never moves.
* **Reverb.** `synth.py:Synth.reverb`: Schroeder topology - four damped feedback combs
  (29.7/37.1/41.1/43.7 ms) in parallel into three all-pass diffusers (5.0/1.7/3.1 ms), RT60 2.2 s,
  26 ms pre-delay, wet 0.30 of the dry RMS, measured to an impulse response per channel and applied
  by FFT convolution. Tuning jitter comes from the render seed, so the hall is identical for the
  same (track, mode).
* **Determinism and fallback.** `MAPPING_VERSION = "15"`; the phrase and score seed are derived
  from the track/theme, while the render seed is derived from track/mode. The browser fallback
  (`frontend/src/lib/audio/phenomena.ts`) is approximate and must consume `FrameScore.voices`
  rather than choose pitches; the backend `/tracks/{id}/render` stream remains authoritative.
* **Candidate measurements and limits.** New candidate EBU LRA measurements are SST 5.3 LU,
  wind 13.4 LU, and vegetation 13.6 LU. These are measurements of candidate renders, not a claim
  of an ideal sonification, and the candidate has not been validated with blind users.


> **Historical v2 (2026-11-13): soundscape engine in the backend.** This earlier experiment layered
> natural sounds over the data. It is retained for provenance only; v15 above is the current model.

Goal: sound that is **traceable to the data** and **musical**. Every audible parameter has one documented meaning that is also written in the track's audio key.

> _Sections 1-10 below describe mapping_version 13 and earlier (the physical soundscape model). They are kept as history; v14's acoustic-instrument revision is also historical, and v15 above is the model in force._

## 1. Pipeline

```
frame (PNG) → downsample to grid (e.g. 96×54) → recover VALUE per cell via colormap
           → smooth → features → mapping rules → score → synth
```

### Recovering values (the honesty step)
EIC frames are false-color renderings. Hue alone is not data. For each curated track:
1. Store `colormaps/<id>.json`: list of `{rgb, value}` anchors read from the on-image colorbar, plus `unit`, `min`, `max`, `label`.
2. For each cell, find nearest colormap position (Lab color distance, interpolate between anchors) → `value ∈ [0,1]` normalized, plus real value.
3. Cells that match no anchor within a tolerance are `background` (land/ocean base map, text) and are silent.

Fallback for uploaded images with no colormap: use luminance as value and hue as secondary timbre control. Mark the track as "artistic mapping, not calibrated".

## 2. Mapping table (default preset)

| Visual / data property | Audio parameter | Rule | Why |
|---|---|---|---|
| Value (low→high) | **Pitch** | Quantize to scale degrees across 3 octaves | Higher = more; universal, most accurate channel |
| Value of the *scanned column* | Melody | Scanline sweeps x left→right over the clip duration; at each step play the cells in that column | Preserves spatial layout |
| Row (y, north→south) | **Stereo pan / register split** | Optional: top rows brighter timbre | Gives spatial cue |
| Column (x) | **Time** (scan mode) / **pan** (static mode) | x → time or left→right | Matches reading order |
| Share of "extreme" cells | **Loudness** and **filter cutoff** | More extreme area → louder, brighter | Magnitude cue |
| Spatial variance / edge density | **Rhythmic density** | 1 / 2 / 4 / 8 events per beat bands | Busy picture = busy rhythm |
| Frame-to-frame change (Δ) | **Tension** | Higher Δ → more dissonant intervals, faster tempo (+0–20 BPM), added minor-2nd/tritone | Urgency of change |
| Hot-spot (max-value region) | **Accent voice** | Bell/pluck at hot-spot pitch, panned to its x | Draws attention to the event |
| Background / no-data | Silence or soft drone | Drone on tonic | Context without clutter |
| Theme (EIC area) | **Instrument palette** | See below | Identity per topic |

## 3. Musical rules (keep it pleasant)
- **Scale per theme**, quantize all pitches to it. Default: D minor pentatonic (calm), D Phrygian for hazards.
- Max **4 simultaneous voices**; one drone, one melody, one rhythm, one accent.
- Tempo fixed per track (60–96 BPM) ± change-driven drift; never random.
- Smooth parameters with attack/release (≥ 50 ms) and exponential ramps to avoid clicks.
- Master limiter, target −16 LUFS, no clipping.
- Same input → same output (seeded randomness only, seed in score).

## 4. Theme palettes (initial)

| EIC theme | Scale | Timbre | Mapping emphasis |
|---|---|---|---|
| Sea level change | Dorian | Warm pad + sine swells | Value → pitch rising slowly; Δ → swell |
| Air quality | Pentatonic minor | Granular/airy noise through filter | Value → filter brightness + pitch |
| Wildfires | Phrygian | Plucks + low rumble | Hot-spots → accents, density → rhythm |
| Greenhouse gases | Whole-tone | Sustained saw pad, slow LFO | Value → pitch and slow beating (dissonance) |
| Water resources | Lydian | Soft bells, water-like arpeggios | Value → arpeggio register |
| Agriculture | Major pentatonic | Marimba / kalimba | Greenness → brightness, density → rhythm |
| Biodiversity | Major pentatonic | Layered chimes, many voices (≤4) | Richness → added voices |
| Energy | Mixolydian | Synth bass + pulse | Intensity → pulse rate |
| Disasters | Phrygian dominant | Brass-like pad + percussion | Δ and extremes → tension |

## 5. Modes

1. **Scan** (default): playhead sweeps the frame; melody follows columns.
2. **Overview**: one chord per frame (mean value → root, spread → chord extension), good for animations.
3. **Explore**: pointer, touch, or arrow keys play the local value ("sonic fingertip"). Space speaks the value in text via live region ("Sea level anomaly +12 cm, northeast Pacific").
4. **Time series**: Overview plus Δ tension across the whole animation, ends with a resolving cadence.

## 6. Score format (summary)
Defined in [API_CONTRACT.md](API_CONTRACT.md). The current score stores the eight-slot frame grid,
authored chord name/pitches, per-voice notes, gains, durations, measured values, pitch targets,
activity, and gain envelope so clients realize rather than re-derive the mapping.

## 7. Audio key (shown and read aloud per track)
Template:
> "Pitch shows {label} in {unit}: low notes are {min}, high notes are {max}. Louder and brighter means a larger area of extreme values. Faster rhythm means a more detailed picture. Tense, clashing notes mean rapid change between frames. The sweep moves west to east."

## 8. Validation
- **Monotonicity test**: increasing value never lowers pitch (unit test on `mapping/pitch.py`).
- **Determinism test**: same frame → identical score hash.
- **Round-trip sanity**: synthetic gradient image must produce a monotonic rising scan.
- **Listening review**: 3 people rate each track for pleasantness and clarity (1–5). Target ≥ 4 avg, otherwise tune preset.
- **Comprehension test**: 3 people (incl. one blind/low-vision if available) answer "where is the hottest region?" from audio only.

## 9. Narrative (for the write-up)
Explain per theme *why* the mapping fits the science: rising sea level = rising pad; fire = percussive, sudden; greenhouse gases = slow, thick, beating harmonics that never resolve. Keep the urgency honest: tension tracks real change, not drama.

## 10. Historical soundscape engine (v2, backend)

Code: `backend/app/sonify/`. Served by `GET /tracks/{id}/render`, exported with `uv run python -m app.cli render`.

### Why
Parameter mapping alone (pitch = value) needs learning before it means anything, and averaging columns lost latitude. Auditory icons (natural sounds) are recognised without training, so they carry **what** is happening; data drives **how much** and **where**; thresholds with real-world meaning replace abstract notes.

### Layers
| Layer | Carries | How |
|---|---|---|
| Phenomenon | What + how much | Procedural natural sound per track, intensity from real values (`sound.intensity` in the catalog) |
| Spatial sweep | Where (west→east) | Each frame 4 s; the sound pans left→right with the scan, following each slice's intensity (weighted to the slice's strongest part, so a small storm is still loud) |
| Bed | Whole map | Quieter, centred, follows the frame's overall intensity |
| Thresholds | Meaningful lines | Rising two-note chime, panned to where the line is first crossed |
| Data melody (optional) | Exact value | Soft plucks, pitch = value (section 2 rules) |
| Frame tick | Time | Soft tick at each frame |

### Sounds per track
| Track | Sound | Data controls | Thresholds |
|---|---|---|---|
| Temperature | Cicadas (heat ≥ 20 °C) / icy wind and creaks (≤ 0 °C) | Chorus and ice intensity | Below freezing; 40 °C |
| Wind | Filtered-noise wind with gusts, howl when strong | Pitch, loudness, gustiness | Beaufort 10 (24.5 m/s), 12 (32.7 m/s) |
| Precipitation | Rain bed + droplets; rumble and thunder when extreme | Drop density, loudness | Heavy rain 7.6 mm |
| Carbon monoxide | Fire crackle and roar | Crackle density, roar | Strong smoke plume > 200 ppb |
| SST | Ocean surf | Timbre: icy/bright → warm/dark | 26.5 °C (fuels tropical cyclones) |
| Vegetation | Birds and insects | Chorus density | none |
| PM2.5, ozone | Haze (labelled metaphor: no natural sound exists) | Roughness and loudness | WHO PM2.5 15 µg/m³, US AQI 55.5; WHO ozone ~51 ppb |
| NOx | Traffic hum (its main source) | Thickness | none |

Rules: calm or dry = near silence (no fake drizzle); no data = silence; deterministic (seeded per track); peak ≤ −1 dBFS with a soft limiter.

### Checked
- Local loudness follows column intensity: r = 0.92 rain, 0.90 CO, 0.96 NOx, 0.44 wind, 0.56 temperature (measured on the rendered audio).
- Stereo image moves left→right within every frame on all tracks.
- Tests: storm in the east is louder on the right; no repeat chime while a line stays crossed; bounded, deterministic output.

### Not yet proven
Listening tests with blind and low-vision people (protocol in ACCESSIBILITY.md): identify the phenomenon, find the strongest place, judge change between frames, old scan vs soundscape.
