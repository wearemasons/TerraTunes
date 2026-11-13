# Submission Plan

## Deliverables
1. **Working app**: runnable with two commands, plus a static build that works without the API.
2. **Curated playlist**: pre-rendered MP3/WAV for each track with caption and transcript.
3. **Write-up** (the "why" and the method).
4. **Demo video**, ≤ 3 minutes, captioned, with audio description of the visuals.
5. **Repo**: README, docs, license, credits.

## Judging lens (assumed; confirm on the challenge page)
| Lens | How we address it |
|---|---|
| Accessibility | Full keyboard + screen-reader flow, audio key, transcripts, clear-tone preset |
| Creativity | Per-theme musical identity, scan/explore/time-series modes |
| Data fidelity | Colorbar-calibrated values, documented mapping, tests |
| Musicality | Scales, voice limits, tuned presets, listening review |
| Impact | Makes EIC content usable by blind and low-vision audiences |
| Documentation | This docs set, write-up, audio key per track |

## Demo script (≈ 3 min)
| Time | Beat |
|---|---|
| 0:00 | Problem: Earth data is seen, not heard. EIC visuals exclude blind and low-vision people |
| 0:20 | Open jukebox with eyes closed or screen reader on. Pick "Rising Seas" by keyboard |
| 0:40 | Audio key read aloud; play. Show the sweep and pitch following the frame |
| 1:10 | Switch to Wildfires: different timbre and scale, hot-spot accent |
| 1:40 | Explore mode: move over the map, hear and read local values |
| 2:10 | Time-series: tension rises with change, resolves at the end |
| 2:30 | Under the hood: colorbar → value → scale → score → sound (one diagram) |
| 2:50 | Credits, link, call to action |

Backup plan: if the API or audio fails live, switch on static mode (`VITE_STATIC_MODE=1`) or play the pre-rendered MP3s.

## Write-up outline
1. Why sound (accessibility, pattern perception, emotion).
2. How we translate: value recovery, mapping table, musical rules.
3. Per-theme creative choices and the science reason for each.
4. Accessibility design and testing (with honest scope of who tested).
5. Architecture in one diagram.
6. Limitations (false-color ambiguity, compression artifacts, uncalibrated uploads).
7. What's next (live GIBS, more themes, haptics, user-tunable mappings).
8. Credits and licenses.

## Pre-submission checklist
- [ ] Clean clone builds and runs from README
- [ ] All tracks have credit, description, transcript, audio key
- [ ] Accessibility checklist passed, results saved in `docs/a11y-report.md`
- [ ] No secrets, no raw videos in git, repo size reasonable
- [ ] Video captioned, uploaded, link in README
- [ ] Team names and roles listed
- [ ] Code freeze tagged `v1.0-submission`
