# Submission Plan

## Deliverables
1. **Working app**: `node dev.mjs` and it is running — API on :8000, the jukebox on :5173.
   Every sound on the site is a measurement, so the API is not optional; the offline fallback is the
   pre-rendered playlist, not a static build.
2. **Curated playlist**: pre-rendered MP3/WAV for each track with caption and transcript.
3. **Write-up** (the "why" and the method).
4. **Demo video**, ≤ 3 minutes, captioned, with audio description of the visuals.
5. **Repo**: README, docs, license, credits.

## The opening film (0:00 – 0:18 of the app itself)
The app now explains itself before anyone has to understand it: an animated cut scene, 16.8 s of
picture over an 18.0 s soundtrack, four sentences, played once per session on the home page.

| | |
|---|---|
| What it says | "Every day, NASA paints our planet's weather. But if you can't see it, that story stays silent. TerraTunes measures every pixel — and scores it as sound. Don't just watch the Earth change. Listen." |
| Why it is there | The pitch is the hardest part of this project to convey in a page of text. Seventeen seconds of picture, with the voice running to 18.0 s, do it, and the same four sentences are the film's text equivalent for a screen reader. |
| How it is built | One generated 1280x720 cut scene plus a separate narration/music track, so the picture can stop on its last good frame while the last sentence is still being said. The picture is delivered 1.12x longer than it was filmed and the narration is slowed (atempo 0.92) and starts 0.25 s in, because the read felt too fast at the old timing. Picture and voice are held together by a tested state machine in `src/lib/filmSync.ts`. `frontend/tools/build_boot_film.sh` rebuilds the film from raw inputs that are deliberately not in git. |
| The hand-off | At 14.45 s the film freezes on a frame drawn to match the home page, and `src/lib/matchCut.ts` transforms the live cabinet and the girl onto that framing — the same object-cover crop the film used — so the dissolve lands on one picture instead of two. The fade then starts at 16.4 s and lasts 1.4 s, which is after the last word, so no sentence is cut off. When the film is gone the page eases back to its own layout. |
| Inside the film | At 10.4 s you hear a real TerraTunes render of NASA sea surface temperature, produced by the mapping_version 17 backend at `/tracks/sea-surface-temperature/render`, coming out of the painted cabinet. |
| Accessibility | Sound is on by default and the browser gates it: if no gesture has happened the captions carry the story and one click starts the voice at the picture's current time. Mute is one press, the sentences are readable as text, and reduced motion gets a held frame with no film and no audio. `?replay=1` on the home page shows the film again in a tab that already saw it, which is how the captions were checked against the delivered voice. |

## Judging lens (assumed; confirm on the challenge page)
| Lens | How we address it |
|---|---|
| Accessibility | Full keyboard + screen-reader flow, audio key, transcripts, clear-tone preset |
| Creativity | Per-theme musical identity, scan/explore/time-series modes |
| Data fidelity | Colorbar-calibrated values, documented mapping, tests |
| Musicality | Three instrument voices in a hall, quantised to the theme scale, steady pulse, listening review |
| Impact | Makes EIC content usable by blind and low-vision audiences |
| Documentation | This docs set, write-up, audio key per track |

## Demo script (≈ 3 min)
| Time | Beat |
|---|---|
| 0:00 | Let the opening film run: it states the problem in four sentences, in pictures and in a measured voice |
| 0:20 | The film hands over to the lit cabinet. Open jukebox with eyes closed or screen reader on. Pick "Rising Seas" by keyboard |
| 0:40 | Audio key read aloud; play. The bass line follows the average of each slice, the harp its peak, the flute its change |
| 1:10 | Switch to Wildfires: different scale and register, same three voices, harp lifting an octave where a named line is crossed |
| 1:40 | Explore mode: move over the map, hear and read local values |
| 2:10 | Data Deck: the calibrated colourbar grid under the notes, and the transcript of what is about to happen |
| 2:30 | Under the hood: colourbar → nearest colour in CIELAB → 96x48 value grid → three quantised voices → hall (one diagram) |
| 2:50 | Credits, link, call to action |

Backup plan: if the API or the network fails live, play `backend/data/exports/playlist` — the same
audio the app streams, rendered offline by `uv run python -m app.cli render`, with a caption file and
an `.m3u` beside it — and show the opening film, which needs nothing but the static build.

## Write-up outline
1. Why sound (accessibility, pattern perception, emotion).
2. How we translate: colourbar calibration, the three measured channels, the voice ladders, the hall.
3. Per-theme creative choices and the science reason for each.
4. Accessibility design and testing (with honest scope of who tested).
5. Architecture in one diagram.
6. Limitations (false-color ambiguity, compression artifacts, uncalibrated uploads).
7. What's next (live GIBS, more themes, haptics, user-tunable mappings).
8. Credits and licenses.

## Pre-submission checklist
- [ ] Clean clone builds and runs from README
- [ ] Opening film runs on a fresh profile with sound, and its text equivalent is reachable
- [ ] All tracks have credit, description, transcript, audio key
- [ ] Accessibility checklist passed, results saved in `docs/a11y-report.md`
- [ ] No secrets, no raw videos in git, repo size reasonable
- [ ] Video captioned, uploaded, link in README
- [ ] Team names and roles listed
- [ ] Code freeze tagged `v1.0-submission`
