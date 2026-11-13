# Accessibility

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
- [ ] No autoplay. Audio starts only after an explicit Play action.
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
