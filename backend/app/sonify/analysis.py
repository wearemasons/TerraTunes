"""Per-frame layer data for the soundscape: phenomenon intensity per scan column and latitude band,
threshold alerts and the most extreme regions. Real values come from the legend (log/piecewise)."""

import numpy as np
from numpy.typing import NDArray

from app.mapping.rules import GRID_MAX, NO_DATA, STEPS_PER_FRAME, lat_lon
from app.schemas.models import Alert, FrameLayers, Legend, Region
from app.sonify.regions import region_name
from app.sonify.spec import SoundSpec
from app.vision.colorbar import ValueScale

BANDS = ("north", "tropics", "south")  # >23.5°N, 23.5°S to 23.5°N, <23.5°S


def real_values(grid: NDArray[np.uint8], legend: Legend) -> NDArray[np.float64]:
    """uint8 grid → real values (NaN where no data)."""
    pos = grid.astype(np.float64) / GRID_MAX
    if len(legend.ticks) >= 2:
        scale = ValueScale(
            positions=tuple(t.position for t in legend.ticks),
            values=tuple(t.value for t in legend.ticks),
            log=legend.log,
        )
        vals = np.log10(scale.values) if scale.log else np.array(scale.values, dtype=float)
        real = np.interp(pos, scale.positions, vals)
        if scale.log:
            real = 10**real
    else:
        real = legend.min + pos * (legend.max - legend.min)
    return np.where(grid == NO_DATA, np.nan, real)


def _intensity_grid(real: NDArray[np.float64], spec: SoundSpec) -> NDArray[np.float64]:
    f = np.vectorize(spec.intensity.__call__, otypes=[float])
    out = np.full(real.shape, np.nan)
    ok = ~np.isnan(real)
    out[ok] = f(real[ok])
    return out


def _band_rows(rows: int) -> dict[str, slice]:
    north = round(rows * (90 - 23.5) / 180)
    south = round(rows * (90 + 23.5) / 180)
    return {"north": slice(0, north), "tropics": slice(north, south), "south": slice(south, rows)}


def analyse_frames(grids: NDArray[np.uint8], legend: Legend, spec: SoundSpec) -> list[FrameLayers]:
    n, rows, cols = grids.shape
    bands = _band_rows(rows)
    was_over: dict[str, bool] = {}
    out: list[FrameLayers] = []
    for i in range(n):
        real = real_values(grids[i], legend)
        inten = _intensity_grid(real, spec)
        valid = ~np.isnan(real)
        coverage = float(valid.mean())

        column_intensity: list[float] = []
        for step in range(STEPS_PER_FRAME):
            block = inten[:, (step * cols) // STEPS_PER_FRAME : ((step + 1) * cols) // STEPS_PER_FRAME]
            vals = block[~np.isnan(block)]
            # Weighted to the slice's strongest part: a small storm must still sound loud.
            column_intensity.append(
                round(float(0.7 * np.percentile(vals, 90) + 0.3 * vals.mean()), 4) if vals.size else 0.0
            )

        band_intensity: dict[str, float] = {}
        band_peak: dict[str, float | None] = {}
        for name, sl in bands.items():
            b = inten[sl]
            r = real[sl]
            band_intensity[name] = round(float(np.nanmean(b)), 4) if np.any(~np.isnan(b)) else 0.0
            band_peak[name] = round(float(np.nanmax(r)), 4) if np.any(~np.isnan(r)) else None

        alerts: list[Alert] = []
        for th in spec.thresholds:
            past = (real >= th.value) if th.above else (real <= th.value)
            past &= valid
            share = float(past.sum() / max(1, valid.sum()))
            key = f"{th.label}:{th.above}"
            if share > 0:
                masked = np.where(past, real if th.above else -real, -np.inf)
                idx = int(np.argmax(masked))
                x, y = ((idx % cols) + 0.5) / cols, ((idx // cols) + 0.5) / rows
                alerts.append(
                    Alert(
                        label=th.label,
                        value=round(float(real.flat[idx]), 4),
                        x=x,
                        y=y,
                        region=region_name(x, y),
                        share=round(share, 4),
                        new=not was_over.get(key, False),
                    )
                )
            was_over[key] = share > 0

        regions: list[Region] = []
        ranked = np.argsort(np.where(valid, inten, -1.0), axis=None)[::-1]
        for idx in ranked:
            if len(regions) == 3 or not valid.flat[idx] or inten.flat[idx] <= 0:
                break
            x, y = ((idx % cols) + 0.5) / cols, ((idx // cols) + 0.5) / rows
            if any(abs(x - r.x) < 0.12 and abs(y - r.y) < 0.15 for r in regions):
                continue
            regions.append(
                Region(
                    region=region_name(x, y),
                    where=lat_lon(x, y),
                    value=round(float(real.flat[idx]), 4),
                    x=x,
                    y=y,
                )
            )

        out.append(
            FrameLayers(
                intensity=round(float(np.nanmean(inten)), 4) if valid.any() else 0.0,
                column_intensity=column_intensity,
                band_intensity=band_intensity,
                band_peak_value=band_peak,
                coverage=round(coverage, 4),
                alerts=alerts,
                regions=regions,
            )
        )
    return out
