import json
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.store import get_store

LEGEND = {
    "label": "Test temperature",
    "unit": "°C",
    "min": -40,
    "max": 40,
    "anchors": [{"position": 0, "rgb": [0, 0, 255]}, {"position": 1, "rgb": [255, 0, 0]}],
}


def make_track(root: Path, track_id: str = "test-track", frames: int = 4) -> Path:
    path = root / track_id
    (path / "frames").mkdir(parents=True)
    rows, cols = 12, 24
    grids = np.zeros((frames, rows, cols), dtype=np.uint8)
    for f in range(frames):
        grids[f] = np.linspace(0, 200, cols, dtype=np.uint8)[None, :] + f * 10
        grids[f, :, :3] = 255  # a no-data strip in the far west
    np.save(path / "grids.npy", grids)
    for f in range(frames):
        Image.new("RGB", (48, 24)).save(path / "frames" / f"{f:04d}.webp")
    Image.new("RGB", (48, 24)).save(path / "thumb.webp")
    meta = {
        "id": track_id,
        "svs_id": 1,
        "title": "Test Track",
        "theme": "sea_level",
        "summary": "s",
        "description": "d",
        "date_range": "2024",
        "frame_labels": [f"F{f}" for f in range(frames)],
        "legend": LEGEND,
        "credit": "NASA/SVS",
        "source_url": "https://svs.gsfc.nasa.gov/1",
        "calibrated": True,
    }
    (path / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return path


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("TERATONES_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    get_store.cache_clear()
    make_track(tmp_path / "tracks")
    from app.main import app

    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()
    get_store.cache_clear()
