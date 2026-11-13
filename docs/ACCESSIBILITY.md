# Accessibility — main-engine-latest

Target: WCAG 2.2 AA and meaningful nonvisual access. Implementation checks are not a claim of complete conformance or blind-user validation.

## Implemented operation

The cabinet and Data Deck share main's player. Transport, first/previous/next frame, scrubber, volume, mute, modes, presets, transcript and timeline seeks use native labelled controls. Explore owns arrow keys and Enter/Space readout; range sliders retain their arrow behavior. Tabs have selected state, keyboard navigation and labelled panels. The iris modal makes the background inert, traps keyboard focus, closes with Escape and returns focus to its opener. The Data Deck opener is available on small screens as well as desktop.

Main shortcuts: Space play/pause, arrows frame/volume where no widget owns them, Home/End first/last frame, M mute, K read audio key, D read frame description, C cycle sound presets, and 1/2/3 Scan/Overview/Explore. The parent toggle handles Space, so keyboard playback and visible cabinet controls have the same behavior. Typing targets, modifier combinations and widget-owned keys are excluded.

## Text and visual equivalents

Scientific frames have descriptions, numeric/unit legends and calibration flags. Explore exposes an exact legend-converted value or “no data”. Main's polite/assertive announcement channels are connected to live regions outside the inert modal background. All audio-key and transcript material remains readable with sound muted. Instrument names and labels are text, not colour alone. Natural soundscape downloads are labelled separately from active browser presets.

The brass-and-parchment layout reflows into scrolling columns at smaller sizes. Focus states and high-contrast/reduced-motion controls remain available. Formal 400% zoom, contrast measurements and platform screen-reader audits remain verification tasks, not assumed passes.

## Film

The existing illustrated film and independent narrator are preserved. Browser autoplay restrictions may block sound; captions carry its four sentences and a gesture can start the narrator. Mute, skip and text controls remain available. Reduced motion gets a held image rather than moving footage. The background is inert while the film is active. The film's sync-policy regression tests are retained; sample-bank requests wait until its handover.

## Audio

Clear tone provides focused pitch reading without orchestral accompaniment. Orchestra lists the actual graph-specific instrument parts and warns while required recordings are not ready. Main's smoothed-gain graph, limiter and envelopes are preserved; do not carry over v17's measured level claims to this different engine. The rendered natural soundscape has main's own limiter and deterministic checks.

## Remaining human review

Test keyboard-only record selection → playback → mode/preset changes → Explore → transcript → return to cabinet. Use NVDA/Firefox or Chrome and VoiceOver/Safari where available; verify speech does not overwhelm the sonification. Test zoom/reflow, contrast and touch targets. Ask blind/low-vision listeners to identify the phenomenon, strongest location and change over time, comparing both engine branches. Do not report those studies as completed until they happen.
