"""Recover data values from a false-colour frame by matching pixels to the colorbar.

Steps: mask overlays → box-downsample to a working size → nearest colorbar colour in CIELAB →
reject pixels too far from any colorbar colour (land, coastlines, labels) → per-cell median.
"""

import numpy as np
from numpy.typing import NDArray
from PIL import Image, ImageFilter

GRID_MAX = 250
NO_DATA = 255

Box = tuple[float, float, float, float]  # normalized x0, y0, x1, y1


def srgb_to_lab(rgb: NDArray[np.floating] | NDArray[np.uint8]) -> NDArray[np.float32]:
    """sRGB (0..255) → CIELAB (D65)."""
    c = np.asarray(rgb, dtype=np.float32) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float32,
    )
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    lab = np.stack(
        [116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1
    )
    return lab.astype(np.float32)


def calibrate_frame(
    image: Image.Image,
    strip_colors: NDArray[np.uint8],
    *,
    cols: int = 96,
    rows: int = 48,
    oversample: int = 4,
    max_delta_e: float = 14.0,
    min_valid_share: float = 0.4,
    masks: list[Box] | None = None,
    unmatched_as_min: bool = False,
    match_range: tuple[float, float] = (0.0, 1.0),
) -> NDArray[np.uint8]:
    """Return a (rows, cols) uint8 grid: 0..250 = position on the colorbar, 255 = no data.

    `unmatched_as_min`: pixels that match no colorbar colour mean "lowest value" rather than
    "no data" (e.g. precipitation maps, where anything not rain-coloured is dry ground or cloud).
    Masked areas (logos, date stamps) are always no data.
    `match_range`: only this part of the colorbar may match (e.g. exclude a grey tail that would
    otherwise match grey land shading).
    """
    # Remove thin coastlines, borders and text strokes first: a 5-px median at ~1024 px wide erases
    # 1-3 px lines while keeping data fields. Without it, dense dark coastlines can read as peak values.
    clean = image.convert("RGB")
    if clean.width > 1024:
        clean = clean.resize((1024, max(1, round(1024 * clean.height / clean.width))), Image.Resampling.BOX)
    clean = clean.filter(ImageFilter.MedianFilter(5))
    work = clean.resize((cols * oversample, rows * oversample), Image.Resampling.BOX)
    pixels = np.asarray(work, dtype=np.uint8)
    h, w, _ = pixels.shape

    lab = srgb_to_lab(pixels.reshape(-1, 3))
    n = len(strip_colors)
    lo = round(match_range[0] * (n - 1))
    hi = round(match_range[1] * (n - 1)) + 1
    lut = srgb_to_lab(strip_colors[lo:hi])  # (M, 3), only the allowed part of the bar
    best = np.empty(lab.shape[0], dtype=np.int32)
    dist = np.empty(lab.shape[0], dtype=np.float32)
    for start in range(0, lab.shape[0], 16384):
        chunk = lab[start : start + 16384]
        d = ((chunk[:, None, :] - lut[None, :, :]) ** 2).sum(axis=2)
        idx = d.argmin(axis=1)
        best[start : start + len(chunk)] = idx + lo
        dist[start : start + len(chunk)] = np.sqrt(d[np.arange(len(chunk)), idx])

    position = (best / max(1, n - 1)).reshape(h, w)
    # A grey pixel (outline, label, shading) may not stand in for a strongly coloured bar entry.
    full_lut = srgb_to_lab(strip_colors)
    chroma_px = np.hypot(lab[:, 1], lab[:, 2])
    chroma_lut = np.hypot(full_lut[best, 1], full_lut[best, 2])
    valid = ((dist <= max_delta_e) & (chroma_lut - chroma_px <= 20)).reshape(h, w)
    if unmatched_as_min:
        position = np.where(valid, position, 0.0)
        valid = np.ones_like(valid)
    for x0, y0, x1, y1 in masks or []:
        valid[int(y0 * h) : int(np.ceil(y1 * h)), int(x0 * w) : int(np.ceil(x1 * w))] = False

    grid = np.full((rows, cols), NO_DATA, dtype=np.uint8)
    cells_v = (
        position.reshape(rows, oversample, cols, oversample).transpose(0, 2, 1, 3).reshape(rows, cols, -1)
    )
    cells_ok = valid.reshape(rows, oversample, cols, oversample).transpose(0, 2, 1, 3).reshape(rows, cols, -1)
    share = cells_ok.mean(axis=2)
    for r in range(rows):
        for c in range(cols):
            if share[r, c] >= min_valid_share:
                grid[r, c] = round(float(np.median(cells_v[r, c][cells_ok[r, c]])) * GRID_MAX)
    return despeckle(grid)


def despeckle(grid: NDArray[np.uint8], jump: int = 70) -> NDArray[np.uint8]:
    """Replace single cells that tower over every valid neighbour (dense outlines, text remnants).

    Real peaks such as plumes or fires spread across neighbouring cells, so they survive.
    """
    out = grid.copy()
    rows, cols = grid.shape
    for r in range(rows):
        for c in range(cols):
            v = int(grid[r, c])
            if v == NO_DATA:
                continue
            neighbours = [
                int(grid[rr, (c + dc) % cols])
                for rr in range(max(0, r - 1), min(rows, r + 2))
                for dc in (-1, 0, 1)
                if (rr, dc) != (r, 0) and grid[rr, (c + dc) % cols] != NO_DATA
            ]
            if len(neighbours) >= 3 and v - max(neighbours) > jump:
                out[r, c] = int(np.median(neighbours))
    return out
