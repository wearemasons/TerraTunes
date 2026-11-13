# Accessibility

## mapping_version 14 - what the spoken equivalents now say

The audio changed from a physical soundscape (rain, wind, thunder, drones, ticks, chimes) to three
instruments in a hall, so every generated string was rewritten to describe what a listener will
actually hear. Sources: `backend/app/mapping/rules.py` (`audio_key_text`, `INSTRUMENT_TEXT`,
`build_transcript`) and `backend/app/sonify/render.py` (`listening_guide`) plus
`backend/app/sonify/spec.py` (`PHENOMENON_INFO`).

* **Which instrument carries which channel.** "Three instruments share the map, each with one job:
  a low plucked string plays the average value of each slice - short notes, low in pitch; the harp
  plays the highest value in each slice, an octave and more above it; a flute holds longer notes that
  trace the change since the previous frame - it rises where values went up and falls where they went
  down." `score.instruments` carries the same facts as data (`family`, `carries`, `entry`,
  `note_range`) for anything that wants to render them as text.
* **What rising and falling mean.** "A rising line means higher values and a falling line means
  lower values. Loudness is kept almost level and carries no information." Pitch, not level, is the
  data; silence always means no data or a voice that has not joined yet.
* **Position.** "The scan steps west to east and one set of notes sounds for each step, at a steady
  march that never speeds up or slows down, so early in a frame is the west edge of the map and late
  in the frame is the east. The sound sits in the middle with only a slight spread that never moves:
  position comes from timing, not from left or right." The old hard left-to-right pan of the melody
  is gone, so no listener needs stereo hearing to follow the map.
* **Space and timbre.** "There is no drone, no drum and no weather sound: when the three lines sound
  together they form the chords. Each note rings on in a hall-like reverb, so a plucked string keeps
  fading after it has been played."
* **Thresholds.** "The harp lifts one octave for the slice where the map first crosses one of the
  named lines in the listening guide" - the marker is a note of an instrument that is already
  playing, not a chime, so it is audible as pitch and readable in the transcript.
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
- [ ] Avoid sudden loud sounds; max step in gain ≤ 6 dB per 100 ms.

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
