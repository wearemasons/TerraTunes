# Data Sources

> The challenge Resources tab could not be fetched when this was written. **Action:** open
> https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/?tab=resources
> and paste its links into the "From the Resources tab" table below.

## From the Resources tab
| Resource | URL | Notes |
|---|---|---|
| _TBD_ | | |

## Found via search (verify before relying on them)

| Source | URL | Use |
|---|---|---|
| NASA SVS — Daily Visualizations (EIC) | https://svs.gsfc.nasa.gov/gallery/daily-visualizations | Main source of EIC visualization frames and videos |
| NASA SVS JSON API (e.g. entry 40512) | https://svs.gsfc.nasa.gov/api/40512 | Metadata and media file URLs per SVS entry. Undocumented in search results, inspect the JSON and confirm |
| Hyperwall Power Playlist, Earth Science | https://svs.gsfc.nasa.gov/gallery/hyperwall-power-playlist-earth-science/ | Candidate visualizations |
| NASA GIBS | https://www.earthdata.nasa.gov/gibs | Tile imagery by layer/date (fallback and "live" frames) |
| GIBS API docs | https://nasa-gibs.github.io/gibs-api-docs | WMTS/WMS usage |
| NASA Worldview | https://worldview.earthdata.nasa.gov | Browse layers, find colorbars |
| Earthdata developer portal | https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api | API access |

EIC covers nine areas: sea level change, air quality, biodiversity, wildfires, greenhouse gases, energy, disasters, water resources, agriculture. NASA is migrating Earth science sites into Earthdata through end of 2026, so links may move.

## Curation checklist per visualization
- [ ] SVS ID / URL recorded
- [ ] Downloaded frames or video (smallest resolution that keeps the colorbar legible, ≥ 720p)
- [ ] Colorbar visible; anchors transcribed into `backend/data/colormaps/<id>.json` with units
- [ ] Date range and variable named in plain language
- [ ] Credit line and license copied into `tracks.json`
- [ ] Human-written description and alt text
- [ ] File size within repo budget (see below)

## Target catalogue (fill in)
| # | Theme | Title | SVS / source | Type | Colormap done | Description done |
|---|---|---|---|---|---|---|
| 1 | Sea level | | | video | ☐ | ☐ |
| 2 | Air quality | | | video | ☐ | ☐ |
| 3 | Wildfires | | | video | ☐ | ☐ |
| 4 | Greenhouse gases | | | video | ☐ | ☐ |
| 5 | Water resources | | | video | ☐ | ☐ |
| 6 | Agriculture | | | video | ☐ | ☐ |
| 7 | Biodiversity | | | image | ☐ | ☐ |
| 8 | Energy | | | image | ☐ | ☐ |
| 9 | Disasters | | | video | ☐ | ☐ |

## Storage and licensing
- NASA media is generally public domain, but some SVS items include third-party material. Check each page's credit line; keep it in `tracks.json`.
- Do not commit full-resolution videos. Commit extracted frames at ≤ 1280 px wide, PNG/WebP, ≤ 40 frames per track, ≤ 50 MB total. Keep raw downloads in `backend/data/raw/` (git-ignored) and re-fetch with `scripts/fetch_assets.py`.
- Always show the NASA credit and a link back to the source page in the UI.
- Do not imply NASA endorsement. Use the NASA logo only per its usage guidelines (avoid).
