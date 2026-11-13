# Accessibility

## mapping_version 17 - what the spoken equivalents now say

Sources: `backend/app/mapping/rules.py` (`audio_key_text`, `build_transcript`) and
`backend/app/sonify/render.py` (`listening_guide`); the wording is asserted in
`backend/tests/test_api.py`. The score itself is v16's, so the instrument copy below still holds.

* **The two presentational accents are now disclosed.** The audio key and the listening guide say
  that a quiet low beat marks dense, high-activity regions, and that a short accent arrives about
  120 ms before a strong hotspot's own scan slot so an eastern peak (Australia, on these maps) lands
  as an arrival rather than a rebound off the previous chord's hall tail. Both are named as
  presentation: neither carries a value, a pitch, or a unit.
* **Heat and smoke records.** Where the phenomenon is `fire` or `temperature` the accent is a rising
  contextual icon (`heat_burst`), and the spoken copy says plainly that it is "not a measurement of
  fire".
* **Nothing moves to the side.** Both accents are centred and unpanned, and they appear only in the
  swept, melodic render, so no listener needs stereo hearing to follow the map.
* **The opening film** has four sentences with measured caption timings that match the delivered
  voice: 0.25-3.76, 4.08-7.60, 8.30-12.86, 13.47-16.28 s (`BOOT_CUES` in `frontend/src/lib/boot.ts`).
  The same four sentences ship as text and reach a screen reader; `?replay=1` on the home page shows
  the film again in a tab that already saw it, which is how those timings and the text were checked.

## mapping_version 15 - what the spoken equivalents said then (historical, kept as written; the v17 note above supersedes the accent copy)

The v15 candidate retains v14's three acoustic instruments and hall, but adds a disclosed seeded
eight-frame chord phrase, relative within-frame contours, and activity-driven articulation. The
backend streamed MP3 is authoritative; browser WebAudio is an approximate timbre renderer that
uses scored notes, durations, and gains. Sources: `backend/app/mapping/rules.py`
(`audio_key_text`, `INSTRUMENT_TEXT`, `build_transcript`) and
`backend/app/sonify/render.py` (`listening_guide`).

* **Which instrument carries which channel.** "Three instruments share the map, each with one job:
  a low plucked string follows the average value of each slice; the harp follows the highest value;
  a flute follows signed change since the previous frame." Within each frame, the contour is
  continuous and relative, with minimum spans of 0.15 bass, 0.20 harp, and 0.05 flute. It is not
  full-range rank expansion or an exact value reading. `score.instruments` carries the same facts
  as data (`family`, `carries`, `entry`, `note_range`).
* **What rising and falling mean.** Higher measured slices choose equal or higher tones within the
  current chord. Every new attack is a current chord tone in the voice's two-octave register;
  equal consecutive notes are tied through valid slots, not repeatedly retriggered. Activity also
  controls density, ringing duration, and gain (floor 0.08), so quiet areas may contain rests.
* **Position.** "The scan steps west to east and one set of notes sounds for each step, at a steady
  march that never speeds up or slows down, so early in a frame is the west edge of the map and late
  in the frame is the east. The sound sits in the middle with only a slight spread that never moves:
  position comes from timing, not from left or right." The old hard left-to-right pan of the melody
  is gone, so no listener needs stereo hearing to follow the map.
* **Space and timbre.** "The three measured lines carry the map and nothing else adds information: no
  drone, no weather recording, no beat that stands for a quantity." That spoken line is v15/v16
  wording and is kept here as history: from v17 it is no longer the whole truth. When the lines sound
  together they form the chords, and each note rings on in a hall-like reverb, so a plucked string
  keeps fading after it has been played. v17 adds two presentational layers that are disclosed as
  such: a sparse low beat in dense high-activity regions, and a short accent placed slightly before a
  strong hotspot's own scan slot so an eastern peak arrives rather than rebounding. Heat and
  smoke-indicator records use a rising contextual accent, which is explicitly "not a measurement of
  fire". None of these carry a measurement, and none is panned hard.
* **Thresholds.** Named thresholds are text-only in v15: they remain in the listening guide,
  transcript, and timeline copy. They do not trigger a chime or a harp-octave marker.
* **Dynamics.** Activity is track-relative using the 10th/90th percentiles, a denominator floor
  of 0.15, and a flat-activity cutoff of 0.05. It controls density, ringing duration, and gain;
  the gain floor is 0.08. Renderer log controls are smoothed at 35 dB/s on voice buses plus 10
  dB/s on the ensemble (45 dB/s combined). That is a control-automation bound, not a claim that
  an acoustic-modelled pluck waveform has a 45 dB/s attack.
* **Transcript entries** now say which instrument joined ("Frame 3: the harp joins - it carries the
  highest value found in that slice"), where a hot spot appears ("listen for the harp reaching its
  highest notes partway through each frame"), and that the fastest change is where "the flute moves
  furthest up or down here, while the pulse stays the same".
* The **cabinet** is still entirely user-initiated: nothing in the jukebox makes a sound until Play is
  pressed, and every spoken equivalent stays available with the sound off.
* The **opening film** is the one place sound arrives unasked-for, and it is deliberate: the film is the
  argument for the project, and a silent argument about sound does not land. What protects the listener:
  browsers will not let it start without a gesture, so when that happens the captions carry the whole
  story unlabelled-by-nothing and the first click, tap or key anywhere starts the voice exactly where the
  picture already is; a mute control is on screen during the film, not buried in a menu; the four
  sentences are readable as text in one keystroke; and `prefers-reduced-motion` gets a held frame plus the
  text instead of a film, so there is no motion and no audio at all. Muting it is one press and the page
  underneath is already usable while it plays.


Accessibility is the core theme of the challenge, so it is a milestone (M3), not a polish item. Target: **WCAG 2.2 AA**, plus audio-specific requirements.

## Users
- Blind users (screen reader + keyboard).
- Low-vision users (zoom up to 400%, high contrast).
- Deaf and hard-of-hearing users (visual and text equivalents of the audio; haptics stretch).
- Motor-impaired users (keyboard only, large targets).
- Sighted general public.

## Requirements

### Operation
- [ ] Every function works with the keyboard alone. Visible focus ring (≥ 3:1 contrast).
- [ ] No autoplay from the cabinet: audio starts only after an explicit Play action. The one exception is
      the opening film's narration, which is muted by any browser without a gesture, escapable in one
      press, and replaced by a still frame under reduced motion (see above).
- [ ] Global shortcuts documented on the page and discoverable (`?`): Space play/pause, ←/→ step frame, ↑/↓ volume, `M` mute, `K` read audio key, `D` read description, `E` explore mode. Shortcuts do not clash with screen-reader keys; allow turning them off.
- [ ] Master volume and mute always one key away. Default volume modest, limiter on.
- [ ] Skip link to player; landmarks (`header`, `nav`, `main`); logical heading order.

### Screen readers
- [ ] Each track has: title, theme, date range, a **plain-language description** (what the picture shows), and the **audio key**.
- [ ] Frame canvas has `role="img"` and an `aria-label` updated per frame; also a text summary below it.
- [ ] `aria-live="polite"` region announces frame changes and key events (throttled to ≤ 1 per 2 s; never during an active scan unless asked).
- [ ] Transport controls are native `<button>`s with state (`aria-pressed`, labels like "Pause").
- [ ] Explore mode announces values as text on demand, not constantly.
- [ ] Test with **NVDA + Firefox/Chrome** (Windows) and **VoiceOver + Safari** if available. Record results.

### Visual
- [ ] Contrast ≥ 4.5:1 text, ≥ 3:1 UI. Light/dark and high-contrast themes (`next-themes` already installed).
- [ ] Respect `prefers-reduced-motion` (no auto-animating transitions, frame stepping manual).
- [ ] Reflow at 320 px width and 400% zoom without 2-D scroll.
- [ ] Never rely on color alone; the data legend includes text values.

### Audio
- [ ] Audio key explains every mapping in words before and during playback.
- [ ] Sonification has a **non-musical "clear" preset** (sine tone, pitch only) for users who find music distracting.
- [ ] Provide **transcript** for each track: timeline of events ("0:12 hot-spot appears, over the Amazon, loud and bright").
- [ ] Downloadable audio files so users can listen in their own player.
- [ ] Review loudness for safety. The renderer's log control automation is limited to 35 dB/s on
      voice buses plus 10 dB/s on the ensemble (45 dB/s, or 4.5 dB per 100 ms); this does not
      constrain the waveform attack of an acoustic-modelled pluck.

### Content
- [ ] Descriptions written at ≤ grade 9 reading level, explain units.
- [ ] Descriptions are reviewed by a human before being marked `final` in `tracks.json`.
- [ ] Credit and data caveats are text, not only in images.

## Description generation
1. **Template** (default, deterministic): "{theme}, {date range}. The map shows {variable} in {unit}. {Region of max value} has the highest values ({value}); {region of min} the lowest. Compared with the start, {trend}."
2. **LLM-assisted** (optional): generate once per curated track offline, human edit, store in `tracks.json`. Do not call an LLM at runtime in the demo.

## Test checklist (run before every demo build)
1. Unplug the mouse. Complete: choose a track → play → pause → change track → find the audio key.
2. Turn the monitor off, use NVDA. Can you tell what the track is about and where the strongest values are?
3. Zoom to 400%. Nothing clipped.
4. Run axe-core (browser extension or `@axe-core/playwright`) → 0 serious/critical issues.
5. Lighthouse accessibility ≥ 95.
6. Mute and read the transcript: do you still get the story?

## Feedback
Seek at least one blind or low-vision tester (local event mentors, accessibility groups) and record quotes for the write-up. Do not claim blind-user validation unless it actually happened.
