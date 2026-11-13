import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.mapping.rules import MAPPING_VERSION


def test_upload_is_main_scored_and_explicitly_artistic() -> None:
    image = Image.fromarray(np.tile(np.arange(0, 256, dtype=np.uint8), (64, 1)))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    with TestClient(app) as client:
        response = client.post("/analyze", files={"file": ("gradient.png", buffer.getvalue(), "image/png")})
    assert response.status_code == 200
    result = response.json()
    assert result["calibrated"] is False
    score = result["score"]
    assert score["mapping_version"] == MAPPING_VERSION
    assert score["preset"] == "orchestra"
    assert score["track_id"] == "artistic-upload"
    assert score["steps_per_frame"] == 16
    assert len(score["frames"]) == 1
    notes = score["frames"][0]["column_notes"]
    assert len(notes) == 16
    assert notes == sorted(notes)
    assert "voices" not in score["frames"][0]


def test_invalid_upload_returns_contract_error() -> None:
    with TestClient(app) as client:
        response = client.post("/analyze", files={"file": ("bad.png", b"not an image", "image/png")})
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported"
