"""Compose a track's soundscape and encode it (WAV/MP3).

Modes
- sweep:    each frame lasts FRAME_S seconds; the phenomenon sound travels west→east (left→right)
            following the scan, over a quieter whole-map bed. Data melody optional.
- overview: each frame is a short, centred snapshot of the whole map; good for hearing change.

Cues: a soft tick at each frame start (time), a rising two-tone earcon where a meaningful
threshold is first crossed (panned to where it happens).
"""

import hashlib
import io
import wave
from typing import Literal

import av
import numpy as np
from numpy.typing import NDArray

from app.schemas.models import FrameLayers, Score
from app.sonify.spec import SoundSpec
from app.sonify.synth import SR, Synth

Mode = Literal["sweep", "overview"]
FRAME_S: dict[str, float] = {"sweep": 4.0, "overview": 2.5}
TAIL_S = 1.5


def _seed(track_id: str, mode: str) -> int:
    return int.from_bytes(hashlib.sha256(f"{track_id}:{mode}".encode()).digest()[:4], "little")


def _curve(n: int, times: list[float], values: list[float]) -> NDArray[np.float32]:
    return np.clip(np.interp(np.arange(n) / SR, times, values), 0, 1).astype(np.float32)


def _phenomenon(s: Synth, spec: SoundSpec, c: NDArray[np.float32]) -> NDArray[np.float32]:
    p = spec.phenomenon
    if p == "rain":
        return s.rain(c)
    if p == "wind":
        return s.wind(c)
    if p == "fire":
        return s.fire(c)
    if p == "surf":
        return s.surf(np.ones_like(c), c)  # c = warmth (0 cold … 1 warm)
    if p == "biophony":
        return s.biophony(c)
    if p == "temperature":  # c: 0 = -40 °C, 0.5 = freezing, 0.75 = 20 °C, 1 = 40 °C
        heat = np.clip((c - 0.75) / 0.25, 0, 1).astype(np.float32)
        cold = np.clip((0.5 - c) / 0.5, 0, 1).astype(np.float32)
        return s.temperature(heat, cold)
    if p == "traffic":
        return s.traffic(c)
    return s.haze(c)


def _pan(signal: NDArray[np.float32], pan: NDArray[np.float32] | float) -> NDArray[np.float32]:
    """Equal-power pan; pan in -1 (left) … 1 (right)."""
    angle = (np.asarray(pan, dtype=np.float32) + 1) * np.pi / 4
    return np.stack([signal * np.cos(angle), signal * np.sin(angle)]).astype(np.float32)


def _place(out: NDArray[np.float32], grain: NDArray[np.float32], at_s: float, pan: float) -> None:
    at = int(at_s * SR)
    end = min(out.shape[1], at + len(grain))
    if end > at:
        out[:, at:end] += _pan(grain[: end - at], pan)


def render(
    *,
    track_id: str,
    score: Score,
    layers: list[FrameLayers],
    spec: SoundSpec,
    mode: Mode = "sweep",
    melody: bool = True,
) -> NDArray[np.float32]:
    """Return stereo float32 audio, shape (2, samples), peak ≤ 0.9."""
    frame_s = FRAME_S[mode]
    frames = len(layers)
    n = int((frames * frame_s + TAIL_S) * SR)
    s = Synth(n, _seed(track_id, mode))
    out = np.zeros((2, n), dtype=np.float32)
    steps = len(layers[0].column_intensity) if layers else 16
    step_s = frame_s / steps

    # Whole-map bed (centred) follows each frame's overall intensity.
    bed_t = [(f + 0.5) * frame_s for f in range(frames)]
    bed = _curve(
        n,
        [0.0, *bed_t, n / SR],
        [layers[0].intensity, *(lf.intensity for lf in layers), layers[-1].intensity],
    )

    if mode == "sweep":
        # Local layer: intensity of the column under the scan, panned with it.
        times, values = [], []
        for f, lf in enumerate(layers):
            for k, v in enumerate(lf.column_intensity):
                times.append(f * frame_s + (k + 0.5) * step_s)
                values.append(v)
        local = _curve(n, times, values)
        frac = (np.arange(n) / SR % frame_s) / frame_s
        pan = (-0.85 + 1.7 * frac).astype(np.float32)
        out += _pan(_phenomenon(s, spec, local), pan) * 0.85
        out += _pan(_phenomenon(s, spec, bed), 0.0) * 0.35
    else:
        out += _pan(_phenomenon(s, spec, bed), 0.0)

    # Data melody: soft plucks of the score's notes (pitch = value), quiet under the soundscape.
    if melody:
        for f, frame in enumerate(score.frames[:frames]):
            notes = frame.column_notes
            if mode == "sweep":
                last = -1
                for k, note in enumerate(notes):
                    if note >= 0 and (note != last or k % 4 == 0):
                        hz = 440 * 2 ** ((note - 69) / 12)
                        _place(
                            out,
                            s.pluck(hz, 0.4, 0.05),
                            f * frame_s + k * step_s,
                            -0.85 + 1.7 * k / max(1, steps - 1),
                        )
                    last = note
            else:
                chord = sorted({n_ for n_ in notes if n_ >= 0})
                for j, note in enumerate([chord[0], chord[len(chord) // 2], chord[-1]] if chord else []):
                    _place(
                        out,
                        s.pluck(440 * 2 ** ((note - 69) / 12), 1.2, 0.05),
                        f * frame_s + j * 0.04,
                        (j - 1) * 0.4,
                    )

    # Cues: frame tick (time orientation) and threshold earcons (where it happens).
    tick = s.pluck(1500, 0.03, 0.025)
    for f, lf in enumerate(layers):
        _place(out, tick, f * frame_s, 0.0)
        for alert in lf.alerts:
            if alert.new or f == 0:
                at = f * frame_s + (alert.x * frame_s if mode == "sweep" else 0.15)
                _place(out, s.alert(), at, alert.x * 1.7 - 0.85)

    # Fades, soft limiter, normalise.
    fade = int(0.3 * SR)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    out[:, :fade] *= ramp
    out[:, -fade:] *= ramp[::-1]
    peak = float(np.abs(out).max()) or 1.0
    out = np.tanh(1.4 * out / peak) / np.tanh(1.4)
    return (out * 0.89).astype(np.float32)


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
