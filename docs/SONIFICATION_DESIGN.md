# Sonification Design

Goal: sound that is **traceable to the data** and **musical**. Every audible parameter has one documented meaning that is also written in the track's audio key.

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
Defined in [API_CONTRACT.md](API_CONTRACT.md). Frame score = `{ t, root, scale, tempo, voices[], accents[], column_values[], summary_stats }`.

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
