"""Render a track's score to audio (WAV/MP3).

v14 — three instruments in a hall. The renderer has no opinions about music: every pitch, entrance
and accent comes from the score (`app/mapping/rules.py`). All this file does is acoustics:

  * one set of notes per scan step, on a fixed grid (`step_s = FRAME_S[mode] / steps_per_frame`,
    0.5 s in sweep mode), so the pulse is perfectly steady and never drifts;
  * three voices, each with its own instrument: low plucked string, harp, flute (`synth.py`). No
    drone, no pad, no percussion, no environmental noise and no earcons — chords are what happens
    when the three lines sound together;
  * static, centred imaging: one small fixed offset per instrument (max |pan| 0.10; the brief
    allows 0.25). The melody no longer sweeps left-to-right — position inside a frame is carried
    by *time*;
  * a Schroeder hall on the whole mix (RT60 ≈ 2.2 s, 26 ms pre-delay, HF-damped combs, wet 0.30),
    so an isolated harp pluck keeps ringing after it has been played;
  * a deliberately narrow dynamic range: note gain follows the measured slice intensity by at most
    +-2.7 dB, so there are no swells and no gain jump anywhere near 6 dB per 100 ms;
  * a deterministic soft-knee master limiter, then peak normalisation to 0.89 (-1 dBFS).

The layers removed with mapping_version 13 -> 14 were the phenomenon noise bed (rain, wind, fire,
surf, biophony, temperature, haze, traffic), the 3-oscillator drone, the noise/tick rhythm hits,
the inharmonic hotspot bell and the two-tone alert earcon.
"""

import hashlib
import io
import wave
from dataclasses import dataclass
from typing import Literal

import av
import numpy as np
from numpy.typing import NDArray

from app.mapping.rules import STEPS_PER_FRAME, accent_steps, frame_chord
from app.schemas.models import FrameLayers, InstrumentId, Score
from app.sonify.spec import SoundSpec
from app.sonify.synth import SR, Synth

Mode = Literal["sweep", "overview"]
FRAME_S: dict[str, float] = {"sweep": 4.0, "overview": 2.5}
TAIL_S = 1.0

# -------------------------------------------------------------------------- the mix
#: Fixed, small stereo offsets. Nothing moves during the track.
PAN: dict[InstrumentId, float] = {"bass": 0.0, "harp": 0.10, "flute": -0.10}

#: Peak level per voice before the hall and the limiter.
LEVEL: dict[InstrumentId, float] = {"bass": 0.28, "harp": 0.18, "flute": 0.17}

#: Note length in scan steps. Plucked voices ring well past their step (the harp over three steps,
#: so consecutive plucks blend into a chord); the flute sustains just past its step for a legato line.
DUR_STEPS: dict[InstrumentId, float] = {"bass": 1.1, "harp": 3.2, "flute": 1.35}

#: How far the measured slice intensity may move a note's level: 0.85..1.15 is 2.7 dB.
GAIN_LOW, GAIN_HIGH = 0.85, 1.15

#: Hall mix and the master limiter (soft knee from 0.72, tanh to 0.96, output peak 0.89).
REVERB_WET = 0.30
KNEE, CEILING, PEAK_OUT = 0.72, 0.96, 0.89


@dataclass(frozen=True)
class Voice:
    """How one instrument is voiced. Presentation only — never pitch, repertoire or entrance."""

    instrument: InstrumentId
    gain: float
    pan: float
    dur_steps: float


VOICES: tuple[Voice, ...] = tuple(
    Voice(i, LEVEL[i], PAN[i], DUR_STEPS[i]) for i in ("bass", "harp", "flute")
)


def _midi_hz(midi: int) -> float:
    return float(440.0 * 2 ** ((midi - 69) / 12.0))


def _seed(track_id: str, mode: str) -> int:
    """The seed for every random element in the render (string scrape, breath, comb tuning).

    It is a hash of the inputs alone, so it is reproducible from (track_id, mode) without extra
    storage, and each grain and each channel draws from its own sub-stream, so neither the
    scheduling order nor the voice count can change the result.
    """
    return int.from_bytes(hashlib.sha256(f"{track_id}:{mode}".encode()).digest()[:4], "little")


def _pan(signal: NDArray[np.float32], pan: float) -> NDArray[np.float32]:
    """Equal-power placement; `pan` in -1 (left) .. 1 (right)."""
    angle = (float(pan) + 1) * np.pi / 4
    return np.stack([signal * np.cos(angle), signal * np.sin(angle)]).astype(np.float32)


def _place(out: NDArray[np.float32], grain: NDArray[np.float32], at_s: float, pan: float) -> None:
    at = int(at_s * SR)
    end = min(out.shape[1], at + len(grain))
    if end > at:
        out[:, at:end] += _pan(grain[: end - at], pan)


def _note_gain(base: float, inten: float) -> float:
    """Slice intensity nudges the level, but only inside a 2.7 dB window."""
    return float(base * (GAIN_LOW + (GAIN_HIGH - GAIN_LOW) * min(1.0, max(0.0, inten))))


def render(
    *,
    track_id: str,
    score: Score,
    layers: list[FrameLayers],
    spec: SoundSpec,
    mode: Mode = "sweep",
    melody: bool = True,
    grids: NDArray[np.uint8] | None = None,
) -> NDArray[np.float32]:
    """Return stereo float32 audio, shape (2, samples), peak <= 0.89.

    `melody=False` (the CLI's `--no-melody`, the cache key's "nature" variant) plays the value line
    alone: the low plucked string, one note per scan step, no harp and no flute. In v14 there is no
    non-musical bed left to fall back to, so the measured value mapping *is* the audio either way.
    """
    frame_s = FRAME_S[mode]
    frames = len(layers) if layers else len(score.frames)
    n = int((frames * frame_s + TAIL_S) * SR)
    s = Synth(n, _seed(track_id, mode))
    out = np.zeros((2, n), dtype=np.float32)
    steps = max(1, score.steps_per_frame)
    step_s = frame_s / steps

    active = [v for v in VOICES if melody or v.instrument == "bass"]
    grains: dict[InstrumentId, dict[tuple[int, bool], NDArray[np.float32]]] = {
        v.instrument: {} for v in VOICES
    }

    def play(voice: Voice, midi: int, at_s: float, inten: float, octave_lift: bool = False) -> None:
        key = (midi, octave_lift)
        cache = grains[voice.instrument]
        if key not in cache:
            fn = {"bass": s.plucked_bass, "harp": s.harp, "flute": s.flute}[voice.instrument]
            grain = fn(_midi_hz(midi + (12 if octave_lift else 0)), voice.dur_steps * step_s)
            cache[key] = (grain / max(float(np.abs(grain).max()), 1e-9)).astype(np.float32)
        _place(out, cache[key] * np.float32(_note_gain(voice.gain, inten)), at_s, voice.pan)

    for f, frame in enumerate(score.frames[:frames]):
        t0 = f * frame_s
        lf = layers[f] if f < len(layers) else None
        inten = (
            [frame.loudness] * steps
            if lf is None
            else list(lf.column_intensity) + [0.0] * max(0, steps - len(lf.column_intensity))
        )
        lifts = accent_steps(lf.alerts, steps) if lf is not None else set()
        lines = {p.instrument: list(p.notes) for p in frame.voices}

        if mode == "overview":
            chord = frame_chord(frame.voices)
            for voice in active:
                midi = chord.get(voice.instrument, -1)
                if midi >= 0:
                    play(
                        voice,
                        midi,
                        t0 + 0.02,
                        frame.loudness,
                        octave_lift=bool(lifts) and voice.instrument == "harp",
                    )
            continue

        for k in range(steps):
            at_k = t0 + k * step_s
            lift = k in lifts
            for voice in active:
                line = lines.get(voice.instrument, [])
                midi = line[k] if k < len(line) else -1
                if midi >= 0:
                    play(voice, midi, at_k, inten[k], octave_lift=lift and voice.instrument == "harp")

    # Global safety fade-in, the hall, then the master limiter.
    edge = int(0.03 * SR)
    ramp = (0.5 - 0.5 * np.cos(np.pi * np.linspace(0, 1, edge, dtype=np.float32))).astype(np.float32)
    out[:, :edge] *= ramp
    wet = s.reverb(out, REVERB_WET)
    fade = int(0.4 * SR)
    tail = (0.5 - 0.5 * np.cos(np.pi * np.linspace(0, 1, fade, dtype=np.float32))).astype(np.float32)
    wet[:, -fade:] *= tail[::-1]
    wet = _limit(wet)
    peak = float(np.abs(wet).max()) or 1.0
    return ((wet / peak) * PEAK_OUT).astype(np.float32)


def _limit(x: NDArray[np.float32]) -> NDArray[np.float32]:
    """Deterministic soft-knee limiter: linear below KNEE, tanh compression up to CEILING."""
    span = CEILING - KNEE
    over = np.abs(x) - KNEE
    shaped = np.where(over > 0, KNEE + span * np.tanh(over / span), np.abs(x)).astype(np.float32)
    return (np.sign(x) * shaped).astype(np.float32)


def encode(audio: NDArray[np.float32], fmt: Literal["wav", "mp3"]) -> bytes:
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    interleaved = pcm.T.reshape(1, -1)
    if fmt == "wav":
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(interleaved.tobytes())
        return buf.getvalue()
    buf = io.BytesIO()
    with av.open(buf, "w", format="mp3") as container:
        stream = container.add_stream("libmp3lame", rate=SR, layout="stereo")
        stream.bit_rate = 128_000
        chunk = 1152 * 16
        for start in range(0, interleaved.shape[1] // 2, chunk):
            part = interleaved[:, start * 2 : (start + chunk) * 2]
            frame = av.AudioFrame.from_ndarray(part, format="s16", layout="stereo")
            frame.sample_rate = SR
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    return buf.getvalue()


def listening_guide(spec: SoundSpec, unit_label: str, mode: Mode = "sweep", melody: bool = True) -> str:
    """Plain-language key for the rendered audio. Describes only what the renderer actually plays."""
    parts = [spec.description]
    if mode == "sweep":
        parts.append(
            f"Each frame lasts {FRAME_S['sweep']:.0f} seconds and the map is scanned west to east in "
            f"{STEPS_PER_FRAME} slices — one note per slice half a second apart, on a steady pulse "
            "that never speeds up or slows down. The notes of a frame run from its west edge to its "
            "east edge, so a place in the map is a moment in the frame, not a side of the head. The "
            "mix sits in the middle and never moves from left to right."
        )
    else:
        parts.append(
            f"Each frame is one {FRAME_S['overview']:.1f}-second chord, built from the middle of what "
            "each instrument played, so you hear the change over time rather than the shape of the map."
        )
    parts.append(
        "The players: a low plucked string gives the average value of the slice, a harp gives its "
        f"highest value, and a flute holds longer notes tracing how that slice changed since the "
        f"previous frame. Higher notes mean higher {unit_label} on the bass and the harp; on the "
        "flute, a rising line means the values went up since the last frame."
    )
    parts.append(
        "There are no drums, no drones and no weather sounds: the chords are simply what the three "
        "lines make when they sound together, and each note keeps ringing in a hall-like reverb "
        "after it has been played."
    )
    if not melody:
        parts.append("This version plays the low plucked line alone — no harp, no flute.")
    else:
        parts.append(
            "The harp joins as soon as the picture has real contrast, the flute as soon as it starts "
            "moving, so the music thickens one instrument at a time. Loudness stays level: a louder "
            "note is not more of anything."
        )
    if spec.thresholds:
        lines = "; ".join(t.label for t in spec.thresholds)
        parts.append(
            "Where the map first crosses one of these lines, the harp lifts an octave for that "
            f"slice: {lines}."
        )
    parts.append("Silence means no data, for example land on an ocean map. Best with headphones.")
    return " ".join(parts)
