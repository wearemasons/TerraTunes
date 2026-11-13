# Interactive presentation update

Both comparison branches retain their own engine and share the revised illustrated character and film behavior.

## Both branches

The opening film appears on every home-page visit, including reloads; the previous session-storage seen flag no longer suppresses it. Skip, narrator mute, captions and reduced-motion alternatives remain available. Existing film, narrator, backgrounds and pose-loop assets were not regenerated.

The character is standing while idle. Starting music triggers a complete four-second sit-down; pausing/stopping triggers standing up. The new stand-up clip is the keyed sit-down footage in reverse, because the original plate has no independent stand-up take. Rapid toggles reverse at matched progress. Motion failures have a bounded still fallback, and reduced motion bypasses the one-shot movement. Weather and listening response remain subtle and do not move her ground baseline.

## Main-engine branch Data Deck

The map is the first and dominant content element. Its full aspect ratio, header, legend and downloads remain visible; a former staging size-containment rule no longer collapses it into a strip. The story/instrument header is compact in the right column. Change over time is also in the support column, not below the map. Short windows scroll instead of cropping the image.

Main's current scan slice is highlighted by a moving translucent band, with a fine continuous line driven by the audio playhead. A marker identifies the highest valid grid cell in that slice. The badge/readout shows the calibrated maximum with units and the current scored MIDI note. These are deliberately distinct: main's note summarizes both the slice mean and its maximum, so its pitch is not an exact encoding of that maximum alone.

The same playhead drives the current-frame pitch-contour cursor and the whole-series timeline cursor. Pausing retains the last displayed scan position; seeking resets to the selected frame. No-data cells are excluded from maxima and silent score notes are labelled explicitly.

## Verification

Main backend regressions, player/film/slice-readout tests, typechecks and production builds pass. Browser checks observed standing → decoded sit-down video → sitting → decoded stand-up video → standing, and an uncropped 2:1 map with the timeline outside its column. Both branches retain their own sonification source; these interface checks are not a listening study.
