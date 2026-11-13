"""Image-to-music mapping rules. Single source of truth (docs/SONIFICATION_DESIGN.md).

Input: a stack of value grids (uint8, 0..250 = normalized value, 255 = no data).
Output: a deterministic Score the browser can play. Bump MAPPING_VERSION on any rule change.

v16 — accepted v15 notes, rounded swells and stronger measured peaks
==============================================================
One authored, disclosed chord per frame; each voice chooses only its chord tones. The measured
slice orders those tones monotonically. The relative contour is expanded within each frame so
small real changes are audible, but equal values remain equal: there is no decorative random
melody. Activity (not the primary value) chooses level and occupied slots on the steady 0.5 s grid.
All pitches, gains, durations, the chord phrase and its seed are stored in the score. Renderers
only realise this score, using the v14 acoustic strings, flute and hall.
"""

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median_low

import numpy as np
from numpy.typing import NDArray

from app.schemas.models import (
    FrameLayers,
    FrameScore,
    FrameStats,
    GridSize,
    Hotspot,
    InstrumentId,
    InstrumentInfo,
    Legend,
    PresetId,
    Score,
    ScoreKey,
    ThemeId,
    TranscriptEntry,
    VoicePart,
)
from app.vision.colorbar import ValueScale

MAPPING_VERSION = "16"
STEPS_PER_FRAME = 8
ROOT_MIDI = 50  # D3
GRID_MAX = 250
NO_DATA = 255

#: One set of notes per scan step, and a step is one quarter note at 120 BPM: a steady march of
#: 0.5 s per step, eight steps per frame, exactly 4.0 s per frame — the frame length the renderer
#: and the browser both use. Tempo never varies with the data, and the reference (~1 note per 0.8 s)
#: is the reason the step is a quarter note rather than a fast sixteenth sweep.
PULSE_BPM = 120

SCALES: dict[str, list[int]] = {
    "aeolian": [0, 2, 3, 5, 7, 8, 10],
    "major": [0, 2, 4, 5, 7, 9, 11],
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


#: Scale gives each theme its identity; the pulse is shared so the beat never drifts.
THEME_KEYS: dict[ThemeId, ThemeKey] = {
    "sea_level": ThemeKey("dorian", PULSE_BPM),
    "air_quality": ThemeKey("aeolian", PULSE_BPM),
    "wildfires": ThemeKey("phrygian", PULSE_BPM),
    "greenhouse_gases": ThemeKey("aeolian", PULSE_BPM),
    "water": ThemeKey("lydian", PULSE_BPM),
    "agriculture": ThemeKey("major", PULSE_BPM),
    "biodiversity": ThemeKey("major", PULSE_BPM),
    "energy": ThemeKey("mixolydian", PULSE_BPM),
    "disasters": ThemeKey("phrygian", PULSE_BPM),
    "weather": ThemeKey("mixolydian", PULSE_BPM),
    "ocean": ThemeKey("dorian", PULSE_BPM),
}

NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]

# --- the ensemble ----------------------------------------------------------------
REGISTERS: dict[InstrumentId, int] = {
    "bass": ROOT_MIDI - 24,  # D1  — low plucked string / synth bass
    "harp": ROOT_MIDI,  # D3  — brighter plucked texture
    "flute": ROOT_MIDI + 12,  # D4  — sustained breathy woodwind
}
VOICE_ORDER: tuple[InstrumentId, ...] = ("bass", "harp", "flute")

CONTOUR_MIN_SPAN: dict[InstrumentId, float] = {"bass": 0.15, "harp": 0.20, "flute": 0.05}

# Authored harmonic identities, not measurements. Each tuple is (name, absolute pitch classes).
# The eight-frame phrase turns the four-chord cycle into a question followed by a resolution.
CHORDS: dict[str, tuple[int, ...]] = {
    "Dm": (2, 5, 9),
    "G": (7, 11, 2),
    "C": (0, 4, 7),
    "Am": (9, 0, 4),
    "B♭": (10, 2, 5),
    "F": (5, 9, 0),
    "E♭": (3, 7, 10),
    "Cm": (0, 3, 7),
    "Gm": (7, 10, 2),
    "D": (2, 6, 9),
    "E": (4, 8, 11),
    "F♯m": (6, 9, 1),
    "A": (9, 1, 4),
    "Bm": (11, 2, 6),
}
PROGRESSIONS: dict[ThemeId, tuple[str, str, str, str]] = {
    "sea_level": ("Dm", "G", "C", "Am"),
    "ocean": ("Dm", "G", "C", "Am"),
    "air_quality": ("Dm", "B♭", "F", "C"),
    "wildfires": ("Dm", "E♭", "B♭", "Cm"),
    "greenhouse_gases": ("Dm", "B♭", "Gm", "Am"),
    "water": ("D", "E", "F♯m", "A"),
    "agriculture": ("D", "G", "Bm", "A"),
    "biodiversity": ("D", "Bm", "G", "A"),
    "energy": ("D", "C", "G", "D"),
    "disasters": ("Dm", "E♭", "Cm", "Dm"),
    "weather": ("D", "G", "C", "D"),
}
# Music and safety constants belong here, not in the renderer.
ACTIVITY_FLOOR = 0.08
GAIN_SLEW_DB_PER_S = 45.0  # strictly below 6 dB / 100 ms (60 dB/s)
VOICE_GAIN: dict[InstrumentId, float] = {"bass": 0.95, "harp": 0.90, "flute": 0.72}
INSTRUMENT_TEXT: dict[InstrumentId, dict[str, str]] = {
    "bass": {
        "family": "low plucked string (upright bass, cello pizzicato)",
        "carries": "the average measured value of each slice, ordered low to high within a frame",
        "entry": "one long low note in quiet slices; a walking chord line in active slices",
        "key_line": "a low plucked string walks the chord according to the slice's average value",
    },
    "harp": {
        "family": "harp (three ringing, slightly detuned strings)",
        "carries": "the highest measured value in each slice, ordered low to high within a frame",
        "entry": "sparse plucks in quiet areas; more chord-tone plucks where activity is greater",
        "key_line": "the harp arpeggiates chord tones according to the slice's highest value",
    },
    "flute": {
        "family": "flute (sustained breathy woodwind)",
        "carries": "the signed measured change of that slice since the previous frame",
        "entry": "joins when there is measured change; thins out again in quiet areas",
        "key_line": "a flute holds a line tracing change since the previous frame: higher for a "
        "larger increase, lower for a larger decrease",
    },
}


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


def voice_ladder(scale: str, instrument: InstrumentId) -> list[int]:
    """Two octaves of the theme scale, rooted in that instrument's register."""
    intervals = SCALES.get(scale, SCALES["dorian"])
    base = REGISTERS[instrument]
    ladder = [base + octave * 12 + iv for octave in range(2) for iv in intervals]
    ladder.append(base + 24)
    return ladder


def quantize(value01: float, ladder: list[int]) -> int:
    """Monotonic: a higher value never gives a lower note."""
    v = min(1.0, max(0.0, value01))
    return ladder[round(v * (len(ladder) - 1))]


def frame_duration_s(bpm: int) -> float:
    """Seconds of audio per frame: one quarter note (60/bpm) for each of the eight scan steps."""
    return STEPS_PER_FRAME * (60 / bpm)


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


def instruments_for(scale: str) -> list[InstrumentInfo]:
    """The three voices of a score in the given scale, with the register each one really uses."""
    out: list[InstrumentInfo] = []
    for iid in VOICE_ORDER:
        ladder = list(range(REGISTERS[iid], REGISTERS[iid] + 25))
        text = INSTRUMENT_TEXT[iid]
        out.append(
            InstrumentInfo(
                instrument=iid,
                family=text["family"],
                carries=text["carries"],
                entry=text["entry"],
                note_range=f"{midi_name(ladder[0])}-{midi_name(ladder[-1])}",
                range_low=ladder[0],
                range_high=ladder[-1],
            )
        )
    return out


def audio_key_text(legend: Legend, progression: Sequence[str] = ()) -> str:
    """Spoken truth: authored harmony is clearly separate from measured contour and intensity."""
    harmony = ", ".join(progression) if progression else "the theme's repeating eight-frame phrase"
    return " ".join(
        [
            f"The map measures {lower_first(legend.label)} in {legend.unit}, from {fmt(legend.min)} "
            f"to {fmt(legend.max)}.",
            "Three instruments share the map. "
            + "; ".join(INSTRUMENT_TEXT[i]["key_line"] for i in VOICE_ORDER)
            + ".",
            f"The composed chord sequence is {harmony}, one chord per frame. Chords give the piece "
            "its harmony; they are composition, not another data measurement. Every new note is a tone "
            "of that frame's chord.",
            "Within each frame and each instrument, a higher measured slice gives an equal or higher "
            "note. A bounded continuous mapping makes relative differences audible without "
            "stretching numerical dust into a whole-register leap. Pitch is a contour, not an exact reading in units; compare "
            "values within a frame, not pitches across a chord change. Equal values stay on the same note.",
            "Louder and fuller means more intense activity relative to the rest of this track. Quiet "
            "areas become genuinely soft, with fewer, longer notes; active areas bring more harp plucks "
            "and a stronger ensemble swell. Rounded rises and falls connect the measured gain targets; "
            "high activity gets extra peak emphasis without raising the output ceiling. The pulse never changes.",
            "Each frame lasts four seconds, with eight half-second slots scanning west to east. Early "
            "in the frame is west; late is east. Some slots are rests, not a faster or slower scan. "
            "The instruments stay near the centre: location is time, not left or right.",
            "There are no drums, drones or weather sounds. Plucked strings and flute ring in a hall; "
            "the previous chord may linger briefly as the next begins. A gap can be a quiet-area rest; "
            "a slice with no data makes no new sound, and a completely empty map is silent after the tail.",
        ]
    )


def frame_chord(voices: Sequence[VoicePart]) -> dict[InstrumentId, int]:
    """Overview mode: one chord per frame, each voice on the middle of its own pitches."""
    chord: dict[InstrumentId, int] = {}
    for part in voices:
        sounding = [n for n in part.notes if n >= 0]
        chord[part.instrument] = int(median_low(sounding)) if sounding else -1
    return chord


def _column_notes(values: NDArray[np.float64], valid: NDArray[np.bool_], ladder: list[int]) -> list[int]:
    """Single-line summary (slice mean and peak blended) — used by the on-screen contour."""
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


def _slice_measures(
    values: NDArray[np.float64],
    valid: NDArray[np.bool_],
    prev: tuple[NDArray[np.float64], NDArray[np.bool_]] | None,
) -> tuple[list[float], list[float], list[float], list[bool]]:
    """Per scan step: mean value, peak value, signed change since the previous frame, has data."""
    cols = values.shape[1]
    means: list[float] = []
    peaks: list[float] = []
    deltas: list[float] = []
    filled: list[bool] = []
    for step in range(STEPS_PER_FRAME):
        c0 = (step * cols) // STEPS_PER_FRAME
        c1 = ((step + 1) * cols) // STEPS_PER_FRAME
        block = values[:, c0:c1]
        mask = valid[:, c0:c1]
        data = block[mask]
        if data.size == 0:
            means.append(0.0)
            peaks.append(0.0)
            deltas.append(0.0)
            filled.append(False)
            continue
        means.append(float(data.mean()))
        peaks.append(float(data.max()))
        delta = 0.0
        if prev is not None:
            both = mask & prev[1][:, c0:c1]
            if both.any():
                delta = float((block[both] - prev[0][:, c0:c1][both]).mean())
        deltas.append(delta)
        filled.append(True)
    return means, peaks, deltas, filled


def chord_ladder(pcs: Sequence[int], instrument: InstrumentId) -> list[int]:
    """Two octaves of chord tones; fixed ordered register avoids arbitrary octave jumps."""
    base = REGISTERS[instrument]
    return [m for m in range(base, base + 25) if m % 12 in pcs]


def contour_targets(
    values: Sequence[float], filled: Sequence[bool], ladder: Sequence[int], min_span: float = 0.15
) -> list[float]:
    """Continuous monotone contour with a minimum meaningful measurement span.

    Relative comparisons are within a frame. A tiny outlier cannot span two octaves: gain of
    the transfer is capped by min_span, while ties remain equal and flat fields remain static.
    """
    observed = [v for v, ok in zip(values, filled, strict=True) if ok]
    if not observed:
        return [float(ladder[0]) for _ in values]
    lo, hi = min(observed), max(observed)
    centre = (lo + hi) / 2
    span = max(hi - lo, min_span)
    return [
        float(ladder[0] + np.clip(0.5 + (v - centre) / span, 0, 1) * (ladder[-1] - ladder[0])) for v in values
    ]


def _activity(raw: Sequence[float], lo: float, hi: float) -> list[float]:
    """Track-relative activity, blended with the absolute phenomenon intensity.

    A flat field isn't exaggerated by normalising numerical dust: <5% activity range keeps the
    absolute activity. The observed bounds are recorded indirectly by the original layers.
    """
    if hi - lo < 0.05:
        return [float(np.clip(v, 0, 1)) for v in raw]
    return [float(np.clip(0.15 * v + 0.85 * np.clip((v - lo) / max(hi - lo, 0.15), 0, 1), 0, 1)) for v in raw]


def _occupied(iid: InstrumentId, k: int, activity: float, filled: Sequence[bool]) -> bool:
    """Density follows activity, while every possible onset stays on the same scan grid."""
    if not filled[k]:
        return False
    entry = k == 0 or not filled[k - 1]
    if iid == "bass":
        return entry or k % 4 == 0 or (activity >= 0.30 and k % 2 == 0) or activity >= 0.62
    if iid == "harp":
        return activity >= 0.12 and (k % 4 == 0 or (activity >= 0.35 and k % 2 == 0) or activity >= 0.58)
    return activity >= 0.20 and (k % 2 == 0 or activity >= 0.65)


def activity_gain(activity: float) -> float:
    """Monotone intensity fader with restrained peak emphasis; no new musical events.

    The quiet floor is unchanged. At full activity the target is 1.4 times the old maximum,
    about 2.9 dB more contrast before global peak normalization. This is not extra headroom.
    """
    a = float(np.clip(activity, 0.0, 1.0))
    return float((ACTIVITY_FLOOR + (1.0 - ACTIVITY_FLOOR) * a**1.6) * (1.0 + 0.40 * a**4))


def _voices(
    *,
    chord_pcs: Sequence[int],
    means: Sequence[float],
    peaks: Sequence[float],
    deltas: Sequence[float],
    filled: Sequence[bool],
    activity: Sequence[float],
    changing: bool,
) -> list[VoicePart]:
    """Voice the current chord from measured order; choose rests and articulation from activity."""
    channels = {"bass": means, "harp": peaks, "flute": deltas}
    parts: list[VoicePart] = []
    for iid in VOICE_ORDER:
        ladder = chord_ladder(chord_pcs, iid)
        measured = channels[iid]
        targets = contour_targets(measured, filled, ladder, CONTOUR_MIN_SPAN[iid])
        notes, gains, durations = [], [], []
        for k in range(STEPS_PER_FRAME):
            sounding = _occupied(iid, k, activity[k], filled) and (iid != "flute" or changing)
            # Nearest chord tone is monotone in the unrounded measured target, including ties.
            note = min(ladder, key=lambda n: (abs(n - targets[k]), n)) if sounding else -1
            notes.append(note)
            gains.append(round(VOICE_GAIN[iid] * activity_gain(activity[k]), 6) if filled[k] else 0.0)
            dur = {
                "bass": 3.8 - 2.4 * activity[k],
                "harp": 4.0 - 0.5 * activity[k],
                "flute": 2.6 - 1.2 * activity[k],
            }[iid]
            # New dry notes never carry a non-chord pitch into the next frame; the hall may ring.
            durations.append(round(min(dur, STEPS_PER_FRAME - k), 4) if sounding else 0.0)
        # A continuous region should sound continuous, not be re-struck at every slot.
        # Hold equal chord tones through valid slots; gain automation still follows each slice.
        last = -1
        for k, note in enumerate(notes):
            if not filled[k]:
                last = -1
            elif note >= 0:
                if last >= 0 and notes[last] == note:
                    durations[last] = min(float(STEPS_PER_FRAME - last), k - last + durations[k])
                    notes[k], durations[k] = -1, 0.0
                else:
                    last = k
        parts.append(
            VoicePart(
                instrument=iid,
                notes=notes,
                gains=gains,
                durations=durations,
                values=[round(v, 8) for v in measured],
                pitch_targets=targets,
            )
        )
    return parts


def build_score(
    *,
    track_id: str,
    theme: ThemeId,
    legend: Legend,
    labels: list[str],
    grids: NDArray[np.uint8],
    preset: PresetId,
    layers: Sequence[FrameLayers] | None = None,
) -> Score:
    """grids: (frames, rows, cols) uint8."""
    key = THEME_KEYS[theme]
    ladder = scale_ladder(key.scale)
    n_frames, rows, cols = grids.shape
    valid_all = grids != NO_DATA
    values_all = np.where(valid_all, grids.astype(np.float64) / GRID_MAX, 0.0)
    first_valid = values_all[0][valid_all[0]]
    start_mean = float(first_valid.mean()) if first_valid.size else 0.0

    seed = int.from_bytes(hashlib.sha256(f"{track_id}:{theme}".encode()).digest()[:4], "little")
    a, b, c, d = PROGRESSIONS[theme]
    # Seed chooses the answering phrase's middle order, never a random note at playback.
    phrase = [a, b, c, d, a, c if seed % 2 else b, b if seed % 2 else c, a]
    measures = [
        _slice_measures(values_all[i], valid_all[i], (values_all[i - 1], valid_all[i - 1]) if i > 0 else None)
        for i in range(n_frames)
    ]
    raw_activity = [
        list(layers[i].column_intensity)
        if layers is not None
        else [0.65 * p + 0.35 * m for p, m in zip(measures[i][1], measures[i][0], strict=True)]
        for i in range(n_frames)
    ]
    observed_activity = [
        v for i, row in enumerate(raw_activity) for k, v in enumerate(row) if measures[i][3][k]
    ]
    lo, hi = (
        (float(np.percentile(observed_activity, 10)), float(np.percentile(observed_activity, 90)))
        if observed_activity
        else (0.0, 0.0)
    )
    frames: list[FrameScore] = []
    for i in range(n_frames):
        valid = valid_all[i]
        values = values_all[i]
        data = values[valid]
        label = labels[i] if i < len(labels) else f"Frame {i + 1}"
        if data.size == 0:
            mean = vmin = vmax = 0.0
            extreme = 0.0
            argmax = 0
        else:
            mean, vmin, vmax = (
                float(data.mean()),
                float(data.min()),
                float(data.max()),
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
        parts_text = [
            f"{label}. {legend.label} {verb} {fmt(to_real(mean, legend))} {legend.unit}, ranging from "
            f"{fmt(to_real(vmin, legend))} to {fmt(to_real(vmax, legend))}.",
            (
                f"The strongest values are in the {describe_region(hotspot.x, hotspot.y)}; that is "
                "where the harp reaches its highest notes."
                if hotspot
                else ""
            ),
            f"Change since the first frame: {fmt_signed(change)} {legend.unit}." if i > 0 else "",
        ]
        means, peaks, deltas, filled = measures[i]
        activity = _activity(raw_activity[i], lo, hi)
        chord_name = phrase[i % len(phrase)]
        pcs = list(CHORDS[chord_name])
        voices = _voices(
            chord_pcs=pcs,
            means=means,
            peaks=peaks,
            deltas=deltas,
            filled=filled,
            activity=activity,
            changing=i > 0 and any(abs(d) >= 1e-4 for d in deltas),
        )
        frame_swell = 0.65 + 0.35 * float(np.mean(activity))
        envelope = [frame_swell * (0.65 + 0.35 * a) for a in activity]
        parts_text.append(
            f"Chord {chord_name}: composed harmony. Louder and fuller slices mean more intense activity."
        )
        frames.append(
            FrameScore(
                index=i,
                label=label,
                tension=round(tension, 4),
                loudness=round(float(np.mean(activity)), 4),
                brightness=round(mean, 4),
                rhythm_density=sum(n >= 0 for part in voices for n in part.notes),
                column_notes=_column_notes(values, valid, ladder),
                voices=voices,
                chord_name=chord_name,
                chord_pcs=pcs,
                activity=activity,
                gain_envelope=envelope,
                layers=layers[i] if layers is not None else None,
                hotspot=hotspot,
                stats=FrameStats(
                    mean=round(mean, 4),
                    min=round(vmin, 4),
                    max=round(vmax, 4),
                    extreme_share=round(extreme, 4),
                ),
                description=" ".join(p for p in parts_text if p),
            )
        )

    return Score(
        mapping_version=MAPPING_VERSION,
        track_id=track_id,
        preset=preset,
        seed=seed,
        chord_progression=phrase,
        key=ScoreKey(
            root=midi_name(ROOT_MIDI), root_midi=ROOT_MIDI, scale=key.scale.replace("_", " "), bpm=key.bpm
        ),
        grid=GridSize(cols=cols, rows=rows),
        steps_per_frame=STEPS_PER_FRAME,
        instruments=instruments_for(key.scale),
        frames=frames,
    )


def build_transcript(score: Score, legend: Legend) -> list[TranscriptEntry]:
    """Timeline text for screen readers: entrances, hot spots, the fastest change, start and end."""
    frames = score.frames
    if not frames:
        return []
    first, last = frames[0], frames[-1]
    avg = "typical value" if legend.log else "average"
    entries: list[TranscriptEntry] = []
    harp_line = next((p.notes for p in first.voices if p.instrument == "harp"), [])
    sounding = [n for n in harp_line if n >= 0]
    melody = (
        f" The harp moves from {midi_name(min(sounding))} to {midi_name(max(sounding))}." if sounding else ""
    )
    entries.append(
        TranscriptEntry(
            frame=0,
            text=f"Starts at {first.label}: {avg} {fmt(to_real(first.stats.mean, legend))} {legend.unit}. Composed chord {first.chord_name}.{melody} Louder and fuller areas mean more intense activity; quiet areas have fewer, longer notes.",
        )
    )

    def sounding_instruments(frame: FrameScore) -> set[InstrumentId]:
        return {p.instrument for p in frame.voices if any(n >= 0 for n in p.notes)}

    peak = first
    heard: set[InstrumentId] = sounding_instruments(first)
    for i, frame in enumerate(frames):
        if i > 0 and frame.chord_name != frames[i - 1].chord_name:
            entries.append(
                TranscriptEntry(
                    frame=i,
                    text=f"{frame.label}: the composed chord changes to {frame.chord_name}. Pitch comparisons describe relative values inside this frame, not across this chord change.",
                )
            )
        prev = frames[i - 1] if i > 0 else None
        now = sounding_instruments(frame)
        for iid in sorted(now - heard, key=VOICE_ORDER.index):
            entries.append(
                TranscriptEntry(
                    frame=i,
                    text=f"{frame.label}: the {iid} joins — it carries {INSTRUMENT_TEXT[iid]['carries']}.",
                )
            )
        heard |= now
        if frame.hotspot and (prev is None or prev.hotspot is None):
            entries.append(
                TranscriptEntry(
                    frame=i,
                    text=f"{frame.label}: a hot spot appears in the {describe_region(frame.hotspot.x, frame.hotspot.y)}. "
                    "Listen for the harp reaching its highest notes partway through each frame.",
                )
            )
        if frame.hotspot is None and prev is not None and prev.hotspot is not None:
            entries.append(
                TranscriptEntry(
                    frame=i, text=f"{frame.label}: the hot spot fades; the harp's top notes stop."
                )
            )
        if frame.tension > peak.tension:
            peak = frame
    if peak.index > 0 and peak.tension > 0.12:
        entries.append(
            TranscriptEntry(
                frame=peak.index,
                text=f"{peak.label}: the fastest change in the track. The flute moves furthest up or "
                "down here, while the pulse stays the same.",
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
