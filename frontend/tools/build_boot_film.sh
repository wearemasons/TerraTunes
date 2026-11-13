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
SPEED=1.12
MATCH=14.45
# The picture is 16.83 s, but the sound is deliberately longer: the video freezes at
# $MATCH and the last sentence keeps playing over the live page. Fading inside the
# picture length is what cut the ending off before.
TWO=18.0
SRC_MATCH=$(awk -v m="$MATCH" -v s="$SPEED" 'BEGIN { printf "%.4f", m/s }')

echo ">> 1/4  poster and match frames"
ffmpeg -hide_banner -loglevel error -y -ss 0.10 -i "$SRC/film_raw.mp4" -frames:v 1 \
  -vf "scale=1280:720" -c:v libwebp -quality 82 "$OUT_A/boot-poster.webp"
ffmpeg -hide_banner -loglevel error -y -ss $SRC_MATCH -i "$SRC/film_raw.mp4" -frames:v 1 \
  -vf "scale=1280:720" -c:v libwebp -quality 86 "$OUT_A/boot-match.webp"

echo ">> 2/4  soundtrack: music arc + one window of real NASA sonification + narration"
# The bed has a dead patch in the middle, so the score is two windows of it
# joined by a cross-fade: the felt-piano opening, then the string build.
ffmpeg -hide_banner -loglevel error -y \
  -i "$SRC/music_bed.mp3" -i "$SRC/son_sst.mp3" -i "$SRC/narration2.wav" \
  -filter_complex "\
	[0:a]atrim=0:10,asetpts=PTS-STARTPTS,$AF[p1];\
	[0:a]atrim=38.5:53.0,asetpts=PTS-STARTPTS,$AF[p2];\
[p1][p2]acrossfade=d=1.5:c1=tri:c2=tri,$AF,volume=0.62[mus];\
	[1:a]atrim=3.7:8.8,asetpts=PTS-STARTPTS,$AF,highpass=f=90,lowpass=f=9000,afade=t=in:d=0.6,afade=t=out:st=4.1:d=0.9,volume=0.5,adelay=10400|10400[son];\
[mus][son]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,atrim=0:$TWO,asetpts=PTS-STARTPTS[bed];\
	[2:a]atempo=0.92,highpass=f=70,$AF,acompressor=threshold=0.09:ratio=3:attack=25:release=220:makeup=2,volume=1.9,adelay=250|250,asplit=2[nar1][nar2];\
[nar1]apad=whole_dur=$TWO[nar1p];\
[bed][nar1p]sidechaincompress=threshold=0.05:ratio=7:attack=40:release=420:makeup=1[duck];\
	[duck][nar2]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=in:d=0.5,afade=t=out:st=16.4:d=1.4,loudnorm=I=-16:TP=-1.5:LRA=9,atrim=0:$TWO[mix]" \
  -map "[mix]" -c:a pcm_s16le "$OUT_V/boot-film.wav"

ffmpeg -hide_banner -loglevel error -y -i "$OUT_V/boot-film.wav" \
  -c:a libmp3lame -q:a 3 -id3v2_version 3 -write_id3v1 0 "$OUT_V/boot-film.mp3"
rm -f "$OUT_V/boot-film.wav"

echo ">> 3/4  picture only (no audio track, so it can hold its last frame)"
ffmpeg -hide_banner -loglevel error -y -i "$SRC/film_raw.mp4" \
  -an -vf "setpts=${SPEED}*PTS,scale=1280:720,fps=24,format=yuv420p" \
  -c:v libx264 -preset slower -crf 30 -profile:v high -level 4.0 \
  -g 48 -movflags +faststart "$OUT_V/boot-film.mp4"

echo ">> 4/4  check"
ffprobe -v error -show_entries format=duration -show_entries stream=codec_type \
  -of default=nw=1 "$OUT_V/boot-film.mp4" | tr '\n' ' '; echo
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_V/boot-film.mp3"
ffmpeg -hide_banner -nostats -i "$OUT_V/boot-film.mp3" -af ebur128=framelog=quiet -f null - 2>&1 | tail -6
du -h "$OUT_V"/boot-film.* "$OUT_A"/boot-*.webp
