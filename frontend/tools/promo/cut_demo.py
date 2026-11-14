#!/usr/bin/env python3
"""Cut the TerraTunes demo film from one continuous recording of the live site.

Reads three tables from the promo directory and lets ffmpeg do the rest:

    shots.txt       kind  source_in  source_seconds     (cine | cap | card)
    captions.txt    start  end  card-name
    labels.txt      start  end  card-name

Capture shots share one speed, solved so the film is exactly 30.00 s: the
product's own animations stay smooth, and the pace comes from cutting, not from
speeding a single shot past the point where the UI stops reading as real.
The mix puts the measured sonification in the middle of the spectrum and the
studio bed under it, band-limited and quiet, so the data is the loudest idea.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/gen/promo")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else SRC / "terratunes-demo-30s.mp4"
C = SRC / "cards"
FPS, TOTAL, XFADE = 30, 30.0, 0.12
VO, VO_START = "vo6t.wav", 0.5
SON, SON_IN, SON_START = "son.mp3", 20.0, 8.4
BED, BED_IN = "bed.mp3", 4.0


def rows(name: str) -> list[list[str]]:
    p = SRC / name
    return [ln.split() for ln in p.read_text().splitlines() if ln.strip() and not ln.startswith("#")]


shots = rows("shots.txt")
cine = sum(float(d) for k, _, d in shots if k == "cine")
card = sum(float(d) for k, _, d in shots if k == "card")
cap = sum(float(d) for k, _, d in shots if k == "cap")
speed = cap / (TOTAL - cine - card + (len(shots) - 1) * XFADE)

# film-time start and length of every shot
tl, t = [], 0.0
for kind, src_in, src_dur in shots:
    dur = float(src_dur) / speed if kind == "cap" else float(src_dur)
    tl.append((kind, float(src_in), float(src_dur), t, dur))
    t += dur - XFADE
print(f"speed {speed:.3f}x, {len(tl)} shots, film {(t + tl[-1][4]):.2f}s")

inputs: list[str] = ["-i", str(SRC / "shotA.mp4"), "-i", str(SRC / "capture.mp4")]
n_in = 2  # the index the next appended input will get
graph: list[str] = []
chain = "a0"

for i, (kind, src_in, src_dur, off, dur) in enumerate(tl):
    if kind == "cine":
        graph.append(
            f"[0:v]scale=1920:1080:flags=lanczos,fps={FPS},setsar=1,trim=0:{dur:.3f},"
            f"setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.35[a{i}]"
        )
    elif kind == "cap":
        graph.append(
            f"[1:v]fps={FPS},setsar=1,trim={src_in:.2f}:{src_in + src_dur:.2f},"
            f"setpts=(PTS-STARTPTS)/{speed:.4f},eq=brightness=0.012:saturation=1.06[a{i}]"
        )
    else:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", str(C / "endcard.png")]
        idx = n_in; n_in += 1
        graph.append(
            f"[{idx}:v]fps={FPS},setsar=1,trim=0:{dur:.3f},"
            f"setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.30[a{i}]"
        )
    if i:
        graph.append(f"[{chain}][a{i}]xfade=transition=fade:duration={XFADE}:offset={off:.3f}[x{i}]")
        chain = f"x{i}"

# burned captions and corner labels, each on its own clock
for name in ("captions.txt", "labels.txt"):
    for st, en, card_name in rows(name):
        win = float(en) - float(st)
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{win:.3f}", "-i", str(C / f"{card_name}.png")]
        idx = n_in; n_in += 1
        graph.append(
            f"[{idx}:v]fps={FPS},format=rgba,fade=t=in:st=0:d=0.18,"
            f"fade=t=out:st={win - 0.24:.3f}:d=0.24,setpts=PTS+{float(st):.3f}/TB[ov{idx}]"
        )
        graph.append(f"[{chain}][ov{idx}]overlay=eof_action=pass:repeatlast=0[v{idx}]")
        chain = f"v{idx}"
graph.append(f"[{chain}]format=yuv420p[vout]")

inputs += ["-i", str(SRC / VO), "-i", str(SRC / SON), "-i", str(SRC / BED)]
vo, son, bed = n_in, n_in + 1, n_in + 2
dl = int(VO_START * 1000)
son_dur = TOTAL - SON_START - 0.4
graph += [
    f"[{vo}:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=90,"
    f"acompressor=threshold=0.08:ratio=3:attack=25:release=220:makeup=1.7,volume=1.5,"
    f"adelay={dl}|{dl},apad=whole_dur={TOTAL}[nar]",
    "[nar]asplit=3[narMix][narK1][narK2]",
    f"[{son}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim={SON_IN}:{SON_IN + son_dur + 2:.2f},"
    f"asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.7,afade=t=out:st={son_dur - 1.5:.2f}:d=1.5,"
    f"volume=2.2,dynaudnorm=f=200:g=9:p=0.4,adelay={int(SON_START * 1000)}|{int(SON_START * 1000)}[sonw]",
    "[sonw][narK1]sidechaincompress=threshold=0.06:ratio=3:attack=45:release=350:makeup=1[son]",
    f"[{bed}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim={BED_IN}:{BED_IN + TOTAL:.2f},"
    f"asetpts=PTS-STARTPTS,highpass=f=120,lowpass=f=2200,afade=t=in:st=0:d=1.0,"
    f"afade=t=out:st={TOTAL - 4.4:.2f}:d=4.2,volume=0.075[bedw]",
    "[bedw][narK2]sidechaincompress=threshold=0.05:ratio=6:attack=40:release=400:makeup=1[bed]",
    "[bed][son][narMix]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0[mix]",
    f"[mix]atrim=0:{TOTAL},asetpts=PTS-STARTPTS,afade=t=out:st={TOTAL - 1.4:.2f}:d=1.4,"
    "loudnorm=I=-15:TP=-1.5:LRA=11[aout]",
]

cmd = ["ffmpeg", "-hide_banner", "-v", "error", "-y", *inputs,
       "-filter_complex", ";".join(graph), "-map", "[vout]", "-map", "[aout]",
       "-t", str(TOTAL), "-c:v", "libx264", "-preset", "medium", "-crf", "19",
       "-pix_fmt", "yuv420p", "-r", str(FPS), "-g", "60", "-c:a", "aac", "-b:a", "192k",
       "-ar", "48000", "-movflags", "+faststart", str(OUT)]
Path(SRC / "cutgraph.txt").write_text(";\n".join(graph))
print(">> assembling", OUT)
r = subprocess.run(cmd, capture_output=True, text=True)
print(r.stderr.strip()[:800] or "ok")
sys.exit(r.returncode)
