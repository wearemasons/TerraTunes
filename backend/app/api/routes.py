import base64
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse

from app import __version__
from app.mapping.rules import MAPPING_VERSION
from app.schemas.models import (
    ErrorResponse,
    GridResponse,
    Health,
    PresetId,
    Score,
    TrackDetail,
    TrackSummary,
)
from app.store import StoredTrack, TrackStore, get_store

router = APIRouter()
Store = Annotated[TrackStore, Depends(get_store)]
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"model": ErrorResponse}}
IMMUTABLE = "public, max-age=86400"


def _track(store: TrackStore, track_id: str) -> StoredTrack:
    track = store.get(track_id)
    if track is None:
        raise HTTPException(404, f'Track "{track_id}" not found')
    return track


def _thumb_url(request: Request, track: StoredTrack) -> str | None:
    if not (track.path / "thumb.webp").exists():
        return None
    return str(request.url_for("thumbnail", track_id=track.meta.id))


@router.get("/healthz", response_model=Health, tags=["meta"])
def healthz(store: Store) -> Health:
    return Health(status="ok", version=__version__, tracks=len(store.all()))


@router.get("/tracks", response_model=list[TrackSummary], tags=["tracks"])
def list_tracks(request: Request, store: Store) -> list[TrackSummary]:
    return [t.summary(_thumb_url(request, t)) for t in store.all()]


@router.get("/tracks/{track_id}", response_model=TrackDetail, responses=NOT_FOUND, tags=["tracks"])
def get_track(track_id: str, request: Request, store: Store) -> TrackDetail:
    track = _track(store, track_id)
    return track.detail(_thumb_url(request, track))


@router.get("/tracks/{track_id}/score", response_model=Score, responses=NOT_FOUND, tags=["tracks"])
def get_score(
    track_id: str,
    request: Request,
    response: Response,
    store: Store,
    preset: Annotated[PresetId, Query()] = "musical",
) -> Score | Response:
    track = _track(store, track_id)
    etag = f'{track.etag[:-1]}-{preset}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"etag": etag})
    response.headers["etag"] = etag
    response.headers["cache-control"] = "public, max-age=300"
    response.headers["x-mapping-version"] = MAPPING_VERSION
    return track.score(preset)


@router.get("/tracks/{track_id}/thumbnail", name="thumbnail", responses=NOT_FOUND, tags=["media"])
def thumbnail(track_id: str, store: Store) -> FileResponse:
    track = _track(store, track_id)
    path = track.path / "thumb.webp"
    if not path.exists():
        raise HTTPException(404, "No thumbnail")
    return FileResponse(path, media_type="image/webp", headers={"cache-control": IMMUTABLE})


@router.get("/tracks/{track_id}/frames/{n}", responses=NOT_FOUND, tags=["media"])
def frame_image(track_id: str, n: int, store: Store) -> FileResponse:
    track = _track(store, track_id)
    if not 0 <= n < track.frame_count:
        raise HTTPException(404, f"Frame {n} not found")
    return FileResponse(track.frame_path(n), media_type="image/webp", headers={"cache-control": IMMUTABLE})


@router.get(
    "/tracks/{track_id}/frames/{n}/grid", response_model=GridResponse, responses=NOT_FOUND, tags=["media"]
)
def frame_grid(track_id: str, n: int, store: Store, response: Response) -> GridResponse:
    track = _track(store, track_id)
    if not 0 <= n < track.frame_count:
        raise HTTPException(404, f"Frame {n} not found")
    grid = track.grids[n]
    response.headers["cache-control"] = IMMUTABLE
    legend = track.meta.legend
    return GridResponse(
        cols=int(grid.shape[1]),
        rows=int(grid.shape[0]),
        cells_b64=base64.b64encode(grid.tobytes()).decode("ascii"),
        real_min=legend.min,
        real_max=legend.max,
        unit=legend.unit,
    )
