"""Build processed tracks from SVS assets: download → sample frames → calibrate → write track dir."""

import html
import json
import logging
import re
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from app.core.config import Settings, get_settings
from app.ingest.catalog import CatalogEntry
from app.ingest.video import sample_frames
from app.schemas.models import Legend, LegendAnchor, LegendTick
from app.svs.client import MediaItem, SvsClient
from app.vision.calibrate import calibrate_frame
from app.vision.colorbar import ValueScale, extract_strip

log = logging.getLogger(__name__)

GRID_COLS, GRID_ROWS = 96, 48
DISPLAY_SIZE = (1280, 640)
THUMB_SIZE = (480, 240)
ANCHORS = 16


def _find(media: list[MediaItem], filename: str, kind: str) -> MediaItem:
    for item in media:
        if item.filename == filename:
            return item
    available = ", ".join(sorted(m.filename for m in media if m.media_type == kind))
    raise LookupError(f'"{filename}" not on the SVS page. {kind} files: {available}')


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def _credit(page: dict[str, Any]) -> str:
    names: list[str] = []
    for people in (page.get("main_credits") or {}).values():
        for person in people:
            name = person.get("name")
            if name and name not in names:
                names.append(name)
    who = f" Visualization by {', '.join(names)}." if names else ""
    return f"NASA's Scientific Visualization Studio (SVS {page['id']}).{who}"


def _labels(
    entry: CatalogEntry, page: dict[str, Any], indices: list[int], total: int
) -> tuple[list[str], str]:
    updated = datetime.fromisoformat(page.get("update_date") or page["release_date"])
    if entry.time.mode == "span" and entry.time.span_days:
        start = updated - timedelta(days=entry.time.span_days)
        dates = [start + timedelta(days=entry.time.span_days * i / max(1, total - 1)) for i in indices]
        labels = [f"about {d:%b %Y}" for d in dates]
        return labels, f"{dates[0]:%b %Y} to {dates[-1]:%b %Y} (approximate)"
    if entry.time.mode == "hourly":
        end = updated + timedelta(hours=15)  # update_date is a calendar day; runs end mid-afternoon
        times = [end - timedelta(hours=total - 1 - i) for i in indices]
        # Day precision only: the exact hour is burned into the pixels, not published in the API.
        labels = [f"about {t.day} {t:%b}" for t in times]
        return (
            labels,
            f"About {times[0].day} {times[0]:%b} to {times[-1].day} {times[-1]:%b %Y}, hourly (approximate)",
        )
    labels = [f"{entry.time.step_label} {i + 1}" for i in range(len(indices))]
    return labels, f"Latest run, updated {updated:%d %b %Y}"


def build_track(entry: CatalogEntry, client: SvsClient, settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    log.info("Building %s (SVS %d)", entry.id, entry.svs_id)
    page = client.page(entry.svs_id, refresh=True)
    media = client.media(page)
    raw = settings.raw_dir / str(entry.svs_id)

    movie = client.download(_find(media, entry.movie, "Movie").url, raw / entry.movie)
    colorbar_path = client.download(_find(media, entry.colorbar, "Image").url, raw / entry.colorbar)

    strip = extract_strip(Image.open(colorbar_path), samples=256, box=entry.colorbar_box)
    scale = ValueScale(
        positions=tuple(t.position for t in entry.legend.ticks),
        values=tuple(t.value for t in entry.legend.ticks),
        log=entry.legend.log,
    )
    _ = scale.min  # validates the scale early

    total, sampled = sample_frames(movie, entry.frames, entry.skip_edges)
    labels, date_range = _labels(entry, page, [i for i, _ in sampled], total)

    work = settings.tracks_dir / f".{entry.id}.tmp"
    shutil.rmtree(work, ignore_errors=True)
    (work / "frames").mkdir(parents=True)
    grids = np.empty((len(sampled), GRID_ROWS, GRID_COLS), dtype=np.uint8)
    for n, (_, image) in enumerate(sampled):
        grids[n] = calibrate_frame(
            image,
            strip.colors,
            cols=GRID_COLS,
            rows=GRID_ROWS,
            masks=entry.masks,
            max_delta_e=entry.max_delta_e,
            unmatched_as_min=entry.unmatched == "min",
            match_range=entry.match_range,
        )
        image.convert("RGB").resize(DISPLAY_SIZE, Image.Resampling.LANCZOS).save(
            work / "frames" / f"{n:04d}.webp", quality=80, method=5
        )
        if n == len(sampled) // 2:
            image.convert("RGB").resize(THUMB_SIZE, Image.Resampling.LANCZOS).save(
                work / "thumb.webp", quality=78
            )
    np.save(work / "grids.npy", grids)

    valid = float((grids != 255).mean())
    log.info("  calibrated %d frames, %.0f%% of cells matched the colorbar", len(grids), valid * 100)
    if valid < 0.2:
        log.warning("  very few cells matched: check colorbar box, masks or max_delta_e for %s", entry.id)

    picks = np.linspace(0, len(strip.colors) - 1, ANCHORS).round().astype(int)
    legend = Legend(
        label=entry.legend.label,
        unit=entry.legend.unit,
        min=scale.min,
        max=scale.max,
        anchors=[
            LegendAnchor(
                position=float(i / (len(strip.colors) - 1)),
                rgb=(int(strip.colors[i][0]), int(strip.colors[i][1]), int(strip.colors[i][2])),
            )
            for i in picks
        ],
        ticks=[LegendTick(position=t.position, value=t.value, label=t.label) for t in entry.legend.ticks],
        log=entry.legend.log,
    )
    meta = {
        "id": entry.id,
        "svs_id": entry.svs_id,
        "title": entry.title,
        "theme": entry.theme,
        "summary": entry.summary,
        "description": entry.description or _clean(page.get("description") or "")[:900],
        "date_range": date_range,
        "frame_labels": labels,
        "legend": legend.model_dump(),
        "credit": _credit(page),
        "source_url": f"https://svs.gsfc.nasa.gov/{entry.svs_id}",
        "calibrated": True,
        "valid_share": round(valid, 3),
        "unmatched": entry.unmatched,
        "colorbar_box": list(strip.box),
        "source_movie": entry.movie,
        "built_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    (work / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    # Debug aid: the extracted gradient, for eyeballing against the source colorbar.
    Image.fromarray(np.repeat(strip.colors[None], 24, axis=0)).save(work / "strip.png")

    final = settings.tracks_dir / entry.id
    shutil.rmtree(final, ignore_errors=True)
    work.rename(final)
    return final
