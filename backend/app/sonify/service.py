"""Render-on-demand with a disk cache: data/cache/audio/<id>-<mode>-<melody>-v<mapping>-<grids mtime>.<fmt>."""

import logging
import threading
import time
from pathlib import Path
from typing import Literal

from app.core.config import get_settings
from app.mapping.rules import MAPPING_VERSION
from app.sonify.render import Mode, encode, render
from app.store import StoredTrack

log = logging.getLogger(__name__)
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()


def audio_path(track: StoredTrack, mode: Mode, fmt: Literal["wav", "mp3"], melody: bool) -> Path:
    stamp = (track.path / "grids.npy").stat().st_mtime_ns
    name = f"{track.meta.id}-{mode}-{'melody' if melody else 'nature'}-v{MAPPING_VERSION}-{stamp}.{fmt}"
    return get_settings().data_dir / "cache" / "audio" / name


def render_file(track: StoredTrack, mode: Mode, fmt: Literal["wav", "mp3"], melody: bool) -> Path:
    if track.sound is None:
        raise ValueError(f"Track {track.meta.id} has no sound spec in the catalog")
    path = audio_path(track, mode, fmt, melody)
    if path.exists():
        return path
    with _guard:
        lock = _locks.setdefault(str(path), threading.Lock())
    with lock:
        if path.exists():
            return path
        start = time.perf_counter()
        score = track.score("musical")
        layers = [f.layers for f in score.frames if f.layers is not None]
        audio = render(
            track_id=track.meta.id, score=score, layers=layers, spec=track.sound, mode=mode, melody=melody
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(encode(audio, fmt))
        tmp.replace(path)
        log.info(
            "Rendered %s in %.1f s (%.1f MB)",
            path.name,
            time.perf_counter() - start,
            path.stat().st_size / 1e6,
        )
    return path
