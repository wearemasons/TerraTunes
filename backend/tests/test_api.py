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
