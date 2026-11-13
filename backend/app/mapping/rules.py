"""Image-to-music mapping rules. Single source of truth (docs/SONIFICATION_DESIGN.md).

Input: a stack of value grids (uint8, 0..250 = normalized value, 255 = no data).
Output: a deterministic Score the browser can play. Bump MAPPING_VERSION on any rule change.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from app.schemas.models import (
    FrameScore,
    FrameStats,
    GridSize,
    Hotspot,
    Legend,
    PresetId,
    Score,
    ScoreKey,
    ThemeId,
    TranscriptEntry,
)
from app.vision.colorbar import ValueScale

MAPPING_VERSION = "13"
STEPS_PER_FRAME = 16
ROOT_MIDI = 50  # D3
GRID_MAX = 250
NO_DATA = 255

SCALES: dict[str, list[int]] = {
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "minor_pentatonic": [0, 3, 5, 7, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "whole_tone": [0, 2, 4, 6, 8, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "major_pentatonic": [0, 2, 4, 7, 9],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "phrygian_dominant": [0, 1, 4, 5, 7, 8, 10],
}


@dataclass(frozen=True)
class ThemeKey:
    scale: str
    bpm: int


THEME_KEYS: dict[ThemeId, ThemeKey] = {
    "sea_level": ThemeKey("dorian", 66),
    "air_quality": ThemeKey("minor_pentatonic", 72),
    "wildfires": ThemeKey("phrygian", 84),
    "greenhouse_gases": ThemeKey("whole_tone", 60),
    "water": ThemeKey("lydian", 70),
    "agriculture": ThemeKey("major_pentatonic", 80),
    "biodiversity": ThemeKey("major_pentatonic", 76),
    "energy": ThemeKey("mixolydian", 92),
    "disasters": ThemeKey("phrygian_dominant", 88),
    "weather": ThemeKey("mixolydian", 76),
    "ocean": ThemeKey("dorian", 64),
}

NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]


def lower_first(text: str) -> str:
    """Lower-case only the first letter, so acronyms like PM2.5 survive mid-sentence."""
    return text[:1].lower() + text[1:]


def midi_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def scale_ladder(scale: str) -> list[int]:
    intervals = SCALES.get(scale, SCALES["dorian"])
    ladder = [ROOT_MIDI + octave * 12 + iv for octave in range(3) for iv in intervals]
    ladder.append(ROOT_MIDI + 36)
    return ladder


def quantize(value01: float, ladder: list[int]) -> int:
    """Monotonic: a higher value never gives a lower note."""
    v = min(1.0, max(0.0, value01))
    return ladder[round(v * (len(ladder) - 1))]


def frame_duration_s(bpm: int) -> float:
    return STEPS_PER_FRAME * (60 / bpm / 2)


def to_real(value01: float, legend: Legend) -> float:
    """Normalized colorbar position → real value, honouring non-linear tick stops."""
    if len(legend.ticks) >= 2:
        return ValueScale(
            positions=tuple(t.position for t in legend.ticks),
            values=tuple(t.value for t in legend.ticks),
            log=legend.log,
        ).to_real(value01)
    return legend.min + value01 * (legend.max - legend.min)


def fmt(value: float) -> str:
    a = abs(value)
    return f"{value:.0f}" if a >= 100 else f"{value:.1f}" if a >= 10 else f"{value:.2f}"


def fmt_signed(value: float) -> str:
    return f"+{fmt(value)}" if value > 0 else fmt(value)


def lat_lon(x: float, y: float) -> str:
    lon = -180 + x * 360
    lat = 90 - y * 180
    return f"{abs(round(lat))}°{'N' if lat >= 0 else 'S'}, {abs(round(lon))}°{'E' if lon >= 0 else 'W'}"


def describe_region(x: float, y: float) -> str:
    lat = 90 - y * 180
    ns = "northern" if lat > 23.5 else "southern" if lat < -23.5 else "tropical"
    ew = "western" if x < 0.33 else "eastern" if x > 0.67 else "central"
    return f"{ns} {ew} part of the map ({lat_lon(x, y)})"


def audio_key_text(legend: Legend) -> str:
    return " ".join(
        [
            f"Pitch shows {lower_first(legend.label)} in {legend.unit}: the lowest notes mean {fmt(legend.min)} "
            f"and the highest mean {fmt(legend.max)}.",
            "The sweep moves west to east across the map, one note per slice.",
            "Louder and brighter sound means more of the map has high values.",
            "Faster rhythm means a more varied, detailed picture.",
            "Clashing, tense notes mean the picture changed quickly since the previous frame.",
            "A bell marks the strongest hot spot, placed left or right to match where it is.",
            "Silence means no data, for example land on an ocean map.",
        ]
    )


def _column_notes(values: NDArray[np.float64], valid: NDArray[np.bool_], ladder: list[int]) -> list[int]:
    cols = values.shape[1]
    notes: list[int] = []
    for step in range(STEPS_PER_FRAME):
        c0 = (step * cols) // STEPS_PER_FRAME
        c1 = ((step + 1) * cols) // STEPS_PER_FRAME
        block = values[:, c0:c1][valid[:, c0:c1]]
        if block.size == 0:
            notes.append(-1)
            continue
        notes.append(quantize(0.5 * float(block.mean()) + 0.5 * float(block.max()), ladder))
    return notes


def build_score(
    *,
    track_id: str,
    theme: ThemeId,
    legend: Legend,
    labels: list[str],
    grids: NDArray[np.uint8],
    preset: PresetId,
) -> Score:
    """grids: (frames, rows, cols) uint8."""
    key = THEME_KEYS[theme]
    ladder = scale_ladder(key.scale)
    n_frames, rows, cols = grids.shape
    valid_all = grids != NO_DATA
    values_all = np.where(valid_all, grids.astype(np.float64) / GRID_MAX, 0.0)
    first_valid = values_all[0][valid_all[0]]
    start_mean = float(first_valid.mean()) if first_valid.size else 0.0

    frames: list[FrameScore] = []
    for i in range(n_frames):
        valid = valid_all[i]
        values = values_all[i]
        data = values[valid]
        label = labels[i] if i < len(labels) else f"Frame {i + 1}"
        if data.size == 0:
            mean = vmin = vmax = std = 0.0
            extreme = 0.0
            argmax = 0
        else:
            mean, vmin, vmax, std = (
                float(data.mean()),
                float(data.min()),
                float(data.max()),
                float(data.std()),
            )
            extreme = float((data >= 0.8).mean())
            argmax = int(np.argmax(np.where(valid, values, -1.0)))
        hx = ((argmax % cols) + 0.5) / cols
        hy = ((argmax // cols) + 0.5) / rows
        hotspot = (
            Hotspot(x=hx, y=hy, note=quantize(vmax, ladder) + 12, strength=min(1.0, vmax - mean))
            if vmax >= 0.72 and vmax - mean >= 0.25
            else None
        )
        tension = 0.0
        if i > 0:
            both = valid & valid_all[i - 1]
            if both.any():
                tension = min(1.0, float(np.abs(values[both] - values_all[i - 1][both]).mean()) * 8)
        change = to_real(mean, legend) - to_real(start_mean, legend)
        verb = "is typically" if legend.log else "averages"
        parts = [
            f"{label}. {legend.label} {verb} {fmt(to_real(mean, legend))} {legend.unit}, ranging from "
            f"{fmt(to_real(vmin, legend))} to {fmt(to_real(vmax, legend))}.",
            f"The strongest values are in the {describe_region(hotspot.x, hotspot.y)}." if hotspot else "",
            f"Change since the first frame: {fmt_signed(change)} {legend.unit}." if i > 0 else "",
        ]
        frames.append(
            FrameScore(
                index=i,
                label=label,
                tension=round(tension, 4),
                loudness=round(min(1.0, 0.3 + 0.5 * extreme + 0.3 * mean), 4),
                brightness=round(mean, 4),
                rhythm_density=1 if std < 0.08 else 2 if std < 0.18 else 4,
                column_notes=_column_notes(values, valid, ladder),
                hotspot=hotspot,
                stats=FrameStats(
                    mean=round(mean, 4),
                    min=round(vmin, 4),
                    max=round(vmax, 4),
                    extreme_share=round(extreme, 4),
                ),
                description=" ".join(p for p in parts if p),
            )
        )

    return Score(
        mapping_version=MAPPING_VERSION,
        track_id=track_id,
        preset=preset,
        key=ScoreKey(
            root=midi_name(ROOT_MIDI), root_midi=ROOT_MIDI, scale=key.scale.replace("_", " "), bpm=key.bpm
        ),
        grid=GridSize(cols=cols, rows=rows),
        steps_per_frame=STEPS_PER_FRAME,
        frames=frames,
    )


def build_transcript(score: Score, legend: Legend) -> list[TranscriptEntry]:
    frames = score.frames
    if not frames:
        return []
    first, last = frames[0], frames[-1]
    avg = "typical value" if legend.log else "average"
    entries: list[TranscriptEntry] = []
    sounding = [n for n in first.column_notes if n >= 0]
    melody = f" Melody from {midi_name(min(sounding))} to {midi_name(max(sounding))}." if sounding else ""
    entries.append(
        TranscriptEntry(
            frame=0,
            text=f"Starts at {first.label}: {avg} {fmt(to_real(first.stats.mean, legend))} {legend.unit}.{melody}",
        )
    )
    peak = first
    for i, frame in enumerate(frames):
        prev = frames[i - 1] if i > 0 else None
        if frame.hotspot and (prev is None or prev.hotspot is None):
            entries.append(
                TranscriptEntry(
                    frame=i,
                    text=f"{frame.label}: a hot spot appears in the {describe_region(frame.hotspot.x, frame.hotspot.y)}. "
                    "Listen for the bell.",
                )
            )
        if frame.hotspot is None and prev is not None and prev.hotspot is not None:
            entries.append(
                TranscriptEntry(frame=i, text=f"{frame.label}: the hot spot fades; the bell stops.")
            )
        if frame.tension > peak.tension:
            peak = frame
    if peak.index > 0 and peak.tension > 0.12:
        entries.append(
            TranscriptEntry(
                frame=peak.index,
                text=f"{peak.label}: the fastest change in the track. Notes clash and the tempo pushes forward.",
            )
        )
    change = to_real(last.stats.mean, legend) - to_real(first.stats.mean, legend)
    entries.append(
        TranscriptEntry(
            frame=last.index,
            text=f"Ends at {last.label}: {avg} {fmt(to_real(last.stats.mean, legend))} {legend.unit}, "
            f"{fmt_signed(change)} {legend.unit} since the start.",
        )
    )
    return sorted(entries, key=lambda e: e.frame)
