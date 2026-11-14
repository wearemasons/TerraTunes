# The 30-second demo film

`terratunes-demo-30s.mp4` (1920x1080, 30.000 s, H.264 + AAC) is the project demo for
the Space Apps submission. It is inside the 30-second rule, needs no password, and
shows the product rather than a description of it.

## What is on screen

| time | shot | where it comes from |
| --- | --- | --- |
| 0.0–4.4 | the heat field over the planet | one generated cinematic clip (`shotA.mp4`), built from `frontend/public/art/world-heat` |
| 4.4–8.2 | powering the cabinet, crate opening | **screen recording of the live site** |
| 8.2–10.9 | nine records, choosing A-08 | live site |
| 10.9–16.4 | needle drops, the world turns to ocean | live site |
| 16.4–19.5 | the Data Deck iris opens on the map | live site |
| 19.5–24.3 | playhead sweeping the measured grid | live site |
| 24.3–27.0 | scanning a bundled NASA frame | live site (`/scan`) |
| 27.0–30.0 | end card | rendered from the site's own palette and fonts |

Nothing in the interface is a mockup: `capture.mp4` is one continuous 1920x1080
recording of the running app, and the record flight, the iris and the playhead are
the real animations.

## Sound

- Voiceover: one take, recorded with the project's TTS toolchain (`vo5.wav`).
- The music under the needle is **a real render of the record on screen** — the same
  `/tracks/sea-surface-temperature/render` audio the app serves, so the caption
  "the sound you are hearing is that same data" is literally true.
- A studio bed sits underneath; both duck to the voice through a sidechain.
- Mixed to about -16 LUFS with a true peak under -1.5 dBTP, so it survives YouTube.

## Rebuilding it

The site drives itself so the recording is repeatable and hands-free:

```bash
# 1. services up (API :8000, Vite :5173), then a 1920x1080 display
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
DISPLAY=:99 chromium --no-sandbox --kiosk --window-size=1920,1080 \
  --autoplay-policy=no-user-gesture-required --remote-debugging-port=9222 \
  --user-data-dir=/tmp/promo-profile 'http://127.0.0.1:5173/?promo=1' &

# 2. graphics, then one recording, then the edit
python3 frontend/tools/promo/cards.py
frontend/tools/promo/record.sh 38 capture.mp4
frontend/tools/build_demo_film.sh "$PWD/../gen/promo" demo.mp4
```

`?promo=1` (`frontend/src/lib/promoDirector.ts`) presses the genuine controls in
sequence — the power switch, the crate, a record, the needle, the Data Deck, then the
scan page — logging each beat to `window.__promo` and setting
`document.documentElement.dataset.promoDone` when it finishes, so a take either
proves itself or does not get used. The film and the guided tour stay out of the way
in promo mode. `frontend/tools/promo/pointer.mjs` glides the X pointer to each control
just before it is pressed, which is what makes the footage read as someone using the
app rather than a slideshow.

Working notes, timings and the asset list live in `frontend/tools/promo/NOTES.md`.

## Known limits

- Dense panels (the Data Deck's side column) are small at 1080p in a 30-second film;
  the site itself is the place to read them.
- Two seconds of cinematic material at the top is generated. Everything else is the app.
- The pointer schedule is open-loop: if the page loads more than about a second slower
  than the recording rig's timing, the pointer arrives a beat late. Re-take rather than
  re-cut; the log tells you which.
