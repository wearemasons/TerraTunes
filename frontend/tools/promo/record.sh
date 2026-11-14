#!/usr/bin/env bash
# Record the real TerraTunes site driving itself at 1920x1080.
#   ./record.sh [seconds] [out.mp4]
set -euo pipefail
cd "$(dirname "$0")"
DUR="${1:-38}"
OUT="${2:-capture.mp4}"

# services must be up or the page records an error screen
curl -fsS -m 5 http://127.0.0.1:8000/healthz >/dev/null || { echo "API :8000 is down"; exit 1; }
curl -fsS -m 5 http://127.0.0.1:5173/ >/dev/null    || { echo "web :5173 is down"; exit 1; }

rm -f "$OUT" "$OUT.log"
ffmpeg -hide_banner -v error -y -f x11grab -framerate 30 \
  -video_size 1920x1080 -i :99.0+0,0 -t "$DUR" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "$OUT" &
rec=$!

sleep 1.2
node cdp.mjs --reload 'http://127.0.0.1:5173/?promo=1' >"$OUT.log" 2>&1 || echo "reload failed"
# a visible pointer, gliding to each control just before it is used
node pointer.mjs >"$OUT.pointer.log" 2>&1 &
ptr=$!
wait "$rec"; wait "$ptr" || true

ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
node cdp.mjs @probe.js >"$OUT.probe.json" 2>&1 || true
cat "$OUT.probe.json"
