# TerraTunes 30-second demo — working notes (2026-11-14)

User requirements (latest, supersedes earlier ideas)
- Demo must be **real motion graphics in 16:9 from the real project** — the site must be
  clearly visible. Generated Seedance footage is only an accent, never the substance.
- Voiceover must be **nicer / warmer, no jargon**: no "one note per slice", no "silence for
  missing data". The user liked phrasing like "algorithmic magic".
- Hard cap 30 seconds (Space Apps demo rule). Public link, no password.

How the real capture works
- `frontend/src/lib/promoDirector.ts` — `?promo=1` self-driving mode. It clicks the genuine
  controls (`[data-guide=...]`), so the recording shows the real product: power, crate,
  record A-08 Sea Surface Temperature, needle, Data Deck iris, then the /scan page.
  Suppresses the boot film and the tour offer. Logs to `window.__promo`, sets
  `document.documentElement.dataset.promoDone = "1"` at the end.
- Rig: `Xvfb :99 -screen 0 1920x1080x24`, Chromium kiosk at
  `http://127.0.0.1:5173/?promo=1` with `--autoplay-policy=no-user-gesture-required
  --remote-debugging-port=9222 --user-data-dir=/tmp/promo-profile`.
- Capture: `ffmpeg -f x11grab -video_size 1920x1080 -i :99.0+0,0`.
- Inspect/drive: `node cdp.mjs @probe.js` (Node 22 native WebSocket; `@file` reads the
  expression from a file because shell quoting mangles inline JS).

Assets ready in /home/ubuntu/gen/promo
- `shotA.mp4` 6.04s 1280x720 Seedance heat-field hook (plate from real world-heat art).
- `shotB.mp4` 6s Seedance girl powers the cabinet (plate built from real site art).
- `vo5.wav` 19.24s — FINAL voiceover, en-gb-storyteller-2, 5 short warm lines incl.
  "a little algorithmic magic, and the Earth starts to sing". Segment map in `vo5.json`:
  0.00-7.04 (2 lines), 7.96-9.84, 10.75-15.39, 16.10-19.24. Earlier takes vo.wav/vo2/vo3/vo4
  are too long (33-39s of speech) — do not use.
- Real sonification for the bed: `/home/ubuntu/gen/son_sst.mp3` (84.3s, v17 engine, the one
  the user praised: "not repeating the notes"). Main-engine render also pulled:
  `son_main.mp3` (81.6s) for comparison.
- Real NASA frames for a data timelapse: `frames/f00..f19.png` (1280x640) from
  `/tracks/surface-temperature/frames/{i}`.
- Plates: `plate-heat.jpg`, `plate-stage.jpg` (1600x900, exact 16:9, built from project art).

Services (must be alive for any capture)
- API `:8000` uvicorn (main-engine branch), Vite `:5173`. Both were killed once by memory
  pressure — check `curl 127.0.0.1:8000/healthz` before recording.
- Sandbox has 24 GB; never let PIL scale by a huge factor (an earlier bug made a 250k-px
  image and OOM-killed the box).

Deliverable target
- `/home/ubuntu/gen/promo/terratunes-demo-30s.mp4` 1920x1080, <=30.0s, real UI dominant,
  VO + real sonification + music bed, captions (site uses text elsewhere), end card with
  "TerraTunes — NASA Space Apps SAC'26".
