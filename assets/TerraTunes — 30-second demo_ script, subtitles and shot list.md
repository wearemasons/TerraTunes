# TerraTunes — 30-second demo: script, subtitles and shot list

Film: `terratunes-demo-30s.mp4` · 1920x1080 · 30.000 s · H.264 + AAC · ~-15 LUFS
Voice: `en-gb-storyteller-2` (nature-documentary narrator, Winchester English, resonant and witty), recorded with the project's TTS toolchain as `vo6.wav`, placed from 0.50 s.
Captions are burned into the picture and also supplied as `demo-subtitles.en.srt` / `.vtt` for a platform track.

## Narration (verbatim)

| # | in | out | line |
|---|----|-----|------|
| 1 | 0.50 s | 4.11 s | Every day, NASA paints the whole planet. |
| 2 | 4.21 s | 8.11 s | Terra Tunes plays those paintings as music. |
| 3 | 8.21 s | 14.88 s | Nine records, nine worlds. Drop the needle, and the Earth starts to sing. |
| 4 | 14.98 s | 20.08 s | Every note, every measurement, waiting in the Data Deck. |
| 5 | 20.18 s | 24.07 s | Scan a frame of your own, and it sings too. |
| 6 | 24.17 s | 29.18 s | Terra Tunes. The Earth, on the turntable. |

Delivery: brisk promo pace, warm, a smile in the voice on lines 2 and 6; no breathiness, no "audio-descriptor" flatness. Six sentences, about 24 s of speech, so the last ~2 s before the end card is sound only.

## On-screen labels (motion graphics, not spoken)

| in | out | text |
|----|-----|------|
| 5.05 s | 6.18 s | THE CRATE · 9 RECORDS |
| 10.04 s | 11.60 s | GUIDED TOUR |
| 12.04 s | 13.31 s | DATA DECK |
| 15.68 s | 18.08 s | SOUND PRESETS |
| 21.08 s | 22.49 s | A SECOND RECORD |
| 22.93 s | 26.46 s | SCAN ANY FRAME |

## Shots — all of them except 1 and 13 are the live site

| # | film in | film out | what happens | source |
|---|---------|----------|--------------|--------|
| 1 | 0.00 s | 2.80 s | Heat field over the planet (generated cinematic, built from the project's own art) |
| 2 | 2.60 s | 3.10 s | Power switch pressed, the cabinet lights, crate panel opening |
| 3 | 5.60 s | 2.40 s | Nine records listed, hand moving to A-08 Sea Surface Temperature |
| 4 | 8.00 s | 2.80 s | Crate closes, needle drops, the world turns to ocean |
| 5 | 9.70 s | 2.40 s | Guided tour card appears and speaks beside the cabinet |
| 6 | 11.90 s | 3.00 s | Open Data Deck: the iris reveals the global temperature map |
| 7 | 14.90 s | 2.60 s | Regions and alerts, then the transcript tab |
| 8 | 17.50 s | 2.90 s | Sound presets: Clear tone, then Orchestra; the grid overlay |
| 9 | 20.30 s | 4.20 s | Playhead sweeping the measured grid, pause and resume |
| 10 | 24.60 s | 3.80 s | Crate again, a Wind record chosen — the world repaints to mountains |
| 11 | 28.40 s | 2.80 s | Needle drops on the second record |
| 12 | 31.40 s | 5.80 s | Scan page reads a bundled NASA frame and plays it |
| 13 | 0.00 s | 3.40 s | End card: title, disclosure line, credits, repo |

Numbers in the table are film time, derived from the source take in `shots.txt`.

## How to rebuild or re-time it

- The recording is repeatable: start the API (:8000) and Vite (:5173), open
  `http://127.0.0.1:5173/?promo=1` in a 1920x1080 kiosk Chromium on Xvfb `:99`, then
  `frontend/tools/promo/record.sh 44 capture.mp4`. The site drives itself; `pointer.mjs`
  moves the real cursor; the take logs every beat to `window.__promo` and sets
  `dataset.promoDone`.
- `frontend/tools/promo/cards.py` renders the captions, labels and end card in the site's
  own palette (--ink #3a2a18, --paper #fdf3dd, brass #a9773d) with the project's Fraunces
  and Nunito fonts.
- `frontend/tools/promo/cut_demo.py` cuts everything: shot, caption and label tables drive
  the arithmetic, the capture speed is solved so the film is exactly 30.00 s, and the mix
  ducks the bed and the real render to the voice.
- Audio: the music you hear under the needle is a real `/render` of the record on screen.

## If a local agent re-voices it

- Keep the total speech under 25 s or the end card loses its quiet tail.
- Line 3 is the hook; line 6 is the brand line and should land on the end card (24.2-29.2 s).
- Do not say "one note per slice" or "silence for missing data" — the user asked for plain,
  warm language ("a little algorithmic magic").
- The brand is spoken as two words, "Terra Tunes", matching the cabinet plaque and the site
  header; the repository is `TerraTunes`.
