"""Recover data values from a false-colour frame by matching pixels to the colorbar.

Steps: mask overlays → box-downsample to a working size → nearest colorbar colour in CIELAB →
reject pixels too far from any colorbar colour (land, coastlines, labels) → per-cell median.
"""

import numpy as np
from numpy.typing import NDArray
from PIL import Image

GRID_MAX = 250
NO_DATA = 255

Box = tuple[float, float, float, float]  # normalized x0, y0, x1, y1


def srgb_to_lab(rgb: NDArray[np.floating] | NDArray[np.uint8]) -> NDArray[np.float32]:
    """sRGB (0..255) → CIELAB (D65)."""
    c = np.asarray(rgb, dtype=np.float32) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array(
        [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]],
        dtype=np.float32,
    )
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    lab = np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)
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
) -> NDArray[np.uint8]:
    """Return a (rows, cols) uint8 grid: 0..250 = position on the colorbar, 255 = no data."""
    work = image.convert("RGB").resize((cols * oversample, rows * oversample), Image.Resampling.BOX)
    pixels = np.asarray(work, dtype=np.uint8)
    h, w, _ = pixels.shape

    lab = srgb_to_lab(pixels.reshape(-1, 3))
    lut = srgb_to_lab(strip_colors)  # (N, 3)
    best = np.empty(lab.shape[0], dtype=np.int32)
    dist = np.empty(lab.shape[0], dtype=np.float32)
    for start in range(0, lab.shape[0], 16384):
        chunk = lab[start : start + 16384]
        d = ((chunk[:, None, :] - lut[None, :, :]) ** 2).sum(axis=2)
        idx = d.argmin(axis=1)
        best[start : start + len(chunk)] = idx
        dist[start : start + len(chunk)] = np.sqrt(d[np.arange(len(chunk)), idx])

    position = (best / max(1, len(strip_colors) - 1)).reshape(h, w)
    valid = (dist <= max_delta_e).reshape(h, w)
    for x0, y0, x1, y1 in masks or []:
        valid[int(y0 * h) : int(np.ceil(y1 * h)), int(x0 * w) : int(np.ceil(x1 * w))] = False

    grid = np.full((rows, cols), NO_DATA, dtype=np.uint8)
    cells_v = position.reshape(rows, oversample, cols, oversample).transpose(0, 2, 1, 3).reshape(rows, cols, -1)
    cells_ok = valid.reshape(rows, oversample, cols, oversample).transpose(0, 2, 1, 3).reshape(rows, cols, -1)
    share = cells_ok.mean(axis=2)
    for r in range(rows):
        for c in range(cols):
            if share[r, c] >= min_valid_share:
                grid[r, c] = round(float(np.median(cells_v[r, c][cells_ok[r, c]])) * GRID_MAX)
    return grid
