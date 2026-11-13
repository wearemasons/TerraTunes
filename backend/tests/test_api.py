import base64

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["tracks"] == 1
    assert r.headers["x-request-id"]


def test_list_and_detail(client: TestClient) -> None:
    tracks = client.get("/tracks").json()
    assert [t["id"] for t in tracks] == ["test-track"]
    assert tracks[0]["thumbnail_url"].endswith("/tracks/test-track/thumbnail")
    detail = client.get("/tracks/test-track").json()
    assert detail["frame_count"] == 4
    assert detail["audio_key"].startswith("The map measures")
    assert "composition, not another data measurement" in detail["audio_key"]
    assert "Louder and fuller" in detail["audio_key"]
    assert detail["transcript"][0]["frame"] == 0
    assert detail["synthetic"] is False


def test_score_and_etag(client: TestClient) -> None:
    r = client.get("/tracks/test-track/score?preset=clear")
    assert r.status_code == 200
    body = r.json()
    assert body["preset"] == "clear"
    assert len(body["frames"]) == 4
    assert body["frames"][0]["column_notes"][0] == -1  # no-data strip is silent
    again = client.get("/tracks/test-track/score?preset=clear", headers={"if-none-match": r.headers["etag"]})
    assert again.status_code == 304


def test_grid_and_frames(client: TestClient) -> None:
    grid = client.get("/tracks/test-track/frames/1/grid").json()
    cells = base64.b64decode(grid["cells_b64"])
    assert len(cells) == grid["cols"] * grid["rows"] == 24 * 12
    assert cells[0] == 255
    img = client.get("/tracks/test-track/frames/0")
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/webp"


def test_errors_use_contract_shape(client: TestClient) -> None:
    r = client.get("/tracks/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    assert r.json()["error"]["request_id"]
    assert client.get("/tracks/test-track/frames/99").status_code == 404
    assert client.get("/tracks/test-track/score?preset=loud").status_code == 422


def test_soundscape_fields_and_render(client: TestClient) -> None:
    from app.core.config import get_settings
    from app.store import get_store

    settings = get_settings()
    settings.catalog_path.write_text(
        """
tracks:
  - id: test-track
    svs_id: 1
    theme: sea_level
    title: Test Track
    summary: s
    movie: m.mp4
    colorbar: c.png
    legend: {label: T, unit: u, ticks: [{position: 0, value: 0}, {position: 1, value: 1}]}
    sound:
      phenomenon: wind
      intensity: {lo: -40, hi: 40}
      thresholds: [{value: 30, label: very windy}]
""",
        encoding="utf-8",
    )
    get_store().reload()

    detail = client.get("/tracks/test-track").json()
    assert detail["sound"]["phenomenon"] == "wind"
    assert detail["sound"]["render_url"].endswith("/tracks/test-track/render")
    guide = detail["sound"]["listening_guide"]
    assert "west to east" in guide and "no drums" in guide
    assert "left ear" not in guide  # v14: the melody no longer sweeps across the stereo field
    assert detail["sound"]["description"].startswith("Wind speed")

    score = client.get("/tracks/test-track/score").json()
    layers = score["frames"][1]["layers"]
    assert len(layers["column_intensity"]) == 8  # steps_per_frame follows MAPPING_VERSION 14
    assert set(layers["band_intensity"]) == {"north", "tropics", "south"}

    audio = client.get("/tracks/test-track/render?mode=overview&format=wav&melody=false")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"
    assert audio.content[:4] == b"RIFF"
    assert client.get("/tracks/test-track/render?format=ogg").status_code == 422


def test_render_without_soundscape_is_404(client: TestClient) -> None:
    assert client.get("/tracks/test-track/render").status_code == 404
