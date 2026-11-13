"""Sample evenly spaced frames from an SVS movie with PyAV (bundled ffmpeg, no system install)."""

import logging
from pathlib import Path

import av
from PIL import Image

log = logging.getLogger(__name__)


def count_frames(path: Path) -> int:
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        if stream.frames:
            return int(stream.frames)
        # Some files don't store a frame count: decode to count (fast with frame skipping off).
        return sum(1 for _ in container.decode(stream))


def sample_frames(
    path: Path, count: int, skip_edges: float = 0.02
) -> tuple[int, list[tuple[int, Image.Image]]]:
    """Return the movie's frame count and `count` (index, image) pairs spread evenly across it."""
    total = count_frames(path)
    first = int(total * skip_edges)
    last = max(first, total - 1 - int(total * skip_edges))
    if count == 1:
        wanted = [first]
    else:
        wanted = sorted({round(first + i * (last - first) / (count - 1)) for i in range(count)})
    log.info("  %s: %d frames, sampling %d", path.name, total, len(wanted))
    targets = set(wanted)
    out: list[tuple[int, Image.Image]] = []
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        for index, frame in enumerate(container.decode(stream)):
            if index in targets:
                out.append((index, frame.to_image()))  # type: ignore[no-untyped-call]
                if len(out) == len(targets):
                    break
    return total, out
