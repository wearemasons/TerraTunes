"""Image-to-music mapping rules. Single source of truth (docs/SONIFICATION_DESIGN.md).

Input: a stack of value grids (uint8, 0..250 = normalized value, 255 = no data).
Output: a deterministic Score the browser can play. Bump MAPPING_VERSION on any rule change.

v14 — the ensemble model (was: a physical "soundscape" of filtered noise, drones and hits)
===========================================================================================
The audible target is NASA's ocean-colour / phytoplankton sonification: a small ensemble of
*melodic* instruments, one per measured channel, every pitch quantised to the theme scale, and one
set of notes per scan step on a perfectly steady grid. Every musical decision is made here;
`app/sonify/render.py` only turns these voices into samples, and
`frontend/src/lib/audio/phenomena.ts` plays the same voice list if it has to synthesise in the
browser. Nothing downstream picks pitches, octaves or entrances.

    bass   <- mean calibrated value of the slice    -> low plucked string / synth bass
    harp   <- highest calibrated value of the slice -> brighter plucked texture
    flute  <- slice change since the previous frame -> sustained breathy woodwind

Values are the calibrated colour-to-value measurement (nearest colourbar colour in CIELAB).
Quantising to a scale only changes how a pitch is *spelled*, never its order — see the monotonic
tests. Silence always means "no data", or "this channel has not become active yet".
"""

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median_low

import numpy as np
from numpy.typing import NDArray

from app.schemas.models import (
    Alert,
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

MAPPING_VERSION = "14"
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
    "air_quality": ThemeKey("minor_pentatonic", PULSE_BPM),
    "wildfires": ThemeKey("phrygian", PULSE_BPM),
    "greenhouse_gases": ThemeKey("minor_pentatonic", PULSE_BPM),
    "water": ThemeKey("lydian", PULSE_BPM),
    "agriculture": ThemeKey("major_pentatonic", PULSE_BPM),
    "biodiversity": ThemeKey("major_pentatonic", PULSE_BPM),
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

#: ... the harp joins as soon as the picture has real contrast, i.e. the frame's highest value
#: stands at least this much (as a fraction of the colorbar) above the frame's average.
HARP_CONTRAST = 0.10
#: and the flute joins as soon as the map has really moved: mean |change| of the frame, as a
#: fraction of the colorbar. A voice that has joined stays for the rest of the track, which is
#: what makes the layering additive.
FLUTE_ENTRY = 0.0025
#: +-25 % of the colorbar of change spans the whole flute register.
FLUTE_SPAN = 0.25

#: Plain-language text for the audio key and the API (what each voice carries).
INSTRUMENT_TEXT: dict[InstrumentId, dict[str, str]] = {
    "bass": {
        "family": "low plucked string (upright bass, cello pizzicato)",
        "carries": "the average value of the slice the scan is on",
        "entry": "starts as soon as the map has data",
        "key_line": "a low plucked string plays the average value of each slice — short notes, low "
        "in pitch",
    },
    "harp": {
        "family": "harp (brighter plucked texture)",
        "carries": "the highest value found in that slice",
        "entry": f"joins once the highest value is {HARP_CONTRAST:.0%} of the colorbar above the "
        "average, then stays",
        "key_line": "the harp plays the highest value in each slice, an octave and more above it",
    },
    "flute": {
        "family": "flute (sustained breathy woodwind)",
        "carries": "how much that slice changed since the previous frame",
        "entry": "joins once the map is changing between frames, then stays",
        "key_line": (
            "a flute holds longer notes that trace the change since the previous frame — it rises "
            "where values went up and falls where they went down"
        ),
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
        ladder = voice_ladder(scale, iid)
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


def audio_key_text(legend: Legend) -> str:
    """The spoken key. It describes only what the three instruments actually play: no drone, no
    percussion, no weather noise, position carried by time rather than by panning, and the hall
    tail that lets a plucked note keep ringing after it has been played."""
    return " ".join(
        [
            f"Pitch shows {lower_first(legend.label)} in {legend.unit}: the lowest note of any "
            f"instrument means {fmt(legend.min)} and the highest means {fmt(legend.max)}.",
            "Three instruments share the map, each with one job. "
            + "; ".join(INSTRUMENT_TEXT[iid]["key_line"] for iid in VOICE_ORDER)
            + ".",
            "There is no drone, no drum and no weather sound: when the three lines sound together "
            "they form the chords. Each note rings on in a hall-like reverb, so a plucked string "
            "keeps fading after it has been played.",
            "The scan steps west to east and one set of notes sounds for each step, at a steady "
            "march that never speeds up or slows down, so early in a frame is the west edge of the "
            "map and late in the frame is the east. The sound sits in the middle with only a slight "
            "spread that never moves: position comes from timing, not from left or right.",
            "A rising line means higher values and a falling line means lower values. Loudness is "
            "kept almost level and carries no information.",
            "The harp lifts one octave for the slice where the map first crosses one of the named "
            "lines in the listening guide.",
            "Silence means no data — for example land on an ocean map — or that a voice has not "
            "joined yet.",
        ]
    )


def accent_steps(alerts: Sequence[Alert], steps: int) -> set[int]:
    """Scan steps where a threshold has just been crossed: the harp lifts an octave there.

    This is the only accent in the model and it is a note of one of the three instruments, not a
    sound effect: there are no bells, chimes, clicks, drum hits or weather noises in the render.
    """
    if steps <= 0:
        return set()
    return {min(steps - 1, max(0, int(a.x * steps))) for a in alerts if a.new}


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


def _entry(
    *,
    has_data: bool,
    frame_contrast: float,
    frame_change: float,
    prev_active: dict[InstrumentId, bool],
) -> dict[InstrumentId, bool]:
    """Additive layer entry: once a channel is active, its instrument stays in."""
    return {
        "bass": prev_active["bass"] or has_data,
        "harp": prev_active["harp"] or frame_contrast >= HARP_CONTRAST,
        "flute": prev_active["flute"] or frame_change >= FLUTE_ENTRY,
    }


def _voices(
    *,
    scale: str,
    means: Sequence[float],
    peaks: Sequence[float],
    deltas: Sequence[float],
    filled: Sequence[bool],
    active: dict[InstrumentId, bool],
) -> list[VoicePart]:
    """Quantise the three measured channels onto the three instruments."""
    parts: list[VoicePart] = []
    for iid in VOICE_ORDER:
        ladder = voice_ladder(scale, iid)
        notes: list[int] = []
        for k in range(STEPS_PER_FRAME):
            if not active[iid] or not filled[k]:
                notes.append(-1)
            elif iid == "bass":
                notes.append(quantize(means[k], ladder))
            elif iid == "harp":
                notes.append(quantize(peaks[k], ladder))
            else:
                change01 = 0.5 + 0.5 * max(-1.0, min(1.0, deltas[k] / FLUTE_SPAN))
                notes.append(quantize(change01, ladder))
        parts.append(VoicePart(instrument=iid, notes=notes))
    return parts


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
    active: dict[InstrumentId, bool] = {"bass": False, "harp": False, "flute": False}
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
        means, peaks, deltas, filled = _slice_measures(
            values, valid, (values_all[i - 1], valid_all[i - 1]) if i > 0 else None
        )
        active = _entry(
            has_data=bool(data.size), frame_contrast=float(vmax - mean), frame_change=tension / 8.0, prev_active=active
        )
        voices = _voices(
            scale=key.scale, means=means, peaks=peaks, deltas=deltas, filled=filled, active=active
        )
        frames.append(
            FrameScore(
                index=i,
                label=label,
                tension=round(tension, 4),
                loudness=round(min(1.0, 0.3 + 0.5 * extreme + 0.3 * mean), 4),
                brightness=round(mean, 4),
                rhythm_density=1 if std < 0.08 else 2 if std < 0.18 else 4,
                column_notes=_column_notes(values, valid, ladder),
                voices=voices,
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
    melody = f" The harp moves from {midi_name(min(sounding))} to {midi_name(max(sounding))}." if sounding else ""
    entries.append(
        TranscriptEntry(
            frame=0,
            text=f"Starts at {first.label}: {avg} {fmt(to_real(first.stats.mean, legend))} {legend.unit}.{melody}",
        )
    )

    def sounding_instruments(frame: FrameScore) -> set[InstrumentId]:
        return {p.instrument for p in frame.voices if any(n >= 0 for n in p.notes)}

    peak = first
    heard: set[InstrumentId] = sounding_instruments(first)
    for i, frame in enumerate(frames):
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
                TranscriptEntry(frame=i, text=f"{frame.label}: the hot spot fades; the harp's top notes stop.")
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
