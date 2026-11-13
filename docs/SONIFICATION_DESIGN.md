# Sonification design — main-engine-latest

This branch uses upstream main at d7674b9. The preserved Manus v17 version is on manus-engine-latest; its held-note, three-line engine is not active here. See [ENGINE_COMPARISON.md](ENGINE_COMPARISON.md).

## Scientific pipeline

NASA frames → calibrated colourbar matching → normalized value grids → main's backend build_score → main's browser player. False colour is not physical data without calibration. No-data cells are encoded separately as 255. Legends convert positions to units through their own ticks/log rule. Compression, matching tolerance and spatial reduction limit accuracy.

## Main mappings

| Input | Main behavior |
|---|---|
| Longitude slice values | Column pitch summarizes half the mean plus half the maximum, quantized to the theme scale |
| West–east position | Scan ordering and stereo position |
| Mean / extreme-value share | Frame loudness and brightness |
| Spatial variation | Rhythm density |
| Valid-cell change from prior frame | Tension, including up to 20% tempo push in the browser |
| Strong isolated maximum | Hotspot pitch, position and accent |
| Missing cells | No invented value or data note |

The backend is authoritative for column MIDI notes and frame metrics. Main's browser orchestration derives accompaniment from those notes. Accompaniment is musical structure, not an additional environmental measurement.

## Three sounds

**Orchestra**, the UI default, plays the Clear tone data melody on a graph-specific lead instrument. Whole-octave fitting retains its intervals. Bass, chord pad, movement and optional hotspot instruments are chosen by visualization. Half-frame chords are selected from the data notes with voice-leading. These choices remain main's unchanged algorithm.

The recordings are VSCO-2 Community Edition (CC0, Versilian Studios). Main's sample preparation trims initial silence, checks actual recorded pitch and writes a browser manifest. The player pitch-shifts the nearest recorded note. When a lead recording is not yet decoded it falls back to the Clear tone; unready accompaniment waits. The UI exposes actual required-instrument readiness instead of treating an API URL as proof that samples loaded.

**Clear tone** is the focused data melody without orchestral accompaniment. **Musical** uses main's theme-specific synthetic timbres, rhythm and hotspot accents. The audio key, not a colour-band-to-instrument metaphor, describes their meaning.

## Three modes

**Scan:** sixteen west–east steps per frame. A step lasts 60/BPM/2/(1+0.2×tension). **Overview:** four chord steps per frame, each 60/BPM/(1+0.2×tension). **Explore:** playback pauses; pointer/touch/arrows probe a local calibrated value with pitch and stereo location. Enter or Space reads the value via the screen-reader live region. Spatial scan time is geography, not observation time; observation dates come from frame labels.

The map playhead comes from the actual player clock. The Data Deck offers frame stepping and seeking, numeric/MIDI legend, waveform, change-over-time timeline, transcript, sources and calibration flags. These are complementary views rather than a claim that scanning is universally optimal.

## Natural soundscape exports

Main's separate backend render still creates procedural natural sounds (wind/rain/fire-like/ocean/haze etc.) with intensity, stereo sweep, threshold cues and optional melody. It is downloadable as MP3/WAV. This renderer is not a capture of the browser Orchestra/Clear/Musical preset. All links label the distinction.

## Illustrated presentation

The film, narrator, animated girl, cabinet and painted worlds are retained unchanged. The film's existing v17 sonification excerpt is preserved within its soundtrack as media provenance; the live engine is main. The film has its own clock and soundtrack, not the scientific player. Sample-bank loading waits for the film to hand over.

## Uploaded images

The compatibility endpoint scores image luminance with main's build_score. It is artistic, not calibrated to a NASA colourbar, and is labelled accordingly. Its one frame cannot measure temporal change. Visual-inspection labels do not manufacture physical measurements or change the scorer.

## Validation and limits

Engine source parity, deterministic main backend regressions, upload/transport tests, typechecking and UI checks establish implementation behavior. They do not prove ideal sonification or blind-user comprehension. Listening studies should compare phenomenon identification, peak location, temporal trends and preference between the two branches. Quantization loses resolution; column reduction loses latitude; accompaniment adds perceptual complexity. Clear tone and Explore remain available for focused inspection.
