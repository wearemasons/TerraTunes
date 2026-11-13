"""Compose a track's soundscape and encode it (WAV/MP3).

Uses the rebuilt upstream pre-frontend-swap instruments (`timbres.ts` + `engine.ts` + `player.ts`):
- Theme-specific oscillator timbres (`sine`, `triangle`, `sawtooth`, `square`) & lowpass filters
- Sustained `[root, fifth, tension]` drone
- West→east melodic `pluck` scan with harmonized color voices and steep peak dynamics
- Upstream `"noise"` / `"tick"` rhythm hits (`hit`)
- Upstream 3-partial inharmonic hotspot `bell`
"""

import hashlib
import io
import wave
from dataclasses import dataclass
from typing import Literal

import av
import numpy as np
from numpy.typing import NDArray

from app.mapping.rules import scale_ladder
from app.schemas.models import FrameLayers, Score
from app.sonify.spec import Phenomenon, SoundSpec
from app.sonify.synth import SR, Synth, WaveType

Mode = Literal["sweep", "overview"]
FRAME_S: dict[str, float] = {"sweep": 4.0, "overview": 2.5}
TAIL_S = 1.5


@dataclass(frozen=True)
class Timbre:
    melody: WaveType
    drone: WaveType
    drone_level: float
    rhythm: Literal["noise", "tick", "none"]
    bell: bool
    tension: bool
    reverb: float
    filter_base: float


# Exact upstream THEME_TIMBRES from frontend/apps/web/src/audio/timbres.ts mapped by phenomenon
PHENOMENON_TIMBRES: dict[Phenomenon, Timbre] = {
    "rain": Timbre("sine", "sine", 0.7, "noise", True, True, 0.5, 2000),
    "wind": Timbre("triangle", "triangle", 0.8, "noise", True, True, 0.35, 1600),
    "fire": Timbre("triangle", "sawtooth", 0.8, "tick", True, True, 0.25, 1800),
    "surf": Timbre("sine", "sine", 1.0, "tick", True, True, 0.5, 1500),
    "biophony": Timbre("sine", "triangle", 0.6, "noise", True, True, 0.45, 2400),
    "temperature": Timbre("triangle", "triangle", 0.8, "noise", True, True, 0.35, 1600),
    "traffic": Timbre("square", "sawtooth", 0.6, "tick", True, True, 0.2, 1300),
    "haze": Timbre("triangle", "sawtooth", 0.6, "noise", True, True, 0.35, 1100),
}


def _midi_hz(midi: int) -> float:
    return float(440.0 * 2 ** ((midi - 69) / 12.0))


def _peak_curve(c: NDArray[np.float32]) -> NDArray[np.float32]:
    """Low on low/calm values, steep surge on high/abnormal peaks."""
    return np.clip(c**2.4 + 1.65 * np.maximum(0.0, (c - 0.55) / 0.45) ** 2.0, 0.0, 2.2).astype(
        np.float32
    )


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
        return s.surf(np.ones_like(c), c)
    if p == "biophony":
        return s.biophony(c)
    if p == "temperature":
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
    grids: NDArray[np.uint8] | None = None,
) -> NDArray[np.float32]:
    """Return stereo float32 audio, shape (2, samples), peak ≤ 0.9."""
    frame_s = FRAME_S[mode]
    frames = len(layers)
    n = int((frames * frame_s + TAIL_S) * SR)
    s = Synth(n, _seed(track_id, mode))
    out = np.zeros((2, n), dtype=np.float32)
    steps = len(layers[0].column_intensity) if layers else 16
    step_s = frame_s / steps
    timbre = PHENOMENON_TIMBRES.get(spec.phenomenon, PHENOMENON_TIMBRES["wind"])
    ladder = scale_ladder(score.key.scale)
    root_drone = score.key.root_midi - 12

    # Whole-map bed (centred) follows each frame's overall intensity.
    bed_t = [(f + 0.5) * frame_s for f in range(frames)]
    bed = _curve(
        n,
        [0.0, *bed_t, n / SR],
        [layers[0].intensity, *(lf.intensity for lf in layers), layers[-1].intensity],
    )

    if mode == "sweep":
        times, values = [], []
        for f, lf in enumerate(layers):
            for k, v in enumerate(lf.column_intensity):
                times.append(f * frame_s + (k + 0.5) * step_s)
                values.append(v)
        local = _curve(n, times, values)
        frac = (np.arange(n) / SR % frame_s) / frame_s
        pan = (-0.85 + 1.7 * frac).astype(np.float32)
        out += _pan(_phenomenon(s, spec, _peak_curve(local)), pan) * (0.15 + 0.45 * _peak_curve(local))
        out += _pan(_phenomenon(s, spec, bed), 0.0) * (0.06 + 0.15 * _peak_curve(bed))
    else:
        local = bed
        out += _pan(_phenomenon(s, spec, _peak_curve(bed)), 0.0) * (0.25 + 0.35 * _peak_curve(bed))

    # Upstream player.ts scheduleStep: Drone + Melody Plucks + Rhythm Hits + Hotspot Bell
    for f, (frame, lf) in enumerate(zip(score.frames[:frames], layers, strict=False)):
        t0 = f * frame_s
        gate = float(np.clip(lf.intensity * 2.0, 0.0, 1.0))
        if gate <= 0.02:
            continue

        # 1) Upstream sustained Drone ([root, fifth, tension], lowpass 250 + brightness * 1400 Hz)
        if timbre.drone_level > 0:
            drone_lvl = (0.025 + 0.11 * (frame.loudness**1.6)) * timbre.drone_level * gate
            drone_grain = s.drone_slice(
                root_drone,
                frame_s * 1.05,
                timbre.drone,
                drone_lvl,
                frame.brightness,
                frame.tension if timbre.tension else 0.0,
            )
            _place(out, drone_grain, t0, 0.0)

        cutoff = timbre.filter_base + frame.brightness * 3000.0
        notes = frame.column_notes
        cols_inten = lf.column_intensity
        rhythm_kind: Literal["noise", "tick"] = "tick" if timbre.rhythm == "none" else timbre.rhythm

        if mode == "overview":
            if melody:
                chord = sorted({n_ for n_ in notes if n_ >= 0})
                for j, note in enumerate([chord[0], chord[len(chord) // 2], chord[-1]] if chord else []):
                    _place(
                        out,
                        s.pluck(_midi_hz(note), step_s * 3.5, (0.06 + 0.18 * frame.loudness) * 0.6, timbre.melody, cutoff),
                        t0 + j * 0.02,
                        (j - 1) * 0.4,
                    )
            if timbre.bell and frame.hotspot:
                _place(
                    out,
                    s.bell(_midi_hz(frame.hotspot.note), frame.hotspot.strength),
                    t0 + frame_s * 0.5,
                    frame.hotspot.x * 1.6 - 0.8,
                )
            for k in range(max(1, frame.rhythm_density)):
                _place(
                    out,
                    s.hit(rhythm_kind, 0.08 if k == 0 else 0.04),
                    t0 + (k * frame_s) / max(1, frame.rhythm_density),
                    0.0,
                )
            continue

        # Sweep mode: west -> east step scheduling (from upstream player.ts lines 337-357)
        last_note = -1
        hot_step = min(steps - 1, int(frame.hotspot.x * steps)) if frame.hotspot else -1
        for k in range(steps):
            at_k = t0 + k * step_s
            pan_k = (k / max(1, steps - 1)) * 1.6 - 0.8
            note = notes[k] if k < len(notes) else -1
            inten = cols_inten[k] if k < len(cols_inten) else frame.loudness
            # Low values stay low; high/abnormal values surge sharply
            melody_gain = 0.03 + 0.34 * (inten**2.2)

            if melody and note >= 0 and (note != last_note or k % 4 == 0):
                mel_wave: WaveType = "triangle" if timbre.melody == "square" and inten < 0.5 else timbre.melody
                _place(
                    out,
                    s.pluck(_midi_hz(note), step_s * 1.9, melody_gain, mel_wave, cutoff),
                    at_k,
                    pan_k,
                )
                # Harmonize elevated color bands with a consonant scale fifth/third pluck
                if inten > 0.52 and note in ladder:
                    harm_note = ladder[min(len(ladder) - 1, ladder.index(note) + 2)]
                    _place(
                        out,
                        s.pluck(_midi_hz(harm_note), step_s * 1.6, melody_gain * 0.55, mel_wave, cutoff),
                        at_k + 0.015,
                        pan_k * 0.7,
                    )
                if timbre.tension and frame.tension > 0.25 and k % 2 == 1 and inten > 0.55:
                    _place(
                        out,
                        s.pluck(_midi_hz(note + 1), step_s * 1.2, melody_gain * frame.tension * 0.45, mel_wave, cutoff),
                        at_k + step_s * 0.25,
                        -pan_k,
                    )
            last_note = note

            # Upstream rhythm hits (step % 2 == 0 and half-steps on high rhythm_density)
            if note >= 0 or gate > 0.15:
                hit_scale = 0.35 + 1.15 * (inten**1.6)
                on_beat = k % 2 == 0
                if frame.rhythm_density >= 2 or on_beat:
                    base_hit = 0.075 if k % 4 == 0 else 0.038
                    _place(out, s.hit(rhythm_kind, base_hit * hit_scale * gate), at_k, 0.0)
                if frame.rhythm_density >= 4 or inten > 0.65:
                    _place(out, s.hit(rhythm_kind, 0.028 * hit_scale * gate), at_k + step_s * 0.5, 0.15)

            # Upstream hotspot bell on the hotspot column (plus peak anomaly bell)
            if timbre.bell and frame.hotspot and k == hot_step:
                _place(
                    out,
                    s.bell(_midi_hz(frame.hotspot.note), frame.hotspot.strength),
                    at_k,
                    pan_k,
                )

    # Cues: frame tick (time orientation) and threshold earcons (where it happens).
    tick = s.pluck(1500, 0.03, 0.022)
    for f, lf in enumerate(layers):
        _place(out, tick, f * frame_s, 0.0)
        for alert in lf.alerts:
            if alert.new or f == 0:
                at = f * frame_s + (alert.x * frame_s if mode == "sweep" else 0.15)
                _place(out, s.alert(), at, alert.x * 1.7 - 0.85)

    # Fades and clean peak normalization (preserve dynamic contrast between quiet areas and peaks).
    fade = int(0.3 * SR)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    out[:, :fade] *= ramp
    out[:, -fade:] *= ramp[::-1]
    peak = float(np.abs(out).max()) or 1.0
    out = out / peak
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


def listening_guide(spec: SoundSpec, unit_label: str, mode: Mode = "sweep", melody: bool = True) -> str:
    """Plain-language key for the rendered audio. Describes only what the renderer actually plays."""
    parts = [spec.description]
    if mode == "sweep":
        parts.append(
            f"Each frame lasts {FRAME_S['sweep']:.0f} seconds. The sound travels from your left ear (west) to your "
            "right ear (east) as it scans the map, so you hear where things are. A quieter layer underneath "
            "follows the whole map."
        )
    else:
        parts.append(
            f"Each frame is a {FRAME_S['overview']:.1f}-second snapshot of the whole map, so you hear change over time."
        )
    parts.append("A soft tick marks each new frame.")
    if melody:
        parts.append(f"Soft notes underneath give the value: higher notes mean higher {unit_label}.")
    if spec.thresholds:
        lines = "; ".join(t.label for t in spec.thresholds)
        parts.append(
            f"A rising two-note chime marks where the map first crosses a meaningful line, panned to that side: {lines}."
        )
    parts.append("Silence means calm conditions or no data. Best with headphones.")
    return " ".join(parts)
