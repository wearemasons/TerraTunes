"""Colorbar extraction and value scales.

A colorbar image is turned into a dense list of colours (the gradient strip, sampled left→right).
Tick stops map strip positions to real values, linear or logarithmic between stops, which covers
the SVS bars we use (e.g. PM2.5 0.4…409.6 in x4 steps, NOx 10⁻³…10¹, CO 40/100/130/200/500).
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from PIL import Image

RGB = NDArray[np.uint8]


@dataclass(frozen=True)
class Strip:
    colors: RGB  # (N, 3) left→right
    box: tuple[int, int, int, int]  # x0, y0, x1, y1 in the source image


def _background(rgb: NDArray[np.int16]) -> NDArray[np.int16]:
    """Most common border colour = background (white, grey panel or black)."""
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    values, counts = np.unique(border, axis=0, return_counts=True)
    return values[np.argmax(counts)]  # type: ignore[no-any-return]


def _runs(mask_row: NDArray[np.bool_]) -> tuple[int, int]:
    """Longest run of True as (start, end_exclusive)."""
    best = (0, 0)
    start = -1
    for x, on in enumerate([*mask_row.tolist(), False]):
        if on and start < 0:
            start = x
        elif not on and start >= 0:
            if x - start > best[1] - best[0]:
                best = (start, x)
            start = -1
    return best


def extract_strip(image: Image.Image, samples: int = 256, box: tuple[int, int, int, int] | None = None) -> Strip:
    """Find the gradient bar automatically (or use `box`) and sample `samples` colours along it."""
    rgba = np.asarray(image.convert("RGBA")).astype(np.int16)
    # Composite transparency over white so semi-transparent panels behave.
    alpha = rgba[..., 3:4] / 255
    rgb = (rgba[..., :3] * alpha + 255 * (1 - alpha)).astype(np.int16)

    if box is None:
        bg = _background(rgb)
        diff = np.abs(rgb - bg).sum(axis=2) > 60
        h, w = diff.shape
        extents = [_runs(diff[y]) for y in range(h)]
        lengths = np.array([e[1] - e[0] for e in extents])
        long_rows = np.where(lengths >= 0.5 * lengths.max())[0]
        if long_rows.size == 0:
            raise ValueError("No colorbar strip found")
        # Largest contiguous block of long rows = the bar.
        groups = np.split(long_rows, np.where(np.diff(long_rows) > 1)[0] + 1)
        rows = max(groups, key=len)
        starts = np.array([extents[y][0] for y in rows])
        ends = np.array([extents[y][1] for y in rows])
        # The rectangular body shares one extent; arrow tips or frames don't. Use the mode.
        x0 = int(np.bincount(starts).argmax())
        x1 = int(np.bincount(ends).argmax())
        # Trim 1px outlines and keep the inner 60% of rows (avoids tick marks and borders).
        y0, y1 = int(rows[0]), int(rows[-1]) + 1
        pad = max(1, (y1 - y0) // 5)
        box = (x0 + 1, y0 + pad, x1 - 1, y1 - pad)
        _ = w

    x0, y0, x1, y1 = box
    body = rgb[y0:y1, x0:x1]
    column = np.median(body, axis=0)  # (W, 3); median removes thin tick lines
    # 5-px running median along x kills isolated tick columns.
    k = 2
    padded = np.pad(column, ((k, k), (0, 0)), mode="edge")
    column = np.median(np.stack([padded[i : i + len(column)] for i in range(2 * k + 1)]), axis=0)
    xs = np.linspace(0, len(column) - 1, samples)
    sampled = np.stack([np.interp(xs, np.arange(len(column)), column[:, c]) for c in range(3)], axis=1)
    return Strip(colors=np.clip(np.round(sampled), 0, 255).astype(np.uint8), box=box)


@dataclass(frozen=True)
class ValueScale:
    """Piecewise mapping from strip position (0..1) to real values."""

    positions: tuple[float, ...]
    values: tuple[float, ...]
    log: bool = False

    def __post_init__(self) -> None:
        if len(self.positions) < 2 or len(self.positions) != len(self.values):
            raise ValueError("Need at least two matching tick positions and values")
        if self.log and min(self.values) <= 0:
            raise ValueError("Log scales need positive values")

    def to_real(self, position: float) -> float:
        p = float(np.clip(position, 0, 1))
        vals = np.log10(self.values) if self.log else np.array(self.values, dtype=float)
        v = float(np.interp(p, self.positions, vals))
        return float(10**v) if self.log else v

    @property
    def min(self) -> float:
        return self.to_real(0)

    @property
    def max(self) -> float:
        return self.to_real(1)
