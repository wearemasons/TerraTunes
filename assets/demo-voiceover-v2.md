# TerraTunes 30 s demo: voiceover v2 (the "why" cut)

The picture is locked. Only the voice and the captions change.

## The story in one line

NASA shows the planet as pictures. Millions of people can't see them. So we play them as music: the notes follow real measurements, and anyone can listen.

## Narration (verbatim, timed to the current cut)

| # | in | out | line | on screen at that moment |
|---|----|-----|------|--------------------------|
| 1 | 0.50 s | 3.90 s | Every day, NASA paints the whole planet. | The wall of nine NASA datasets fades in. She looks up at it. |
| 2 | 4.10 s | 7.90 s | But millions of people will never see those paintings. | The jukebox powers on and the crate of records opens. |
| 3 | 8.10 s | 13.60 s | So Terra Tunes plays them. Warmer seas sing higher: you can hear where the ocean runs hot. | The needle drops, the world turns to ocean ("Shh… the ocean is singing!"), and the Data Deck opens on the sea-temperature map. |
| 4 | 13.80 s | 19.80 s | Every note comes from a real NASA measurement, and the Data Deck shows you which one. | The transcript, the switch from Clear tone to Orchestra, and the measured grid. |
| 5 | 20.00 s | 23.90 s | Got a NASA picture of your own? Scan it, and it sings too. | The Scan page reads a precipitation frame and plays it. |
| 6 | 24.30 s | 28.90 s | Terra Tunes. Now everyone can hear the Earth. | The Earth record rises over the night hills while she listens. |

About 65 words and roughly 22 s of speech, which leaves a quiet second at the end under the title.

## Delivery

- **Line 1:** warm and unhurried.
- **Line 2:** the turn. Drop the energy and slow down a little, but keep it from sounding gloomy.
- **Line 3:** lift on "So Terra Tunes plays them", and let a smile come in on "the ocean runs hot".
- **Line 4:** plain and confident. This is the trust line.
- **Line 5:** playful. It's an invitation.
- **Line 6:** say "Terra Tunes" as two words. Leave a short beat before "Now everyone can hear the Earth" and let it land on the title.

## Why each claim is safe to say

- **"Millions … will never see":** blindness and low vision affect tens of millions of people worldwide. The challenge brief makes blind and low-vision access a core theme.
- **"Warmer seas sing higher":** pitch follows the measured value (docs/SONIFICATION_DESIGN.md). For Sea Surface Temperature, a higher value means warmer water.
- **"Every note comes from a real NASA measurement":** this is true for the nine calibrated records the film shows.
- **"Scan it, and it sings too":** this deliberately does not say "measured". The Scan page reads image brightness, so it is not calibrated (docs/SONIFICATION_DESIGN.md).
- Avoid jargon ("one note per slice", "luminance"), as before.

## To rebuild the film

1. Save the new take placed on the 30 s timeline (48 kHz stereo WAV, line 1 starting at 0.50 s) as `assets/demo-voiceover-placed.wav`.
2. Copy `demo-subtitles-v2.en.vtt` over `demo-subtitles.en.vtt`, and adjust any line whose timing moved.
3. Start the API and run `node render.mjs film out.mp4`. The captions, the ducking of the music under the voice, and the rest of the mix all rebuild from those two files.
+