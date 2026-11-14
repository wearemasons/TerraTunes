#!/usr/bin/env bash
# Build the 30-second TerraTunes demo film.
#
#   ./tools/build_demo_film.sh /home/ubuntu/gen/promo [out.mp4]
#
# Everything on screen is the real product: `capture.mp4` is a straight
# screen recording of the site at 1920x1080 driving itself in promo mode
# (src/lib/promoDirector.ts), so the disc flight, the Data Deck iris and the
# playhead are the genuine animations. The two cinematic seconds are the
# only generated material, and the sound is a real TerraTunes render of the
# same record that is on screen, plus the studio bed and voiceover.
#
# Source material expected in $SRC:
#   capture.mp4        screen recording of the live site (~38s)
#   shotA.mp4          cinematic heat field
#   vo5.wav            voiceover
#   son.mp3            real render of record A-08 (sea surface temperature)
#   bed.mp3            music bed
#   cards/*.png        captions, corner labels and the end card (cards.py)
set -euo pipefail

SRC="${1:?usage: build_demo_film.sh /path/to/promo [out.mp4]}"
OUT="${2:-$SRC/terratunes-demo-30s.mp4}"
C="$SRC/cards"
FPS=30
CAPTION_FONTS_OK=1

# ---------------------------------------------------------------- timing ----
# eight shots, 0.25s dissolves between them, exactly 30.00s on the nose
DUR=(4.60 3.80 3.00 5.70 3.40 5.00 3.20 3.05)          # shot lengths
OFF=(0.00 4.35 7.90 10.65 16.10 19.25 24.00 26.95)     # start on the timeline
# source in-points of each capture slice, in seconds of capture.mp4
SRCIN=(3.30 5.90 8.85 17.80 21.40 30.50)

# captions: card start end
CAPS=(
  "1 0.60 4.30"
  "2 4.40 7.70"
  "3 7.85 9.90"
  "4 10.60 15.20"
  "5 15.90 19.00"
  "6 19.70 23.60"
  "7 24.30 26.90"
)
# corner labels: card start end
LABS=(
  "crate 4.90 7.70"
  "deck 17.20 23.90"
  "scan 24.30 26.90"
)

SON_START=9.60      # the record starts to speak with the needle
SON_IN=20.00        # the musical window inside the real render
SON_DUR=20.40
BED_IN=4.00
VO_START=0.60

# ------------------------------------------------------------------ video ----
V=""
V+="[0:v]scale=1920:1080:flags=lanczos,fps=$FPS,setsar=1,trim=0:${DUR[0]},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.45[a0];"

for i in 1 2 3 4 5 6; do
  in=${SRCIN[$((i-1))]}
  end=$(awk "BEGIN{printf \"%.2f\", $in + ${DUR[i]}}")
  V+="[1:v]fps=$FPS,setsar=1,trim=$in:$end,setpts=PTS-STARTPTS[a$i];"
done

V+="[2:v]fps=$FPS,setsar=1,trim=0:${DUR[7]},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.30[a7];"

prev=a0
for i in 1 2 3 4 5 6 7; do
  out="x$i"
  V+="[$prev][a$i]xfade=transition=fade:duration=0.25:offset=${OFF[$i]}[$out];"
  prev=$out
done

# overlays: each card is its own looped input, fading in and out on its own
# clock, then shifted to film time. eof_action=pass lets the film show through.
idx=3
chain=$prev
add_input() { ffmpeg_inputs+=(-loop 1 -framerate "$FPS" -t "$2" -i "$1"); }

ffmpeg_inputs=(-i "$SRC/shotA.mp4" -i "$SRC/capture.mp4" -loop 1 -framerate "$FPS" -t "${DUR[7]}" -i "$C/endcard.png")

for spec in "${CAPS[@]}" "${LABS[@]}"; do
  read -r name st en <<<"$spec"
  win=$(awk "BEGIN{printf \"%.2f\", $en - $st}")
  fout=$(awk "BEGIN{printf \"%.2f\", $win - 0.30}")
  file=$C/cap-$name.png
  [[ -e $file ]] || file=$C/lab-$name.png
  add_input "$file" "$win"
  V+="[${idx}:v]fps=$FPS,format=rgba,fade=t=in:st=0:d=0.22,fade=t=out:st=$fout:d=0.30,setpts=PTS+$st/TB[ov$idx];"
  V+="[$chain][ov$idx]overlay=eof_action=pass:repeatlast=0[vchain$idx];"
  chain="vchain$idx"
  idx=$((idx+1))
done

V+="[$chain]format=yuv420p[vout]"


# ------------------------------------------------------------------ audio ----
# the voice, the real render and the bed; the two music beds duck themselves
# to the voice so the words never have to fight the planet
nvo=$idx; nson=$((idx+1)); nbed=$((idx+2))
ffmpeg_inputs+=(-i "$SRC/vo5.wav" -i "$SRC/son.mp3" -i "$SRC/bed.mp3")
# one script holds the whole graph: ffmpeg takes either -filter_complex or
# -filter_complex_script, never both
GRAPH="$SRC/filmgraph.txt"
{
  printf '%s;\n' "$V"
  # the narration is padded with silence to the full 30s, because a sidechain
# whose key stream ends mid-film would take the whole mix down with it
cat <<FILT
[$nvo:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=70,acompressor=threshold=0.09:ratio=3:attack=25:release=220:makeup=1.6,volume=1.55,adelay=$(awk "BEGIN{printf \"%d|%d\", $VO_START*1000, $VO_START*1000}"),apad=whole_dur=30[nar];
[nar]asplit=3[narMix][narK1][narK2];
[$nson:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=$SON_IN:$(awk "BEGIN{printf \"%.2f\", $SON_IN + $SON_DUR}"),asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.9,afade=t=out:st=$(awk "BEGIN{printf \"%.2f\", $SON_DUR - 1.4}"):d=1.4,volume=1.05,adelay=$(awk "BEGIN{printf \"%d|%d\", $SON_START*1000, $SON_START*1000}")[sonw];
[sonw][narK1]sidechaincompress=threshold=0.045:ratio=7:attack=40:release=420:makeup=1[son];
[$nbed:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=$BED_IN:$(awk "BEGIN{printf \"%.2f\", $BED_IN + 30}"),asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.2,afade=t=out:st=25.6:d=4.2,volume=0.20[bedw];
[bedw][narK2]sidechaincompress=threshold=0.05:ratio=6:attack=40:release=400:makeup=1[bed];
[bed][son][narMix]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0[mix];
[mix]atrim=0:30.00,asetpts=PTS-STARTPTS,afade=t=out:st=28.60:d=1.40,loudnorm=I=-16:TP=-1.5:LRA=11[aout]
FILT
} >"$GRAPH"

# ------------------------------------------------------------------- build ---
echo ">> assembling $OUT"
ffmpeg -hide_banner -v error -y "${ffmpeg_inputs[@]}" \
  -filter_complex_script "$GRAPH" \
  -map "[vout]" -map "[aout]" -t 30 \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"

ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate \
  -of default=nw=1 "$OUT" | sed 's/^/   /'
echo ">> done: $OUT"
