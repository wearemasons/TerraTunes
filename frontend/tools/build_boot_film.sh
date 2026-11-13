#!/usr/bin/env bash
# Build the opening film that plays before the cabinet is ever touched.
#
# Inputs (generated offline, deliberately NOT in git):
#   film_raw.mp4     15s 1280x720 animated cut scene
#   music_bed.mp3    ~68s instrumental bed
#   son_sst.mp3      a real TerraTunes render (mapping_version 14) of NASA sea
#                    surface temperature:
#                    /tracks/sea-surface-temperature/render?mode=sweep&format=mp3&melody=true
#   narration2.wav   the four sentences of the film
#
# Outputs (committed, in frontend/public):
#   video/boot-film.mp4        picture only, no audio: the picture can freeze on
#                              its match frame while the last line is still being
#                              spoken over the live page
#   video/boot-film.mp3        narration + music + one scanned frame of real Earth data
#   art/boot-poster.webp       first frame, so the overlay never flashes white
#   art/boot-match.webp        the frame the live cabinet is matched to at 12.9s
#
# Usage: ./tools/build_boot_film.sh <workdir-with-the-four-inputs>
set -euo pipefail

SRC=${1:?"usage: build_boot_film.sh <directory holding the raw inputs>"}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT_V=$ROOT/public/video
OUT_A=$ROOT/public/art
mkdir -p "$OUT_V" "$OUT_A"
AF="aformat=sample_rates=48000:channel_layouts=stereo"

# Handoff: the film freezes here and the live page cross-fades in underneath.
# 12.90s is the frame where the painted girl, the glowing cabinet and the
# aurora sit in the same places the React components put them.
MATCH=12.90
TWO=15.0

echo ">> 1/4  poster and match frames"
ffmpeg -hide_banner -loglevel error -y -ss 0.10 -i "$SRC/film_raw.mp4" -frames:v 1 \
  -vf "scale=1280:720" -c:v libwebp -quality 82 "$OUT_A/boot-poster.webp"
ffmpeg -hide_banner -loglevel error -y -ss $MATCH -i "$SRC/film_raw.mp4" -frames:v 1 \
  -vf "scale=1280:720" -c:v libwebp -quality 86 "$OUT_A/boot-match.webp"

echo ">> 2/4  soundtrack: music arc + one window of real NASA sonification + narration"
# The bed has a dead patch in the middle, so the score is two windows of it
# joined by a cross-fade: the felt-piano opening, then the string build.
ffmpeg -hide_banner -loglevel error -y \
  -i "$SRC/music_bed.mp3" -i "$SRC/son_sst.mp3" -i "$SRC/narration2.wav" \
  -filter_complex "\
[0:a]atrim=0:8.5,asetpts=PTS-STARTPTS,$AF[p1];\
[0:a]atrim=38.5:48.5,asetpts=PTS-STARTPTS,$AF[p2];\
[p1][p2]acrossfade=d=1.5:c1=tri:c2=tri,$AF,volume=0.62[mus];\
[1:a]atrim=3.7:8.3,asetpts=PTS-STARTPTS,$AF,highpass=f=90,lowpass=f=9000,afade=t=in:d=0.6,afade=t=out:st=3.7:d=0.9,volume=0.5,adelay=9400|9400[son];\
[mus][son]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,atrim=0:$TWO,asetpts=PTS-STARTPTS[bed];\
[2:a]atempo=1.05,highpass=f=70,$AF,acompressor=threshold=0.09:ratio=3:attack=25:release=220:makeup=2,volume=1.9,adelay=200|200,asplit=2[nar1][nar2];\
[bed][nar1]sidechaincompress=threshold=0.05:ratio=7:attack=40:release=420:makeup=1[duck];\
[duck][nar2]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=in:d=0.5,afade=t=out:st=13.6:d=1.4,loudnorm=I=-16:TP=-1.5:LRA=9,atrim=0:$TWO[mix]" \
  -map "[mix]" -c:a pcm_s16le "$OUT_V/boot-film.wav"

ffmpeg -hide_banner -loglevel error -y -i "$OUT_V/boot-film.wav" \
  -c:a libmp3lame -q:a 3 -id3v2_version 3 -write_id3v1 0 "$OUT_V/boot-film.mp3"
rm -f "$OUT_V/boot-film.wav"

echo ">> 3/4  picture only (no audio track, so it can hold its last frame)"
ffmpeg -hide_banner -loglevel error -y -i "$SRC/film_raw.mp4" \
  -an -vf "scale=1280:720,fps=24,format=yuv420p" \
  -c:v libx264 -preset slower -crf 30 -profile:v high -level 4.0 \
  -g 48 -movflags +faststart "$OUT_V/boot-film.mp4"

echo ">> 4/4  check"
ffprobe -v error -show_entries format=duration -show_entries stream=codec_type \
  -of default=nw=1 "$OUT_V/boot-film.mp4" | tr '\n' ' '; echo
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_V/boot-film.mp3"
ffmpeg -hide_banner -nostats -i "$OUT_V/boot-film.mp3" -af ebur128=framelog=quiet -f null - 2>&1 | tail -6
du -h "$OUT_V"/boot-film.* "$OUT_A"/boot-*.webp
