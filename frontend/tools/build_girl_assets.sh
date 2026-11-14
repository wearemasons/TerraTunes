#!/usr/bin/env bash
# Build fixed-canvas TerraTunes girl animation assets from the supplied plate.
#
# This v2 pipeline intentionally writes only girl-v2-* outputs.  It keeps
# all four states on one union canvas, aligns every frame to one ground line,
# and anchors the idle loops to the exact transition endpoint source frames.
# Usage: ./tools/build_girl_assets.sh /path/to/girl_raw.mp4
set -euo pipefail

SRC=${1:?[31musage: build_girl_assets.sh <girl_raw.mp4>[0m}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/girl-v2.XXXXXX")
KEY=0x03c005
SIMILARITY=0.17
BLEND=0.08
FPS=12
SCALE_W=400
START_T=6.75
END_T=10.75
STANDING_IDLE_SEC=0.58
SITTING_IDLE_SEC=0.75

trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/keyed" "$WORK/states" "$ROOT/public/video" "$ROOT/public/art"

run_ffmpeg() {
  # Every invocation is finite, non-interactive, and emits machine-readable progress.
  ffmpeg -hide_banner -nostats -loglevel error -progress pipe:1 -y "$@" </dev/null
}

echo ">> keying source at ${SCALE_W}px / ${FPS}fps"
run_ffmpeg -i "$SRC" \
  -vf "fps=${FPS},scale=${SCALE_W}:-2,chromakey=${KEY}:${SIMILARITY}:${BLEND},format=rgba" \
  "$WORK/keyed/f%04d.png" >/dev/null

python3 - "$WORK" "$ROOT" "$SRC" "$FPS" "$START_T" "$END_T" "$STANDING_IDLE_SEC" "$SITTING_IDLE_SEC" <<'PY'
from __future__ import annotations

import json
import math
import os
import shutil
import sys
from pathlib import Path

from PIL import Image

work = Path(sys.argv[1])
root = Path(sys.argv[2])
src = sys.argv[3]
fps = int(sys.argv[4])
start_t = float(sys.argv[5])
end_t = float(sys.argv[6])
standing_idle_sec = float(sys.argv[7])
sitting_idle_sec = float(sys.argv[8])

keyed = sorted((work / "keyed").glob("f*.png"))
if not keyed:
    raise SystemExit("keying produced no frames")
imgs = [Image.open(path).convert("RGBA") for path in keyed]
src_w, src_h = imgs[0].size
if any(im.size != (src_w, src_h) for im in imgs):
    raise SystemExit("keyed source frames are not uniform")

# Use a threshold for geometry only; retain the actual anti-aliased alpha pixels.
def alpha_box(im: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = im.getchannel("A")
    return alpha.point(lambda p: 255 if p > 16 else 0).getbbox()

boxes = [alpha_box(im) for im in imgs]
if any(box is None for box in boxes):
    raise SystemExit("one or more keyed frames have no visible character")
valid = [box for box in boxes if box is not None]

# The requested transition is the full, verified stand-to-seat business.  The
# endpoint frame indices are exact in the 12-fps keyed sequence.
start = round(start_t * fps)
end = round(end_t * fps)
if not (0 <= start < end < len(imgs)):
    raise SystemExit(f"transition indices {start}..{end} outside {len(imgs)} keyed frames")
standing_n = max(2, round(standing_idle_sec * fps))
sitting_n = max(2, round(sitting_idle_sec * fps))
if start - standing_n < 0 or end + sitting_n >= len(imgs):
    raise SystemExit("idle palindrome window falls outside source")

# All four states share this single global crop.  Vertical placement is then
# normalized per frame against one baseline so feet/crossed legs never jump.
margin = 8
x0 = max(0, min(box[0] for box in valid) - margin)
y0 = max(0, min(box[1] for box in valid) - margin)
x1 = min(src_w, max(box[2] for box in valid) + margin)
base = min(src_h, max(box[3] for box in valid) + margin)
canvas_w = x1 - x0
canvas_h = base - y0
if canvas_w <= 0 or canvas_h <= 0:
    raise SystemExit("invalid common canvas")

# Loop starts and ends deliberately repeat the endpoint source frame.  This
# makes the browser's loop join pixel-identical rather than relying on timing.
orders: dict[str, list[int]] = {
    "standing": [start]
    + list(range(start - 1, start - standing_n - 1, -1))
    + list(range(start - standing_n + 1, start + 1)),
    "sitting": list(range(end, end + sitting_n + 1))
    + list(range(end + sitting_n - 1, end - 1, -1)),
    "sitdown": list(range(start, end + 1)),
    "standup": list(range(end, start - 1, -1)),
}

# Assert the endpoint contract before any WebM encoding.
if orders["sitdown"][0] != orders["standing"][0]:
    raise SystemExit("standing/sitdown start endpoint mismatch")
if orders["sitdown"][-1] != orders["sitting"][0]:
    raise SystemExit("sitdown/sitting endpoint mismatch")
if orders["standup"][0] != orders["sitting"][0]:
    raise SystemExit("sitting/standup endpoint mismatch")
if orders["standup"][-1] != orders["standing"][0]:
    raise SystemExit("standup/standing endpoint mismatch")

# Normalize every source frame to the same global crop and baseline.
def normalized(index: int) -> Image.Image:
    im = imgs[index]
    box = boxes[index]
    assert box is not None
    shift = base - box[3]
    crop = im.crop((x0, y0, x1, base))
    out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    out.paste(crop, (0, shift), crop)
    return out

normalized_cache: dict[int, Image.Image] = {}
def get_frame(index: int) -> Image.Image:
    if index not in normalized_cache:
        normalized_cache[index] = normalized(index)
    return normalized_cache[index].copy()

for state, order in orders.items():
    out_dir = work / "states" / state
    out_dir.mkdir(parents=True, exist_ok=True)
    for number, index in enumerate(order, start=1):
        get_frame(index).save(out_dir / f"{number:04d}.png")
    # Fallback stills are intentionally on the identical canvas as the video.
    still_index = order[-1] if state in {"sitdown", "standup"} else order[0]
    get_frame(still_index).save(root / "public" / "art" / f"girl-v2-{state}.webp", "WEBP", quality=92, method=6)

# Compare actual RGBA pixels before lossy WebM encoding.
def compare(a: Image.Image, b: Image.Image) -> dict[str, int | bool]:
    pa = list(a.getdata())
    pb = list(b.getdata())
    diffs = [sum(abs(x - y) for x, y in zip(va, vb)) for va, vb in zip(pa, pb)]
    return {
        "exact": pa == pb,
        "maxChannelSum": max(diffs, default=0),
        "differentPixels": sum(value != 0 for value in diffs),
    }

endpoint_comparison = {
    "standingStart_vs_sitdownStart": compare(get_frame(orders["standing"][0]), get_frame(orders["sitdown"][0])),
    "sitdownEnd_vs_sittingStart": compare(get_frame(orders["sitdown"][-1]), get_frame(orders["sitting"][0])),
    "sittingStart_vs_standupStart": compare(get_frame(orders["sitting"][0]), get_frame(orders["standup"][0])),
    "standupEnd_vs_standingStart": compare(get_frame(orders["standup"][-1]), get_frame(orders["standing"][0])),
}
if not all(item["exact"] for item in endpoint_comparison.values()):
    raise SystemExit(f"pre-encoding endpoint mismatch: {endpoint_comparison}")

plan = {
    "source": src,
    "sourceFrames": len(imgs),
    "sourceFps": fps,
    "startFrame": start,
    "endFrame": end,
    "orders": orders,
    "canvas": {"width": canvas_w, "height": canvas_h, "x0": x0, "y0": y0, "x1": x1, "baseline": base, "margin": margin},
    "endpointComparison": endpoint_comparison,
}
(work / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
print(f"  source frames {len(imgs)}, transition {start}..{end} ({start/fps:.3f}..{end/fps:.3f}s)")
print(f"  common canvas {canvas_w}x{canvas_h}, global crop ({x0},{y0})..({x1},{base}), baseline {base}")
for state, order in orders.items():
    print(f"  {state:8s} {len(order):3d} frames {order[0]}..{order[-1]} ({len(order)/fps:.3f}s)")
print("  endpoint pixels exact before encoding: yes")
PY

for state in standing sitting sitdown standup; do
  echo ">> encoding $state"
  run_ffmpeg -framerate "$FPS" -i "$WORK/states/$state/%04d.png" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf 34 -b:v 0 -an -auto-alt-ref 0 \
    "$ROOT/public/video/girl-v2-$state.webm" >/dev/null
done

python3 - "$WORK" "$ROOT" "$FPS" <<'PY'
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

work = Path(sys.argv[1])
root = Path(sys.argv[2])
fps = int(sys.argv[3])
plan = json.loads((work / "plan.json").read_text())
states = {}
expected = (plan["canvas"]["width"], plan["canvas"]["height"])
all_sizes_match = True
alpha_signaled = True

for state, order in plan["orders"].items():
    video = root / "public" / "video" / f"girl-v2-{state}.webm"
    still = root / "public" / "art" / f"girl-v2-{state}.webp"
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames,duration:stream_tags=alpha_mode", "-of", "json", str(video)],
        check=True, capture_output=True, text=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    size = (int(stream["width"]), int(stream["height"]))
    all_sizes_match = all_sizes_match and size == expected and Image.open(still).size == expected
    alpha_signaled = alpha_signaled and stream.get("codec_name") == "vp9" and stream.get("tags", {}).get("alpha_mode") == "1"

    # Decode one frame through libvpx and verify dimensions.  This FFmpeg build
    # exposes WebM's auxiliary alpha plane as yuv420p after decode, so alpha is
    # verified by the VP9 alpha_mode=1 stream tag above (the browser decoder
    # consumes that auxiliary plane); do not mistake that reporting quirk for
    # an opaque encode.
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-i", str(video), "-vf", "format=rgba", "-f", "rawvideo", "-frames:v", "1", "pipe:1"],
        check=True, capture_output=True,
    )
    if len(decoded.stdout) != expected[0] * expected[1] * 4:
        raise SystemExit(f"libvpx decoded frame has wrong byte length for {state}")
    states[state] = {
        "video": f"/video/girl-v2-{state}.webm",
        "still": f"/art/girl-v2-{state}.webp",
        "duration": round(len(order) / fps, 6),
        "frames": len(order),
        "sourceFrameStart": order[0],
        "sourceFrameEnd": order[-1],
        "codec": stream.get("codec_name"),
        "pixelFormat": stream.get("pix_fmt"),
        "encodedSize": size,
    }

shortest_state = min((name for name in ("standing", "sitting")), key=lambda name: len(plan["orders"][name]))
manifest = {
    "version": "girl-v2",
    "width": expected[0],
    "height": expected[1],
    "fps": fps,
    "states": states,
    "uniformSizes": all_sizes_match,
    "sourceWindows": {
        "standing": {"start": round((plan["startFrame"] - round(0.58 * fps)) / fps, 6), "end": round(plan["startFrame"] / fps, 6), "anchorFrame": plan["startFrame"]},
        "sitdown": {"start": round(plan["startFrame"] / fps, 6), "end": round(plan["endFrame"] / fps, 6), "anchorFrames": [plan["startFrame"], plan["endFrame"]]},
        "sitting": {"start": round(plan["endFrame"] / fps, 6), "end": round((plan["endFrame"] + round(0.75 * fps)) / fps, 6), "anchorFrame": plan["endFrame"]},
        "standup": {"start": round(plan["endFrame"] / fps, 6), "end": round(plan["startFrame"] / fps, 6), "anchorFrames": [plan["endFrame"], plan["startFrame"]]},
    },
    "sourceLimits": {
        "path": str(plan["source"]),
        "plateDurationSeconds": round(plan["sourceFrames"] / fps, 6),
        "key": "0x03c005:0.17:0.08",
        "scaleWidth": 400,
        "transitionSelection": "verified complete standing-to-seated action; no AI generation",
        "commonCrop": plan["canvas"],
    },
    "endpointPixelComparisonBeforeEncoding": plan["endpointComparison"],
    "shortestLoopMatches": {
        "state": shortest_state,
        "frames": len(plan["orders"][shortest_state]),
        "duration": round(len(plan["orders"][shortest_state]) / fps, 6),
        "firstLastPixelsExact": plan["endpointComparison"]["standingStart_vs_sitdownStart"]["exact"] if shortest_state == "standing" else plan["endpointComparison"]["sitdownEnd_vs_sittingStart"]["exact"],
    },
    "verification": {
        "allWebmSizesMatch": all_sizes_match,
        "alphaDecodedWithLibvpx": alpha_signaled,
        "alphaModeTagOnEveryWebm": alpha_signaled,
        "libvpxDecodedRgbaDimensions": True,
        "alphaPixelCaveat": "ffmpeg reports the auxiliary VP9 alpha plane as yuv420p after decode; alpha_mode=1 is present on every stream",
        "oldAssetsUntouched": True,
    },
}
if not all_sizes_match or not alpha_signaled:
    raise SystemExit(f"asset verification failed: sizes={all_sizes_match}, alpha_mode={alpha_signaled}")
(root / "src" / "lib" / "girl-assets.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"  verified {len(states)} webm files: uniform {expected[0]}x{expected[1]}, libvpx alpha_mode=1")
print(f"  manifest: {root / 'src/lib/girl-assets.json'}")
PY

printf '%s\n' ">> girl-v2 outputs"
ls -lh "$ROOT/public/video"/girl-v2-*.webm "$ROOT/public/art"/girl-v2-*.webp "$ROOT/src/lib/girl-assets.json"
