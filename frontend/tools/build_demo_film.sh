#!/usr/bin/env bash
# Build the TerraTunes demo film: real screen recording, cut fast, under 30 seconds.
#
#   ./tools/build_demo_film.sh /path/to/promo [out.mp4]
#
# Everything but the opening shot and the end card is one continuous recording
# of the running site driving itself (`?promo=1`, src/lib/promoDirector.ts), so
# the disc flight, the deck iris, the preset switching and the playhead are the
# product's own animations. Speed, cut points and the end-card length are
# derived from the shot table, so the film lands on exactly 30.00 s.
#
# Tables expected in $SRC:
#   shots.txt      kind  source_in  source_dur     (cine | cap | card)
#   captions.txt   start  end  card-name
#   labels.txt     start  end  card-name
set -euo pipefail

SRC="${1:?usage: build_demo_film.sh /path/to/promo [out.mp4]}"
OUT="${2:-$SRC/terratunes-demo-30s.mp4}"
C="$SRC/cards"
FPS=30
TOTAL=30.0
X=0.12                      # dissolve between shots
VO_START=0.5
SON_START=8.6               # the record starts to speak near the needle drop
SON_IN=20.0                 # the musical window inside the real render
BED_IN=4.0
num=$(awk "BEGIN{print $1}")

# ---------------------------------------------------------- shot arithmetic --
# the capture shots share one speed, solved so the film is exactly TOTAL long
read -r CINE CARD SPEED <<EOF
$(awk '
  $1=="cine"{cine+=$3} $1=="card"{card+=$3} $1=="cap"{src+=$3; n++}
  END{n++            # the card is joined with a dissolve too
     speed=src/(TARGET-cine-card+(n-1)*X)
     printf "%.2f %.2f %.4f\n", cine, card, speed
  }' TARGET="$TOTAL" X="$X" "$SRC/shots.txt")
EOF

declare -a OFF DUR KIND
t=0; i=0
while read -r kind in dur; do
  if [[ -z "${kind:-}" || "$kind" == "#"* ]]; then continue; fi
  if [[ "$kind" == "cap" ]]; then d=$(awk "BEGIN{printf \"%.3f\", $dur / $SPEED}")
  else d=$dur; fi
  KIND[$i]=$kind; SRC_IN[$i]=$in; SRC_DUR[$i]=$dur; DUR[$i]=$d
  OFF[$i]=$(awk "BEGIN{printf \"%.3f\", $t}")
  t=$(awk "BEGIN{printf \"%.3f\", $t + $d - $X}")
  i=$((i+1))
done < <(grep -vE '^\s*(#|$)' "$SRC/shots.txt")
LAST=$((i-1))
echo ">> ${#DUR[@]} shots, capture at ${SPEED}x, dissolve ${X}s, total $(awk "BEGIN{printf \"%.2f\", $t + ${DUR[$LAST]}}")s"

# ------------------------------------------------------------------- inputs --
inputs=(-i "$SRC/shotA.mp4" -i "$SRC/capture.mp4")
for k in $(seq 0 $LAST); do
  if [[ "${KIND[$k]}" == "card" ]]; then inputs+=(-loop 1 -framerate $FPS -t "${DUR[$k]}" -i "$C/endcard.png"); fi
done
n=2
declare -A INOF
for k in $(seq 0 $LAST); do
  if [[ "${KIND[$k]}" == "card" ]]; then INOF[$k]=$n; n=$((n+1)); fi
done

V=""
for k in $(seq 0 $LAST); do
  case "${KIND[$k]}" in
    cine) V+="[$((0)):v]scale=1920:1080:flags=lanczos,fps=$FPS,setsar=1,trim=0:${DUR[$k]},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.35,scale=1920:1080[a$k];";;
    cap)  end=$(awk "BEGIN{printf \"%.2f\", ${SRC_IN[$k]} + ${SRC_DUR[$k]}}")
          V+="[1:v]fps=$FPS,setsar=1,trim=${SRC_IN[$k]}:$end,setpts=(PTS-STARTPTS)/$SPEED,eq=brightness=0.012:saturation=1.05[a$k];";;
    card) V+="[${INOF[$k]}:v]fps=$FPS,setsar=1,trim=0:${DUR[$k]},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.30[a$k];";;
  esac
done

chain=a0
for k in $(seq 1 $LAST); do
  V+="[$chain][a$k]xfade=transition=fade:duration=$X:offset=${OFF[$k]}[x$k];"
  chain="x$k"
done

# ------------------------------------------------------------ overlays/text --
m=$n
while read -r st en name; do
  if [[ -z "${st:-}" || "$st" == "#"* ]]; then continue; fi
  win=$(awk "BEGIN{printf \"%.3f\", $en - $st}")
  fo=$(awk "BEGIN{printf \"%.3f\", $win - 0.26}")
  file=$C/$name.png
  inputs+=(-loop 1 -framerate $FPS -t "$win" -i "$file")
  V+="[$m:v]fps=$FPS,format=rgba,fade=t=in:st=0:d=0.20,fade=t=out:st=$fo:d=0.26,setpts=PTS+$st/TB[ov$m];"
  V+="[$chain][ov$m]overlay=eof_action=pass:repeatlast=0[v$m];"
  chain="v$m"; m=$((m+1))
done < <(grep -vE '^\s*(#|$)' "$SRC/captions.txt" "$SRC/labels.txt" 2>/dev/null | awk '{print}' )

V+="[$chain]format=yuv420p[vout];"

# ----------------------------------------------------------------- the mix ---
# the sonification is the show; the bed is deliberately band-limited and quiet
# so the measured notes have the middle of the spectrum to themselves
nvo=$m; nson=$((m+1)); nbed=$((m+2))
inputs+=(-i "$SRC/$VO" -i "$SRC/son.mp3" -i "$SRC/bed.mp3")
SON_DUR=$(awk "BEGIN{printf \"%.2f\", $TOTAL - $SON_START - 0.4}")

cat > "$SRC/filmgraph.txt" <<FILT
$V
[$nvo:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=90,acompressor=threshold=0.08:ratio=3:attack=25:release=220:makeup=1.7,volume=1.6,adelay=$(awk "BEGIN{printf \"%d|%d\", $VO_START*1000, $VO_START*1000}"),apad=whole_dur=$TOTAL[nar];
[nar]asplit=3[narMix][narK1][narK2];
[$nson:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=$SON_IN:$(awk "BEGIN{printf \"%.2f\", $SON_IN + $SON_DUR + 2}"),asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.7,afade=t=out:st=$(awk "BEGIN{printf \"%.2f\", $SON_DUR - 1.6}"):d=1.6,volume=1.75,dynaudnorm=f=200:g=9:p=0.35,adelay=$(awk "BEGIN{printf \"%d|%d\", $SON_START*1000, $SON_START*1000}")[sonw];
[sonw][narK1]sidechaincompress=threshold=0.05:ratio=4:attack=45:release=380:makeup=1[son];
[$nbed:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=$BED_IN:$(awk "BEGIN{printf \"%.2f\", $BED_IN + $TOTAL}"),asetpts=PTS-STARTPTS,highpass=f=110,lowpass=f=2400,afade=t=in:st=0:d=1.0,afade=t=out:st=$(awk "BEGIN{printf \"%.2f\", $TOTAL - 4.4}"):d=4.2,volume=0.085[bedw];
[bedw][narK2]sidechaincompress=threshold=0.05:ratio=6:attack=40:release=400:makeup=1[bed];
[bed][son][narMix]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0[mix];
[mix]atrim=0:$TOTAL,asetpts=PTS-STARTPTS,afade=t=out:st=$(awk "BEGIN{printf \"%.2f\", $TOTAL - 1.4}"):d=1.4,loudnorm=I=-15:TP=-1.5:LRA=11[aout]
FILT

# -------------------------------------------------------------------- build --
echo ">> assembling $OUT"
ffmpeg -hide_banner -v error -y "${inputs[@]}" -filter_complex_script "$SRC/filmgraph.txt" \
  -map "[vout]" -map "[aout]" -t $TOTAL \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r $FPS \
  -g 60 -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of default=nw=1 "$OUT" | sed 's/^/   /'
printf '>> shot map\n'
for k in $(seq 0 $LAST); do printf '   %2d %-4s film %5.2f-%5.2f  src %s+%s\n' "$k" "${KIND[$k]}" "${OFF[$k]}" "$(awk "BEGIN{printf \"%.2f\", ${OFF[$k]}+${DUR[$k]}}")" "${SRC_IN[$k]}" "${SRC_DUR[$k]}"; done
echo ">> done: $OUT"
