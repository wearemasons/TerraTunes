# Data Sources

> Resources tab extracted from https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/?tab=resources
> (2026-11-13). The EIC gallery is the source of every track in the catalogue below.

## From the Resources tab
| # | Resource | URL | Notes |
|---|---|---|---|
| 1 | Earth Information Center (EIC) Content Database | https://svs.gsfc.nasa.gov/gallery/earth-information-center/ | SVS visuals used in EIC dashboards (videos and images) |
| 2 | Data Sonification: Caldwell 73 | https://svs.gsfc.nasa.gov/13786/ | NASA reference example: luminosity/spatial coordinates → volume and pitch |
| 3 | Change in Night Lights between 2012 and 2023 - EIC Version | https://svs.gsfc.nasa.gov/5313/ | Urban illumination evolution; high-contrast intensity → tempo/volume |
| 4 | Global Sea Surface Currents and Temperature | https://svs.gsfc.nasa.gov/3912/#media_group_349716 | Fluid ocean currents + thermal gradients → evolving soundscapes |
| 5 | GEOS Aerosols | https://svs.gsfc.nasa.gov/5669/ | Smoke, dust, and atmospheric particles by type → multi-track textures/instruments |
| 6 | Air Quality Model Runs | https://svs.gsfc.nasa.gov/5533/ | High-res atmospheric data frames → color palettes & pixel density to sound |
| 7 | Perpetual Ocean 2: Western Boundary Currents | https://svs.gsfc.nasa.gov/5425/ | High-contrast major ocean currents → rhythms and scales |
| 8 | DYAMOND Global Carbon Dioxide | https://svs.gsfc.nasa.gov/5196/ | Global CO2 concentrations over time → primary interactive synthesis input |
| 9 | Lightning Events Detected from the ISS 2017-2023 | https://svs.gsfc.nasa.gov/5011/ | Layered lightning flashes → punctuated/percussive sonification |
| 10 | A 3D View of an Atmospheric River from an Earth System Model | https://svs.gsfc.nasa.gov/4960/ | 3D atmospheric river moisture path → immersive shifting landscapes |
| 11 | GEDI Forest Height | https://svs.gsfc.nasa.gov/4950/ | Global canopy elevation color spectrums → rhythm, frequency, pitch |

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

## Illustration, animation and generated assets

Everything in `frontend/public/art` and `frontend/public/video` is original work made for this
project. None of it is stock, and no asset in the app was lifted from another site.

| Asset group | Where | Provenance |
|---|---|---|
| Jukebox cabinet, disc labels, the girl, meadow props | `public/art/jukebox-cabinet.webp`, `art/discs/`, `art/girl-*.webp` | Hand-drawn illustration made for this project. The cabinet is one painting; every overlay on it (dome, tubes, speaker, jewel, cradle) is positioned against measured coordinates in `src/lib/geometry.ts`. |
| Sixteen world backdrops | `public/art/world-*.webp` | One painted scene per record's phenomenon — heat field, wind ridge, rain valley, haze, ozone, fire front, traffic, sea surface, canopy, storm cell, night lights, aurora, meadow, arrival. Each was painted from that record's own NASA frame as the reference, so the scenery and the music describe the same map. |
| The girl in motion | `public/video/girl-{greet,point,listen}.webm` | VP9-with-alpha loops cut from one animated plate, rebuilt by `frontend/tools/build_girl_assets.sh`. The stills above are the settled end of the same windows, so reduced motion gets a sharp painting instead of a video. |
| Opening film | `public/video/boot-film.mp4` + `.mp3`, `public/art/boot-{poster,match}.webp` | A generated cut scene, retimed by ffmpeg: the picture is delivered at 1.12x duration (16.8 s) and the narration at `atempo=0.92` (soundtrack 18.0 s), rebuilt by `frontend/tools/build_boot_film.sh`. Its diegetic layer at 10.4 s is a genuine mapping_version 17 TerraTunes render of NASA sea surface temperature, fetched from `/tracks/sea-surface-temperature/render` — the same deterministic code path the jukebox uses. |
| Narration voice | inside `boot-film.mp3` | Synthesised speech, studio narrator voice; no human performer. The four sentences are shipped as text (`src/lib/boot.ts`, `BOOT_TRANSCRIPT`) and are the film's equivalent for a screen reader. |
| Music bed | inside `boot-film.mp3` | Generated instrumental; no sampled material. |
| Data frames, thumbnails, colourbars | served from `/api` | NASA SVS media, downloaded and processed by the backend. Every track carries its NASA credit line and source URL in `backend/data/tracks.json`, and the UI shows it. |

**Raw sources are deliberately not in git**: `film_raw.mp4`, `girl_raw.mp4`, `music_bed.mp3`,
`narration2.wav`, `son_sst.mp3` stay outside the repository and are passed to the build scripts as a
directory argument. Committed files are the encoded output, which keeps the repo at the size rule
above while making every visual reproducible from the scripts in `frontend/tools/`.

**The film is retimed, not re-rendered**: `frontend/tools/build_boot_film.sh` stretches the picture
with ffmpeg `setpts` to 1.12x (16.8 s delivered), slows the narration with `atempo=0.92` and places it
0.25 s in, delays the diegetic sonification excerpt to 10.4 s, and lets the soundtrack run to 18.0 s
while the video freezes at 14.45 s, so the last sentence ends before the fade at 16.4 s. That excerpt
is a real mapping_version 17 backend render of NASA sea surface temperature, fetched from
`/tracks/sea-surface-temperature/render`, the same code path the jukebox streams; it was not made up
for the film. The caption timings in `src/lib/boot.ts` are measured off the delivered voice, not
guessed.

**Licensing**: NASA media is public domain with credit and carries no endorsement of this project.
The original illustration, animation, film and audio generated for TerraTunes is released under the
project's own license (see `LICENSE`; if it is absent at freeze time, add it before submission —
judges and reusers both look for it).
