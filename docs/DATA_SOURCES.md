# Data Sources

> The challenge Resources tab could not be fetched (TLS error). The EIC gallery itself was reachable and is the
> source of every track below. **Still to do:** open
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

## Built catalogue (2026-11-13)

Discovered by crawling the EIC gallery (SVS 40467) and its dashboards (`uv run python -m app.cli discover`): ~55 linked visualizations; 10 have a flat 2:1 world map plus a separate colorbar, the format calibration needs. Curated in `backend/data/catalog.yaml`.

| Track | Theme | SVS | Source movie | Scale | Matched |
|---|---|---|---|---|---|
| Near-Surface Temperature | Weather | [5147](https://svs.gsfc.nasa.gov/5147) | GEOS-FP, hourly, last ~15 days | −40…40 °C linear | 96% |
| Near-Surface Wind Speed | Weather | [5148](https://svs.gsfc.nasa.gov/5148) | GEOS-FP | 0…40 m/s (grey tail excluded) | 73% |
| Precipitation | Water | [5149](https://svs.gsfc.nasa.gov/5149) | GEOS-FP | 0…20 mm; uncoloured = dry | 96% |
| Fine Particulate Matter (PM2.5) | Air quality | [5151](https://svs.gsfc.nasa.gov/5151) | GEOS-CF | 0.4…409.6 µg/m³ log | 96% |
| Near-Surface Ozone | Air quality | [5152](https://svs.gsfc.nasa.gov/5152) | GEOS-CF | 5…60 ppbv; grey areas silent | 55% |
| Carbon Monoxide | Wildfires | [5153](https://svs.gsfc.nasa.gov/5153) | GEOS-CF | 40…500 ppbv piecewise log | 96% |
| Nitrogen Oxides | Air quality | [5154](https://svs.gsfc.nasa.gov/5154) | GEOS-CF | 10⁻³…21 ppbv log | 84% |
| Sea Surface Temperature | Oceans | [5101](https://svs.gsfc.nasa.gov/5101) | MUR SST, ~2.5 years | −5…35 °C | 68% (land silent) |
| Vegetation Greenness (NDVI) | Agriculture | [5544](https://svs.gsfc.nasa.gov/5544) | NRT NDVI | relative 0…100 | 34% (ocean silent) |

Skipped: SST anomaly (5176, 346 MB movie), produced videos (no colorbar), globe/Robinson projections (not 2:1), sea ice and active fires (no colorbar; candidates for an "artistic mapping" mode).

Known limits: GEOS frame times are burned into the pixels, so labels are approximate days; SVS pages update daily, so a rebuild changes the music; colours appearing twice on a bar can be confused (despeckle and per-cell medians keep this rare).

## Storage and licensing
- NASA media is generally public domain, but some SVS items include third-party material. Check each page's credit line; keep it in `tracks.json`.
- Do not commit full-resolution videos. Commit extracted frames at ≤ 1280 px wide, PNG/WebP, ≤ 40 frames per track, ≤ 50 MB total. Keep raw downloads in `backend/data/raw/` (git-ignored) and re-fetch with `scripts/fetch_assets.py`.
- Always show the NASA credit and a link back to the source page in the UI.
- Do not imply NASA endorsement. Use the NASA logo only per its usage guidelines (avoid).
