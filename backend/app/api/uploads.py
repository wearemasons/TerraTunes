"""Illustrated-app upload adapter; all scoring delegates to main's build_score.

An arbitrary image has no calibrated scientific colorbar. Luminance values are
explicitly artistic and never reported as a physical phenomenon measurement.
"""

import io
from typing import Annotated

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.mapping.rules import build_score
from app.schemas.models import Legend, LegendAnchor

router = APIRouter()


@router.post("/analyze")
async def analyze_image(file: Annotated[UploadFile, File()]) -> dict[str, object]:
    raw = await file.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image must be at most 10 MB")
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 40_000_000:
                raise HTTPException(413, "Image dimensions are too large")
            width, height = image.size
            small = image.convert("L").resize((96, 48), Image.Resampling.BOX)
            grid = np.round(np.asarray(small, dtype=np.float64) / 255 * 250).astype(np.uint8)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(415, "Upload a valid PNG, JPEG or WebP image") from exc
    legend = Legend(
        label="Image luminance (artistic, not calibrated)",
        unit="relative",
        min=0,
        max=1,
        anchors=[LegendAnchor(position=0, rgb=(0, 0, 0)), LegendAnchor(position=1, rgb=(255, 255, 255))],
    )
    score = build_score(
        track_id="artistic-upload",
        theme="weather",
        legend=legend,
        labels=[file.filename or "Uploaded image"],
        grids=grid[None, :, :],
        preset="orchestra",
    )
    return {"calibrated": False, "width": width, "height": height, "score": score.model_dump()}
