# The 30-second demo film

`assets/terratunes-demo-30s.mp4` is the project demo for the Space Apps submission: 1920x1080, exactly 30.000 s, H.264 High + AAC 48 kHz. It's inside the 30-second rule and needs no password. It explains *why* TerraTunes plays NASA's pictures as music, then shows the real product doing it.

## The story

NASA shows the planet as pictures. Millions of people can't see them. So TerraTunes plays them, the notes follow real measurements, and anyone can listen. The listener girl from the site's art carries that arc: she looks up at the paintings, the lights go down, she listens instead, and at the end she sits under the Earth-record moon.

## What is on screen

The current cut follows script v3 (`assets/demo-voiceover-v3.md`) and its take, `assets/demo-voiceover-v3.mp3`, which is already placed on the 30 s timeline. The captions (`assets/demo-subtitles-v3.en.vtt`) and every beat below are timed to the pauses measured in that take with `analyze.mjs`.

| time | voiceover v3 | picture | source |
| --- | --- | --- | --- |
| 0.0–3.7 | Every day, NASA paints the whole planet. | A wall of all nine NASA datasets, each running its own slow timelapse; she looks up at them | real frames from `/tracks/{id}/frames/{n}` |
| 3.7–7.5 | But millions of people will never see those paintings. | The wall blurs, drains and goes dark; she closes her eyes, puts her headphones on, and the first notes reach her | motion graphics over the same frames |
| 7.5–10.2 | So Terra Tunes plays them. | Out of the dark the jukebox powers on and the crate of nine records opens; the music swells | **live site** |
| 10.2–11.0 | Hear where the oceans run hot, | The needle drops and the world turns to ocean | live site |
| 11.0–13.4 | …where storms pour down, | Explainer: the playhead plays the sea-temperature map, then the precipitation map, with notes rising off the strongest readings | real SST and precipitation frames + motion graphics |
| 13.4–14.6 | …and so much more. | All nine records, each with a note badge: "…and so much more: 9 records" | real frames of all nine tracks |
| 14.6–19.4 | Every note comes from a real NASA measurement, | The Data Deck opens on the map, then the transcript | live site |
| 19.4–20.9 | and the Data Deck shows you which one. | The measured grid | live site |
| 20.9–24.9 | Got a NASA picture of your own? Scan it, and it sings too. | The Scan page reads a bundled precipitation frame and plays it | live site (`/scan`) |
| 24.9–30.0 | Terra Tunes, by team Bit and Beat. Now everyone can hear the Earth. | Night hills, the Earth record rising as the moon above a centred title, then "BY TEAM BIT AND BEAT"; she sits listening as notes drift down to her | project art (`world-night`, `discs/earth`, girl stills) |

Live-site shots run at between 0.9× and 1.25× real speed. Over the footage:

- numbered step cards (1 Pick a record, 2 Drop the needle, 3 Open the Data Deck, 4 Scan any frame)
- a pointer that glides to each control the site presses, with a ripple on every click
- camera punch-ins, and short callouts such as "9 records = 9 NASA datasets" and "Which measurement made each note"
- burned-in captions (`assets/demo-subtitles-v2.en.vtt`)

## Sound

- **Voice:** the v2 take, placed so line 1 starts at 0.50 s and levelled from its speech RMS, not its peaks.
- **Music:** a real `/tracks/sea-surface-temperature/render` of the record on screen. It is quiet under the gallery, silent in the dark beat, and swells as the jukebox powers on. It dips by about 8 dB whenever the narrator speaks.
- **Master:** peak-normalised to -1 dBFS, with a 0.25 s tail fade.

## Rebuilding it

Everything lives in `frontend/tools/promo/gpu/` and runs in Microsoft Edge through Playwright, on the GPU:

- **Raster:** the motion graphics are drawn on an accelerated 2D canvas (ANGLE/D3D11).
- **Encode:** WebCodecs hardware H.264 (`prefer-hardware`) and AAC.
- **Container:** `mp4-muxer` writes the MP4.

No ffmpeg is needed.

```bash
# once, somewhere outside the repo
npm i playwright-core@1.56.1 mp4-muxer@5.1.3
# then copy capture.mjs, render.mjs, film.js, film.html and verify.mjs from frontend/tools/promo/gpu/
# into that folder, and fix the paths at the top of render.mjs (RIG, REPO) for your machine

node dev.mjs --skip-install          # API :8000 + web :5173 must be up
node capture.mjs cap 44              # records the self-driving ?promo=1 run (frames + click log)
curl -o sst.wav "http://127.0.0.1:8000/tracks/sea-surface-temperature/render?mode=sweep&format=wav"
node render.mjs stills 2,5,8.6,13   # preview frames
node render.mjs film terratunes-demo-30s.mp4
node verify.mjs terratunes-demo-30s.mp4   # duration, size, audio level and 16 sample frames
```

- `capture.mjs` loads `/?promo=1`. The promo director (`promoDirector.ts`) presses the genuine controls (power, crate, record, needle, Data Deck, tabs, presets, grid, second record, Scan). The script writes CDP screencast frames plus `timeline.json`: frame times, every click with its on-screen position, and the director's own log.
- `film.js` holds the edit:
  - `SEGS` maps each film window to a capture window, a camera path and its callouts.
  - `STEPS` holds the step cards, and `HOST` the girl's poses.
  - `intro`, `explainer` and `endCard` draw the motion graphics.
  - `mixAudio` builds the mix.
- To re-time it for a new voiceover, edit the VTT, the `SEGS`/`STEPS` windows, and `VO_OFF`.

## Honesty notes

- Every interface frame is the running app; nothing is a mock-up. The jukebox girl in the live shots is the site's own character. The cutout poses are the site's own `public/art/girl-*.webp`.
- "Warmer seas sing higher" matches `SONIFICATION_DESIGN.md`: pitch follows the measured value.
- The Scan line doesn't claim measurement, because uploads are scored from image brightness and are not calibrated.
- The explainer's note heights illustrate the mapping. They are drawn from the frame's colours, not taken from the audio engine's output.
