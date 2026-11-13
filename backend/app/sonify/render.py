"""Realise the v16 score with warmer procedural acoustic instruments and hall.

Pitches, rests, durations and intensity gain targets come only from mapping/rules.py. Shared
instrument-bus and ensemble automation use rounded monotone easing in dB, with a provable combined
control slew below 6 dB/100 ms. Acoustic pluck attacks are not gain-control jumps. The master
soft-knee limiter and peak ceiling remain, without dynamic-range compression of the quiet map.
"""

import hashlib
import io
import wave
from dataclasses import dataclass
from typing import Literal

import av
import numpy as np
from numpy.typing import NDArray

from app.mapping.rules import GAIN_SLEW_DB_PER_S, frame_chord
from app.schemas.models import FrameLayers, InstrumentId, Score
from app.sonify.spec import SoundSpec
from app.sonify.synth import SR, Synth

Mode = Literal["sweep", "overview"]
FRAME_S: dict[str, float] = {"sweep": 4.0, "overview": 2.5}
TAIL_S = 1.6

# -------------------------------------------------------------------------- the mix
#: Fixed, small stereo offsets. Nothing moves during the track.
PAN: dict[InstrumentId, float] = {"bass": 0.0, "harp": 0.10, "flute": -0.10}

#: Peak level per voice before the hall and the limiter.
LEVEL: dict[InstrumentId, float] = {"bass": 0.28, "harp": 0.18, "flute": 0.17}

#: Note length in scan steps. Plucked voices ring well past their step (the harp over three steps,
#: so consecutive plucks blend into a chord); the flute sustains just past its step for a legato line.
DUR_STEPS: dict[InstrumentId, float] = {"bass": 1.1, "harp": 3.2, "flute": 1.35}

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


VOICES: tuple[Voice, ...] = tuple(Voice(i, LEVEL[i], PAN[i], DUR_STEPS[i]) for i in ("bass", "harp", "flute"))


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


def smooth_gain(
    targets: list[float], step_s: float, samples: int, max_db_s: float = GAIN_SLEW_DB_PER_S
) -> NDArray[np.float32]:
    """C1-continuous rounded waves in dB, monotone between measured targets, no overshoot.

    Cubic easing has a maximum derivative of 1.5, so knot differences are capped at two thirds
    of the requested slew budget. This keeps the bound even at a wave's steepest point. The
    final target holds through the tail. Silence is scheduled rests, not an abrupt fader cut.
    """
    if not targets:
        return np.ones(samples, dtype=np.float32)
    db = 20 * np.log10(np.maximum(np.asarray(targets, dtype=np.float64), 1e-4))
    limit = max_db_s * step_s / 1.5
    for i in range(1, len(db)):
        db[i] = np.clip(db[i], db[i - 1] - limit, db[i - 1] + limit)
    position = np.arange(samples, dtype=np.float64) / (SR * step_s)
    left = np.minimum(position.astype(np.int64), len(db) - 1)
    right = np.minimum(left + 1, len(db) - 1)
    u = np.clip(position - left, 0.0, 1.0)
    eased = u * u * (3.0 - 2.0 * u)
    curve = db[left] + (db[right] - db[left]) * eased
    return (10 ** (curve / 20)).astype(np.float32)


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
    """Return stereo float32 samples. `melody=False` keeps only the scored bass line."""
    frame_s = FRAME_S[mode]
    frames = len(score.frames)
    n = int((frames * frame_s + TAIL_S) * SR)
    s = Synth(n, _seed(track_id, mode))
    steps = max(1, score.steps_per_frame)
    step_s = frame_s / steps
    out = np.zeros((2, n), dtype=np.float32)
    active = [v for v in VOICES if melody or v.instrument == "bass"]
    for voice in active:
        bus = np.zeros((2, n), dtype=np.float32)
        gain_targets: list[float] = []
        cache: dict[tuple[int, float], NDArray[np.float32]] = {}
        for f, frame in enumerate(score.frames):
            part = next((p for p in frame.voices if p.instrument == voice.instrument), None)
            if part is None:
                gain_targets.extend([1e-4] * steps)
                continue
            gains = part.gains or [1.0] * steps
            if mode == "overview":
                gains = [float(np.mean(gains))] * steps
            gain_targets.extend(gains)
            if mode == "overview":
                midi = frame_chord(frame.voices).get(voice.instrument, -1)
                events = [(0, midi, float(steps))] if midi >= 0 else []
            else:
                events = [
                    (k, midi, part.durations[k] if part.durations else voice.dur_steps)
                    for k, midi in enumerate(part.notes)
                    if midi >= 0
                ]
            for k, midi, dur_steps in events:
                dur = min(dur_steps * step_s, frame_s - k * step_s)
                key = (midi, round(dur, 4))
                if key not in cache:
                    fn = {"bass": s.plucked_bass, "harp": s.harp, "flute": s.flute}[voice.instrument]
                    grain = fn(_midi_hz(midi), dur)
                    # Soft exponential release at the frame boundary; no dry cross-chord notes.
                    release = min(int(0.14 * SR), len(grain) // 3)
                    if release > 0:
                        grain[-release:] *= np.geomspace(1.0, 1e-4, release).astype(np.float32)
                    cache[key] = grain
                _place(bus, cache[key] * np.float32(voice.gain), f * frame_s + k * step_s, voice.pan)
        # 35 dB/s on voice buses + 10 dB/s on the ensemble = 45 dB/s, or 4.5 dB/100 ms.
        bus *= smooth_gain(gain_targets, step_s, n, GAIN_SLEW_DB_PER_S - 10.0)
        out += bus

    # Sparse data accents sit beside the clear melodic line. They are deliberately
    # anticipatory: a late-slot hotspot begins 120 ms before its scan slot so an
    # eastern high value arrives as an arrival, not a rebound after the chord change.
    accent = np.zeros((2, n), dtype=np.float32)
    if melody and mode == "sweep":
        for f, frame in enumerate(score.frames):
            activity = frame.activity or [0.0] * steps
            for k, a in enumerate(activity):
                if a >= 0.70 and k % 2 == 0:
                    beat = s.data_beat(min(1.0, 0.28 + 0.52 * float(a)), 0.14)
                    _place(accent, beat * 0.28, f * frame_s + k * step_s, 0.0)
            if frame.hotspot is not None and frame.stats.max >= 0.78:
                k = min(steps - 1, max(0, int(frame.hotspot.x * steps)))
                at = f * frame_s + k * step_s - min(0.12, step_s * 0.22)
                strength = min(1.0, 0.35 + 0.9 * float(frame.hotspot.strength))
                if spec.phenomenon in {"fire", "temperature"}:
                    burst = s.heat_burst(strength)
                    _place(accent, burst * 0.34, max(0.0, at), frame.hotspot.x * 2 - 1)
                else:
                    beat = s.data_beat(strength, 0.22)
                    _place(accent, beat * 0.48, max(0.0, at), 0.0)
        out += accent
    ensemble = [
        g
        for frame in score.frames
        for g in (
            [float(np.mean(frame.gain_envelope or [1.0]))] * steps
            if mode == "overview"
            else (frame.gain_envelope or [1.0] * steps)
        )
    ]
    out *= smooth_gain(ensemble, step_s, n, 10.0)
    edge = int(0.03 * SR)
    out[:, :edge] *= np.geomspace(1e-4, 1.0, edge).astype(np.float32)
    wet = s.reverb(out, REVERB_WET)
    fade = int(0.6 * SR)
    wet[:, -fade:] *= np.geomspace(1.0, 1e-4, fade).astype(np.float32)
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
    """Describe the scored harmony, relative contour, intensity, rests and steady position grid."""
    parts = [spec.description]
    if mode == "sweep":
        parts.append(
            "Each frame lasts four seconds. Eight half-second slots scan west to east: "
            "early is west and late is east. Some slots are quiet-area rests; the grid "
            "never changes speed. The instruments stay near the centre, so location is "
            "time, not left or right. This is a longitude summary, not a full latitude map."
        )
    else:
        parts.append(
            "Each frame is one 2.5-second chord, summarising the measured lines over time "
            "rather than scanning longitude."
        )
    parts.append(
        f"Bass follows the slice's average {unit_label}; harp follows its highest value; "
        "flute follows signed change since the previous frame. Within a frame, higher "
        "measured slices choose equal or higher chord tones. Real relative differences "
        "are spread across the register; equal values stay equal. Pitch is relative "
        "contour, not an exact reading in units."
    )
    parts.append(
        "The theme has a repeating, composed eight-frame chord phrase, one chord per "
        "frame. All new notes belong to that chord. The progression is musical composition, "
        "not measured data; do not compare raw pitches across chord changes."
    )
    parts.append(
        "Louder and fuller means more intense activity relative to this track. Quiet "
        "areas are soft and sparse with longer notes; active areas gain more ringing "
        "harp plucks and a stronger ensemble swell. The three measured lines carry the map and "
        "nothing else adds information: no drone, no weather recording, no beat that stands for a "
        "quantity. Sparse low beats mark "
        "dense high-activity regions. A strong hotspot gets a short anticipatory accent just "
        "before its scan slot, so late eastern peaks arrive clearly rather than bouncing after "
        "the chord. Heat and smoke-indicator tracks use a restrained rising accent; it is "
        "a contextual icon, not a measurement of fire. Rounded gain curves join the measured targets "
        "and emphasize high-activity peaks without raising the output ceiling. Slight seeded string "
        "drift adds organic timbre, not another data measurement."
    )
    if not melody:
        parts.append("This version plays the scored low plucked line alone: no harp or flute.")
    if spec.thresholds:
        parts.append(
            "Named thresholds remain in the text timeline, not as separate sound effects: "
            + "; ".join(t.label for t in spec.thresholds)
            + "."
        )
    parts.append(
        "A rest can mean low activity. No-data slices schedule no new notes; an empty "
        "map is silent once the previous hall tail fades. Best with headphones."
    )
    return " ".join(parts)
