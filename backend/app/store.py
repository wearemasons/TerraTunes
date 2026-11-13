"""Read-only access to processed tracks in data/tracks/<id>/.

Layout per track (written by app.ingest.pipeline):
    meta.json         TrackMeta
    grids.npy         uint8 (frames, rows, cols), 0..250 value, 255 = no data
    frames/0000.webp  display frames
    thumb.webp        card thumbnail
"""

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel

from app.core.config import get_settings
from app.mapping.rules import (
    MAPPING_VERSION,
    THEME_KEYS,
    audio_key_text,
    build_score,
    build_transcript,
    frame_duration_s,
    lower_first,
)
from app.schemas.models import (
    Legend,
    PresetId,
    Score,
    SoundInfo,
    ThemeId,
    ThresholdInfo,
    TrackDetail,
    TrackSummary,
)
from app.sonify.analysis import analyse_frames
from app.sonify.spec import SoundSpec

log = logging.getLogger(__name__)


class TrackMeta(BaseModel):
    id: str
    svs_id: int
    title: str
    theme: ThemeId
    summary: str
    description: str
    date_range: str
    frame_labels: list[str]
    legend: Legend
    credit: str
    source_url: str
    calibrated: bool
    order: int = 0


@dataclass(frozen=True)
class StoredTrack:
    meta: TrackMeta
    path: Path
    grids: NDArray[np.uint8]
    sound: SoundSpec | None = None
    order: int = 0

    @property
    def frame_count(self) -> int:
        return int(self.grids.shape[0])

    def frame_path(self, n: int) -> Path:
        return self.path / "frames" / f"{n:04d}.webp"

    def summary(self, thumbnail_url: str | None) -> TrackSummary:
        m = self.meta
        return TrackSummary(
            id=m.id,
            title=m.title,
            theme=m.theme,
            summary=m.summary,
            date_range=m.date_range,
            frame_count=self.frame_count,
            duration_s=round(self.frame_count * frame_duration_s(THEME_KEYS[m.theme].bpm), 2),
            thumbnail_url=thumbnail_url,
            credit=m.credit,
            source_url=m.source_url,
            calibrated=m.calibrated,
            synthetic=False,
        )

    def sound_info(self, render_url: str | None = None) -> SoundInfo | None:
        if self.sound is None:
            return None
        from app.sonify.render import listening_guide  # local: render imports schemas only

        return SoundInfo(
            phenomenon=self.sound.phenomenon,
            description=self.sound.description,
            listening_guide=listening_guide(self.sound, lower_first(self.meta.legend.label)),
            thresholds=[
                ThresholdInfo(value=t.value, label=t.label, above=t.above) for t in self.sound.thresholds
            ],
            render_url=render_url,
        )

    def detail(self, thumbnail_url: str | None, render_url: str | None = None) -> TrackDetail:
        score = self.score("musical")
        return TrackDetail(
            **self.summary(thumbnail_url).model_dump(),
            description=self.meta.description,
            audio_key=audio_key_text(self.meta.legend),  # key for the browser engine
            sound=self.sound_info(render_url),
            legend=self.meta.legend,
            presets=["musical", "clear"],
            frame_labels=self.meta.frame_labels,
            transcript=build_transcript(score, self.meta.legend),
        )

    def score(self, preset: PresetId) -> Score:
        return _score(self.meta.id, preset, self.path.stat().st_mtime_ns)

    @property
    def etag(self) -> str:
        return f'"{self.meta.id}-{MAPPING_VERSION}-{(self.path / "grids.npy").stat().st_mtime_ns}"'


@lru_cache(maxsize=64)
def _score(track_id: str, preset: PresetId, _mtime: int) -> Score:
    track = get_store().get(track_id)
    if track is None:
        raise KeyError(track_id)
    m = track.meta
    score = build_score(
        track_id=m.id, theme=m.theme, legend=m.legend, labels=m.frame_labels, grids=track.grids, preset=preset
    )
    if track.sound is not None:
        for frame, layers in zip(
            score.frames, analyse_frames(track.grids, m.legend, track.sound), strict=True
        ):
            frame.layers = layers
        score.sound = track.sound_info()
    return score


class TrackStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self._tracks: dict[str, StoredTrack] = {}
        self.reload()

    def reload(self) -> None:
        from app.ingest.catalog import load_catalog  # local import: catalog → schemas only

        sounds: dict[str, tuple[SoundSpec | None, int]] = {}
        catalog_path = get_settings().catalog_path
        if catalog_path.exists():
            for i, entry in enumerate(load_catalog(catalog_path).tracks):
                sounds[entry.id] = (entry.sound, i)
        tracks: dict[str, StoredTrack] = {}
        if self.root.exists():
            for meta_path in sorted(self.root.glob("*/meta.json")):
                try:
                    meta = TrackMeta.model_validate(json.loads(meta_path.read_text(encoding="utf-8")))
                    grids = np.load(meta_path.parent / "grids.npy")
                    sound, order = sounds.get(meta.id, (None, 999))
                    tracks[meta.id] = StoredTrack(
                        meta=meta, path=meta_path.parent, grids=grids, sound=sound, order=order
                    )
                except Exception:
                    log.exception("Skipping unreadable track at %s", meta_path.parent)
        self._tracks = dict(sorted(tracks.items(), key=lambda kv: (kv[1].order, kv[0])))
        _score.cache_clear()
        log.info("Loaded %d tracks from %s", len(self._tracks), self.root)

    def all(self) -> list[StoredTrack]:
        return list(self._tracks.values())

    def get(self, track_id: str) -> StoredTrack | None:
        return self._tracks.get(track_id)


@lru_cache
def get_store() -> TrackStore:
    return TrackStore(get_settings().tracks_dir)
