"""TerraTunes data CLI.

uv run python -m app.cli discover            # crawl the EIC gallery, rank sonifiable visualizations
uv run python -m app.cli build               # build every enabled track in data/catalog.yaml
uv run python -m app.cli build surface-temperature pm25
uv run python -m app.cli list                # show built tracks
"""

import argparse
import json
import logging
import sys

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.ingest.catalog import load_catalog
from app.ingest.pipeline import build_track
from app.svs.client import SvsClient

EIC_GALLERY = 40467
SONIFIABLE = {"Visualization", "Animation", "Hyperwall Visual"}

log = logging.getLogger("terratunes.cli")


def discover(gallery_id: int) -> int:
    settings = get_settings()
    rows = []
    with SvsClient() as client:
        root = client.page(gallery_id)
        galleries = [root] + [
            client.page(link.id) for link in client.links(root) if link.page_type == "Gallery"
        ]
        seen: set[int] = set()
        for gallery in galleries:
            for link in client.links(gallery):
                if link.page_type not in SONIFIABLE or link.id in seen:
                    continue
                seen.add(link.id)
                page = client.page(link.id)
                media = client.media(page)
                movies = [m for m in media if m.media_type == "Movie" and m.is_flat_map]
                frames = [m for m in media if m.media_type == "Frames" and m.is_flat_map]
                bars = [m for m in media if m.media_type == "Image" and "colorbar" in m.filename.lower()]
                score = (3 if movies or frames else 0) + (2 if bars else 0)
                rows.append(
                    {
                        "svs_id": link.id,
                        "title": page["title"],
                        "from": gallery["title"],
                        "score": score,
                        "flat_movies": [m.filename for m in movies],
                        "colorbars": [m.filename for m in bars],
                        "updated": page.get("update_date"),
                    }
                )
    rows.sort(key=lambda r: (-r["score"], r["svs_id"]))
    out = settings.data_dir / "candidates.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in rows:
        print(
            f"{r['score']}  {r['svs_id']:>6}  {r['title'][:60]:<60}  movies={len(r['flat_movies'])} colorbars={len(r['colorbars'])}"
        )
    print(f"\n{len(rows)} visualizations. Details in {out}")
    return 0


def build(ids: list[str]) -> int:
    settings = get_settings()
    catalog = load_catalog(settings.catalog_path)
    entries = [e for e in catalog.tracks if (e.id in ids if ids else e.enabled)]
    missing = set(ids) - {e.id for e in entries}
    if missing:
        log.error("Not in catalog: %s", ", ".join(sorted(missing)))
        return 2
    failures = 0
    with SvsClient() as client:
        for entry in entries:
            try:
                build_track(entry, client, settings)
            except Exception:
                failures += 1
                log.exception("Failed to build %s", entry.id)
    log.info("Built %d of %d tracks", len(entries) - failures, len(entries))
    return 1 if failures else 0


def list_tracks() -> int:
    from app.store import get_store

    for track in get_store().all():
        m = track.meta
        print(f"{m.id:<28} {m.theme:<14} frames={track.frame_count:<3} {m.title}")
    return 0


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    parser = argparse.ArgumentParser(prog="terratunes")
    sub = parser.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover", help="Rank EIC visualizations by how well they can be sonified")
    d.add_argument("--gallery", type=int, default=EIC_GALLERY)
    b = sub.add_parser("build", help="Download and process catalog tracks")
    b.add_argument("ids", nargs="*")
    sub.add_parser("list", help="List built tracks")
    args = parser.parse_args(argv)
    if args.cmd == "discover":
        return discover(args.gallery)
    if args.cmd == "build":
        return build(args.ids)
    return list_tracks()


if __name__ == "__main__":
    sys.exit(main())
