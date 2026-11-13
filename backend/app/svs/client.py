"""Polite client for NASA's Scientific Visualization Studio (svs.gsfc.nasa.gov).

- JSON pages come from /api/<id> and are cached on disk (data/raw/svs_api/<id>.json).
- Downloads stream to disk, resume when possible and are skipped when already complete.
- Requests are spaced by `svs_min_interval_s` to stay gentle on a public server.
"""

import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class MediaItem:
    media_type: str  # "Image" | "Movie" | "Frames" | ...
    filename: str
    url: str
    width: int | None
    height: int | None
    alt_text: str

    @property
    def is_flat_map(self) -> bool:
        """Equirectangular world maps are exactly 2:1."""
        return bool(self.width and self.height and abs(self.width / self.height - 2) < 0.02)


@dataclass(frozen=True)
class LinkedPage:
    id: int
    page_type: str
    title: str


class SvsClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.cache_dir = self.settings.raw_dir / "svs_api"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._last = 0.0
        self._http = httpx.Client(
            base_url=self.settings.svs_base_url,
            headers={"User-Agent": self.settings.svs_user_agent},
            timeout=self.settings.svs_timeout_s,
            follow_redirects=True,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "SvsClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _wait(self) -> None:
        delay = self.settings.svs_min_interval_s - (time.monotonic() - self._last)
        if delay > 0:
            time.sleep(delay)
        self._last = time.monotonic()

    def _get(self, url: str, **kwargs: Any) -> httpx.Response:
        for attempt in range(4):
            self._wait()
            try:
                response = self._http.get(url, **kwargs)
                if response.status_code < 500:
                    return response
                log.warning("SVS %s returned %s (attempt %d)", url, response.status_code, attempt + 1)
            except httpx.TransportError as exc:
                log.warning("SVS %s failed: %s (attempt %d)", url, exc, attempt + 1)
            time.sleep(2**attempt)
        raise RuntimeError(f"SVS request kept failing: {url}")

    # --- pages ---
    def page(self, page_id: int, *, refresh: bool = False) -> dict[str, Any]:
        path = self.cache_dir / f"{page_id}.json"
        if path.exists() and not refresh:
            return json.loads(path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]
        response = self._get(f"/api/{page_id}")
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        return data

    @staticmethod
    def media(page: dict[str, Any]) -> list[MediaItem]:
        items: list[MediaItem] = []
        for group in page.get("media_groups", []):
            for item in group.get("items", []):
                inst = item.get("instance") or {}
                if not inst.get("media_type") or not inst.get("url"):
                    continue
                items.append(
                    MediaItem(
                        media_type=inst["media_type"],
                        filename=inst.get("filename") or "",
                        url=inst["url"].replace("http://", "https://", 1),
                        width=inst.get("width"),
                        height=inst.get("height"),
                        alt_text=inst.get("alt_text") or "",
                    )
                )
        return items

    @staticmethod
    def links(page: dict[str, Any]) -> list[LinkedPage]:
        out: list[LinkedPage] = []
        for group in page.get("media_groups", []):
            for item in group.get("items", []):
                inst = item.get("instance") or {}
                if inst.get("page_type") and inst.get("id"):
                    out.append(LinkedPage(inst["id"], inst["page_type"], inst.get("title") or ""))
        return out

    def frame_names(self, frames_url: str) -> list[str]:
        """File names inside an SVS frames directory listing."""
        response = self._get(frames_url)
        response.raise_for_status()
        return sorted(set(re.findall(r"\b(\d{4,}\.(?:png|jpg|tif))\b", response.text)))

    # --- files ---
    def download(self, url: str, dest: Path) -> Path:
        """Stream a file to disk. Resumes partial files; skips complete ones."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        part = dest.with_suffix(dest.suffix + ".part")
        if dest.exists():
            return dest
        offset = part.stat().st_size if part.exists() else 0
        headers = {"Range": f"bytes={offset}-"} if offset else {}
        self._wait()
        with self._http.stream("GET", url, headers=headers) as response:
            if response.status_code == 416:  # already complete
                part.rename(dest)
                return dest
            response.raise_for_status()
            mode = "ab" if response.status_code == 206 else "wb"
            total = int(response.headers.get("content-length", 0)) + (offset if mode == "ab" else 0)
            done = offset if mode == "ab" else 0
            last_report = time.monotonic()
            with part.open(mode) as fh:
                for chunk in response.iter_bytes(1 << 20):
                    fh.write(chunk)
                    done += len(chunk)
                    if time.monotonic() - last_report > 5:
                        last_report = time.monotonic()
                        pct = f"{100 * done / total:.0f}%" if total else f"{done >> 20} MB"
                        log.info("  downloading %s: %s", dest.name, pct)
        part.rename(dest)
        log.info("  saved %s (%.1f MB)", dest.name, dest.stat().st_size / 1e6)
        return dest
