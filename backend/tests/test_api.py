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
    assert detail["audio_key"].startswith("Pitch shows")
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
    assert "left ear" in detail["sound"]["listening_guide"]

    score = client.get("/tracks/test-track/score").json()
    layers = score["frames"][1]["layers"]
    assert len(layers["column_intensity"]) == 16
    assert set(layers["band_intensity"]) == {"north", "tropics", "south"}

    audio = client.get("/tracks/test-track/render?mode=overview&format=wav&melody=false")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"
    assert audio.content[:4] == b"RIFF"
    assert client.get("/tracks/test-track/render?format=ogg").status_code == 422


def test_render_without_soundscape_is_404(client: TestClient) -> None:
    assert client.get("/tracks/test-track/render").status_code == 404


def test_orchestra_preset_plays_the_clear_tone_notes(client: TestClient) -> None:
    clear = client.get("/tracks/test-track/score?preset=clear").json()
    orchestra = client.get("/tracks/test-track/score?preset=orchestra")
    assert orchestra.status_code == 200
    body = orchestra.json()
    assert body["preset"] == "orchestra"
    assert [f["column_notes"] for f in body["frames"]] == [f["column_notes"] for f in clear["frames"]]
    assert body["key"] == clear["key"]


def test_orchestra_samples_reachable_under_both_spellings(tmp_path, monkeypatch):
    """The browser's Orchestra sound fetches `/api/samples/...`.

    A single-origin deploy that only answers `/samples/...` plays the synthesised
    tone and reports no instruments, so both spellings have to resolve. Built with a
    throwaway data directory so the check runs whether or not the real library is
    provisioned: the bug is the route table, not the audio.
    """
    import importlib
    import json

    from app.core import config as core_config

    library = tmp_path / "samples" / "web"
    library.mkdir(parents=True)
    (library / "manifest.json").write_text(json.dumps({"license": "CC0", "instruments": {"flute": []}}))
    (library / "flute").mkdir()
    (library / "flute" / "60.00.mp3").write_bytes(b"ID3\x00fake")

    monkeypatch.setenv("TERRATUNES_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TERRATUNES_WEB_DIR", "")
    core_config.get_settings.cache_clear()
    import app.main as main_module

    reloaded = importlib.reload(main_module)
    try:
        probe = TestClient(reloaded.app)
        for path in ("/samples/manifest.json", "/api/samples/manifest.json"):
            response = probe.get(path)
            assert response.status_code == 200, path
            assert response.json()["instruments"] == {"flute": []}, path
        # and a sample itself, which is what actually plays
        assert probe.get("/api/samples/flute/60.00.mp3").status_code == 200
    finally:
        monkeypatch.undo()
        core_config.get_settings.cache_clear()
        importlib.reload(main_module)
