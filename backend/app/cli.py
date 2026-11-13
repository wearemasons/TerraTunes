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
from typing import Literal

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.ingest.catalog import load_catalog
from app.ingest.pipeline import build_track
from app.sonify.render import Mode
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


def render_playlist(ids: list[str], modes: "list[Mode]", fmt: "Literal['wav', 'mp3']", melody: bool) -> int:
    """Render tracks and copy them to data/exports/playlist with captions and an .m3u playlist."""
    import shutil

    from app.mapping.rules import lower_first
    from app.sonify.render import FRAME_S, listening_guide
    from app.sonify.service import render_file
    from app.store import get_store

    settings = get_settings()
    out = settings.data_dir / "exports" / "playlist"
    if out.exists() and not ids:
        shutil.rmtree(out)  # full export: drop files from earlier numbering
    out.mkdir(parents=True, exist_ok=True)
    tracks = [t for t in get_store().all() if t.sound and (not ids or t.meta.id in ids)]
    m3u = ["#EXTM3U"]
    for n, track in enumerate(tracks, 1):
        detail = track.detail(None)
        score = track.score("musical")
        spec = track.sound
        assert spec is not None  # filtered above
        for mode in modes:
            src = render_file(track, mode, fmt, melody)
            name = f"{n:02d}-{track.meta.id}-{mode}"
            shutil.copyfile(src, out / f"{name}.{fmt}")
            frame_s = FRAME_S[mode]
            lines = [
                f"{track.meta.title} ({mode})",
                f"{detail.date_range}. {track.meta.credit}",
                "",
                detail.description,
                "",
                f"How to listen: {listening_guide(spec, lower_first(track.meta.legend.label), mode, melody)}",
                "",
                "Timeline:",
            ]
            for f, frame in enumerate(score.frames):
                t = f * frame_s
                stamp = f"{int(t // 60)}:{int(t % 60):02d}"
                notes = [frame.label]
                if frame.layers:
                    for a in frame.layers.alerts:
                        if a.new or f == 0:
                            notes.append(f"chime: {a.label} near {a.region}")
                    if frame.layers.regions:
                        r = frame.layers.regions[0]
                        notes.append(f"highest values near {r.region}")
                lines.append(f"  {stamp}  " + "; ".join(notes))
            (out / f"{name}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
            m3u += [f"#EXTINF:-1,{track.meta.title} ({mode})", f"{name}.{fmt}"]
            print(f"{name}.{fmt}  ({src.stat().st_size / 1e6:.1f} MB)")
    (out / "playlist.m3u").write_text("\n".join(m3u) + "\n", encoding="utf-8")
    print(f"\nPlaylist: {out}")
    return 0


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
    sm = sub.add_parser(
        "samples", help="Download orchestral samples (VSCO-2 CE, CC0) and export them for the browser"
    )
    sm.add_argument("--force", action="store_true")
    r = sub.add_parser("render", help="Render soundscapes to data/exports/playlist (with captions)")
    r.add_argument("ids", nargs="*")
    r.add_argument("--mode", choices=["sweep", "overview", "both"], default="both")
    r.add_argument("--format", choices=["mp3", "wav"], default="mp3")
    r.add_argument("--no-melody", action="store_true", help="Natural sounds and cues only")
    args = parser.parse_args(argv)
    if args.cmd == "discover":
        return discover(args.gallery)
    if args.cmd == "build":
        return build(args.ids)
    if args.cmd == "samples":
        from app.sonify.samples import export_web, fetch

        fetch(force=args.force)
        print(export_web(force=args.force))
        return 0
    if args.cmd == "render":
        modes: list[Mode] = ["sweep", "overview"] if args.mode == "both" else [args.mode]
        return render_playlist(args.ids, modes, args.format, not args.no_melody)
    return list_tracks()


if __name__ == "__main__":
    sys.exit(main())
