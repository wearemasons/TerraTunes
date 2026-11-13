# Engine comparison branches

## Preserved Manus engine

`manus-engine-latest` starts from commit `10f849e`, with shared film-replay and animated character sit/stand fixes: the illustrated jukebox, opening film and animated girl, staging's iris Data Deck and UI animations, and the Manus v17 sonification. Its engine uses bass/harp/flute scored lines, held notes, rounded swells and contextual peak accents.

## Main engine in the latest design

`main-engine-latest` starts from the same illustrated version and imports the engine from upstream `main` commit `d7674b9` (Orchestra/Clear tone integration). Main and staging are not modified. The opening film, narrator, character animation, painted backgrounds, existing pose loops and cabinet assets remain byte-for-byte unchanged; two new keyed sit/stand transition clips were added; the film's existing soundtrack remains part of that preserved media rather than being regenerated for this comparison.

The backend mapping, schemas, renderer, synth, samples and sample endpoints come from main. The browser player lives in `frontend/src/main-engine`, with the same scheduler, sound palettes, orchestration and recorded-sample playback. Import-path/API routing changes adapt those modules to the flat frontend; sample readiness notifications and an optional parent shortcut callback improve UI integration without changing musical scheduling. A separate artistic-upload endpoint delegates to main’s unchanged scorer. The old visual-scene adapter is only for scenery/grid metadata, not for music decisions.

### Sounds

- **Orchestra** (default): Clear tone's data notes played by a per-visualization ensemble. The lead, bass, chords, movement and hotspot instrument are identified in the Data Deck. Recorded samples are VSCO-2 Community Edition (CC0, Versilian Studios).
- **Clear tone**: focused pitch reading without orchestral accompaniment.
- **Musical**: main's theme-specific synthetic palette, rhythm and accents.

### Modes and controls

Scan, Overview and Explore use main's player. Main's tension-dependent tempo and actual audio playhead drive the map and frame displays; they are not timed using the v17 fixed four-second clock. The Data Deck retains the brass-and-parchment design and exposes main's transport, stepping, volume/mute, frame slider, waveform, sound choices, orchestra identification, scientific legend, cell Explore/readout, change timeline, pitch contour, information tabs, transcript seeking and original source details. Additional retained inspection widgets are labelled as data displays, not invented instrument mappings.

The cabinet and Data Deck share one player. The opening film uses its independent preserved soundtrack. Recorded-sample loading is deferred until the film hands over to avoid competing with first-start video loading.

### Run

```bash
# Clone either branch explicitly.
git clone --branch main-engine-latest https://github.com/wearemasons/TerraTunes.git
cd TerraTunes
cd backend && uv sync
uv run python -m app.cli samples  # one-time CC0 instrument download/export
cd ..
node dev.mjs
```

The sample bank is regenerable and excluded from Git (`backend/data/samples/`). Without it, main's player can fall back to Clear tone; the Data Deck discloses availability. Scientific imagery and processed grids already in the repository are not synthetic demo replacements.

### Download distinction

Main's `GET /tracks/{id}/render` exports its backend natural soundscape with optional data melody. It does not take the browser's Orchestra/Clear tone/Musical preset, so it is labelled as a **natural soundscape export**, not “the same sound” as current browser playback. Frame images, grids, scores and source links retain their own labels.

### Validation limits

Source parity, typechecking, deterministic backend tests and functional control tests establish implementation behavior. They are not a listening study or proof of ideal sonification. Blind/low-vision comprehension and preference testing remain necessary.
