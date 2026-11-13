#!/usr/bin/env bash
# Build the animated character assets for the meadow girl.
#
# Input:  a 15s chroma-green plate of the girl. The plate is one continuous
#         piece of business — waving (0-3.5s), pointing (4-6.8s), sitting down
#         and shrugging in her headphones (7-11.3s), then listening still
#         (11.4-15s) — so the windows below are cut to the STEADY part of each
#         action. The transitions in between are what made her appear to stand
#         up and sit back down inside the "listen" loop. Kept OUT of git; only
#         the keyed output below is committed.
# Output: public/video/girl-{greet,point,listen}.webm   alpha VP9, seamless loop
#         public/art/girl-{greet,point,listen}.webp     keyed still, the fallback
#
# Usage: ./tools/build_girl_assets.sh /path/to/girl_raw.mp4
#
# Every ffmpeg call is -y on purpose: this script's whole job is to replace the
# assets it made last time, and an interactive "File exists. Overwrite?" prompt
# on stdin will sit there forever inside a background job.
set -euo pipefail

SRC=${1:?"usage: build_girl_assets.sh <girl_raw.mp4>"}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
KEY=0x03c005          # the plate's green, sampled from the source corners
FPS=12                # 12 fps is plenty for an idle character and halves the weight

trap 'rm -rf "$WORK"' EXIT

echo ">> 1/3  keying the plate (fps=$FPS) and writing a still per pose"
ffmpeg -hide_banner -loglevel error -y -i "$SRC" \
  -vf "fps=$FPS,scale=400:-2,chromakey=$KEY:0.17:0.08,format=rgba" "$WORK/f%04d.png"

python3 - "$WORK" "$ROOT/public" <<'PY'
"""Crop each pose to its own stable bounding box, then loop it seamlessly."""
from __future__ import annotations
import os, shutil, sys
from PIL import Image

work, pub = sys.argv[1], sys.argv[2]
frames = sorted(f for f in os.listdir(work) if f.endswith('.png'))
n = len(frames)
imgs = [Image.open(os.path.join(work, f)).convert('RGBA') for f in frames]
W, H = imgs[0].size

# pose windows, in seconds on the source plate -> frame indices
SEGMENTS = {'greet': (0.2, 3.5), 'point': (4.0, 6.8), 'listen': (11.4, None)}
OUTV = os.path.join(pub, 'video')
OUTA = os.path.join(pub, 'art')
os.makedirs(OUTV, exist_ok=True)
os.makedirs(OUTA, exist_ok=True)

def bbox(seq):
    """Union of non-transparent pixels, with a little headroom."""
    lo_x, lo_y, hi_x, hi_y = W, H, 0, 0
    for im in seq:
        a = im.getchannel('A')
        box = a.getbbox()
        if not box:
            continue
        lo_x, lo_y = min(lo_x, box[0]), min(lo_y, box[1])
        hi_x, hi_y = max(hi_x, box[2]), max(hi_y, box[3])
    return max(0, lo_x - 4), max(0, lo_y - 4), min(W, hi_x + 4), min(H, hi_y + 4)

for pose, (t0, t1) in SEGMENTS.items():
    i0 = round(t0 * 12)
    i1 = n - 1 if t1 is None else min(n - 1, round(t1 * 12))
    seq = imgs[i0:i1 + 1]
    x0, y0, x1, y1 = bbox(seq)
    out = os.path.join(work, pose)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)

    # tight crop: the component anchors her by the bottom edge, so her feet or
    # crossed legs sit exactly on the ground in every pose
    box = (x0, y0, x1, y1)

    # forward, then reversed: a palindrome loop has no visible seam
    order = list(range(len(seq))) + list(range(len(seq) - 2, 0, -1))
    for k, idx in enumerate(order, start=1):
        seq[idx].crop(box).save(os.path.join(out, f'{k:04d}.png'))

    # the still is what she looks like standing still, so it comes from the
    # settled end of the action, not the middle of it: mid-wave, mid-point, and
    # headphones already on with her hand still at her ear
    still = seq[min(len(seq) - 1, int(len(seq) * 0.78))].crop(box)
    still.save(os.path.join(OUTA, f'girl-{pose}.webp'), 'WEBP', quality=92, method=6)
    print(f'  {pose:7s} frames {i0:3d}-{i1:3d}  box {box}  loop {len(order)}f')
PY

echo ">> 2/3  encoding alpha webm loops"
for pose in greet point listen; do
  ffmpeg -hide_banner -loglevel error -y -framerate 12 -i "$WORK/$pose/%04d.png" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf 34 -b:v 0 -an -auto-alt-ref 0 \
    "$ROOT/public/video/girl-$pose.webm"
done

echo ">> 3/3  sizes"
du -h "$ROOT"/public/video/girl-*.webm "$ROOT"/public/art/girl-*.webp
