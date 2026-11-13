"""The orchestra: steady pulse, centred mix, level dynamics, acoustic (harmonic) content only."""

import numpy as np

from app.mapping.rules import VOICE_ORDER, build_score, voice_ladder
from app.schemas.models import FrameLayers, FrameScore, Legend, LegendTick, Score
from app.sonify.analysis import analyse_frames, real_values
from app.sonify.regions import region_name
from app.sonify.render import FRAME_S, LEVEL, PAN, VOICES, _note_gain, encode, render
from app.sonify.spec import IntensityMap, SoundSpec, Threshold
from app.sonify.synth import SR

LEGEND = Legend(
    label="Wind",
    unit="m/s",
    min=0,
    max=40,
    anchors=[],
    ticks=[LegendTick(position=0, value=0), LegendTick(position=1, value=40)],
)
SPEC = SoundSpec(
    phenomenon="wind",
    intensity=IntensityMap(lo=0, hi=33),
    thresholds=[Threshold(value=32.7, label="hurricane-force wind")],
)


def grids() -> np.ndarray:
    g = np.zeros((3, 24, 48), dtype=np.uint8)  # calm everywhere
    g[1, 8:12, 36:40] = 250  # frame 1: a 40 m/s storm in the east, northern band
    g[2, 8:12, 36:40] = 250  # still there in frame 2
    return g


def make_score(source: np.ndarray | None = None) -> Score:
    return build_score(
        track_id="t",
        theme="weather",
        legend=LEGEND,
        labels=[],
        grids=grids() if source is None else source,
        preset="musical",
    )


def line(frame: FrameScore, instrument: str) -> list[int]:
    return next(p.notes for p in frame.voices if p.instrument == instrument)


def _render(layers: list[FrameLayers], melody: bool = True) -> np.ndarray:
    return render(
        track_id="t", score=make_score(), layers=layers, spec=SPEC, mode="sweep", melody=melody
    )


def _window_db(audio: np.ndarray, width_s: float = 0.25) -> np.ndarray:
    w = int(width_s * SR)
    n = audio.shape[1] // w * w
    mono = audio[:, :n].reshape(2, -1, w).mean(axis=0)
    return 20 * np.log10(np.sqrt((mono**2).mean(axis=1) + 1e-12))


def _onsets(audio: np.ndarray, min_sep_s: float = 0.3) -> np.ndarray:
    """Spectral-flux onsets.

    Events closer together than `min_sep_s` count once: several instruments striking the same scan
    step are one event, and the flute's vibrato arriving a fifth of the way into a note is not.
    """
    mono = audio.mean(axis=0)
    win, hop = 512, 128
    frames = np.lib.stride_tricks.sliding_window_view(mono, win)[::hop] * np.hanning(win)
    mags = np.abs(np.fft.rfft(frames.astype(np.float32), axis=1))
    flux = np.maximum(0.0, np.diff(mags, axis=0, prepend=mags[:1])).sum(axis=1)
    thr = np.convolve(flux, np.ones(41) / 41, mode="same") * 2.0 + 0.5 * flux.std()
    times: list[float] = []
    for i in range(1, len(flux) - 1):
        if (
            flux[i] > thr[i]
            and flux[i] >= flux[i - 1]
            and (not times or i * hop / SR - times[-1] > min_sep_s)
        ):
            times.append(i * hop / SR)
    return np.array(times)


def _lr_balance_db(audio: np.ndarray) -> float:
    return abs(10 * np.log10((audio[0] ** 2).mean()) - 10 * np.log10((audio[1] ** 2).mean()))


def test_real_values_and_regions() -> None:
    real = real_values(np.array([[0, 125, 250, 255]], dtype=np.uint8), LEGEND)
    assert real[0, 0] == 0 and real[0, 1] == 20 and real[0, 2] == 40 and np.isnan(real[0, 3])
    assert region_name(0.5, 0.25) == "Europe"  # 45°N, 0°E


def test_one_line_per_instrument_and_centred_placement() -> None:
    sc = make_score()
    assert [p.instrument for p in sc.frames[0].voices] == list(VOICE_ORDER)
    assert sc.instruments is not None and len(sc.instruments) == 3
    assert {v.instrument for v in VOICES} == {"bass", "harp", "flute"}
    # No hard panning anywhere: the deepest placement is well under the allowed 0.25.
    assert max(abs(p) for p in PAN.values()) <= 0.25


def test_layers_and_additive_entry() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    assert layers[0].intensity == 0 and not layers[0].alerts
    assert layers[1].alerts and layers[1].alerts[0].new and layers[1].alerts[0].x > 0.7
    assert not layers[2].alerts[0].new  # already over the line: no repeat marker
    sc = make_score()
    # The storm arrives in frame 1: the harp's channel becomes active there and stays active.
    assert all(n == -1 for n in line(sc.frames[0], "harp"))
    assert any(n >= 0 for n in line(sc.frames[1], "harp"))
    assert any(n >= 0 for n in line(sc.frames[2], "harp"))
    # ... and the flute joins on the frame that actually changed, as long notes only.
    assert any(n >= 0 for n in line(sc.frames[1], "flute"))
    # the flute line holds its notes: one per scan step, no faster movement than the plucks
    assert line(sc.frames[1], "flute").count(-1) < len(line(sc.frames[1], "flute"))


def test_instruments_carry_their_own_channel() -> None:
    """Bass <- slice mean, harp <- slice peak: one extreme cell lifts the harp, not the bass."""
    flat = np.full((1, 24, 48), 100, dtype=np.uint8)
    spiked = flat.copy()
    spiked[0, 0, 0] = 250
    a, b = make_score(flat), make_score(spiked)
    assert max(line(b.frames[0], "harp")) > max(line(a.frames[0], "harp"))
    assert abs(np.mean(line(a.frames[0], "bass")) - np.mean(line(b.frames[0], "bass"))) <= 2
    quiet = make_score(np.full((1, 8, 32), 255, dtype=np.uint8))
    assert all(n == -1 for p in quiet.frames[0].voices for n in p.notes)


def test_notes_are_quantised_to_the_voice_scale() -> None:
    sc = make_score()
    scale = sc.key.scale.replace(" ", "_")
    for part in sc.frames[2].voices:
        assert len(part.notes) == sc.steps_per_frame
        allowed = set(voice_ladder(scale, part.instrument))
        assert all(n in allowed or n == -1 for n in part.notes)


def test_render_is_deterministic_and_bounded() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    a, b = _render(layers), _render(layers)
    assert a.shape == b.shape and np.array_equal(a, b)
    assert np.abs(a).max() <= 0.9
    only_bass = _render(layers, melody=False)
    assert np.abs(only_bass).max() <= 0.9 and not np.array_equal(a, only_bass)


def test_pulse_is_steady_on_the_scan_grid() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    audio = _render(layers)
    step_s = FRAME_S["sweep"] / make_score().steps_per_frame
    assert abs(step_s - 0.5) < 1e-6  # one quarter note per scan step, 8 steps per 4 s frame
    times = _onsets(audio)
    assert len(times) > 15
    off_grid = np.abs(times / step_s - np.round(times / step_s)) * step_s
    assert float((off_grid < 0.04).mean()) > 0.85  # events land on scan steps
    ioi = np.diff(times)
    assert abs(float(np.median(ioi)) - step_s) < 0.03  # one set per step, no tempo drift
    assert float(np.percentile(ioi, 90)) - float(np.percentile(ioi, 10)) < 0.05


def test_dynamic_range_is_deliberately_narrow() -> None:
    """The brief asks for moderate, consistent dynamics: nothing may swell or duck the mix."""
    # 1. By construction the measured slice intensity may move a note by at most 2.7 dB.
    gains = [_note_gain(LEVEL["bass"], i / 100) for i in range(101)]
    spread_db = 20 * np.log10(max(gains) / min(gains))
    assert spread_db < 3.0
    # 2. In the render, one-second windows of the musical part stay within a modest band.
    layers = analyse_frames(grids(), LEGEND, SPEC)
    audio = _render(layers)
    db = _window_db(audio[:, : int(len(layers) * FRAME_S["sweep"] * SR)], 1.0)
    assert float(np.percentile(db, 90)) - float(np.percentile(db, 10)) < 9.0


def test_stereo_is_centred() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    audio = _render(layers)
    # Only the reverb differs between the ears; no instrument is hard-panned.
    assert float(np.corrcoef(audio[0], audio[1])[0, 1]) > 0.90
    assert _lr_balance_db(audio) < 2.0


def test_notes_leave_a_hall_tail() -> None:
    """The reference is a wet, orchestral space: an isolated pluck must keep ringing."""
    layers = analyse_frames(grids(), LEGEND, SPEC)
    audio = _render(layers)
    sr = SR
    dry_end = int(3 * FRAME_S["sweep"] * sr)  # the last scheduled note starts before this
    tail_start = dry_end + int(0.6 * sr)
    peak = float(np.abs(audio).max())
    tail = float(np.abs(audio[:, tail_start : tail_start + int(0.4 * sr)]).max())
    assert tail > 0.0
    assert 20 * np.log10(tail / peak + 1e-12) > -45.0  # still audible ~0.6 s after the last note
    assert 20 * np.log10(tail / peak + 1e-12) < -6.0  # and it is a tail, not another note


def test_spectrum_is_harmonic_not_broadband() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    audio = _render(layers)
    notes = {n for f in make_score().frames for p in f.voices for n in p.notes if n >= 0}
    assert notes
    x = audio.mean(axis=0)
    n = 1 << 15
    hop = n // 2
    ratios: list[float] = []
    for i in range((len(x) - n) // hop):
        seg = x[i * hop : i * hop + n]
        if float(np.abs(seg).max()) < 1e-3:
            continue
        p = np.abs(np.fft.rfft(seg * np.hanning(n))) ** 2
        f = np.fft.rfftfreq(n, 1 / SR)
        mask = np.zeros(len(p), dtype=bool)
        for midi in notes:
            f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
            for h in range(1, 16):
                if f0 * h < f[-1]:
                    mask |= np.abs(f - f0 * h) < 25.0
        ratios.append(float(p[mask].sum() / (p.sum() + 1e-20)))
    assert float(np.mean(ratios)) > 0.8


def test_east_storm_is_late_in_the_frame_not_hard_right() -> None:
    """Position is carried by time inside the frame: the storm is in the east, so the high notes
    come in the second half of frame 1 — and the left/right balance barely moves."""
    layers = analyse_frames(grids(), LEGEND, SPEC)
    sc = make_score()
    mid = len(line(sc.frames[1], "harp")) // 2
    assert max(line(sc.frames[1], "harp")[mid:]) > max(line(sc.frames[1], "harp")[:mid])
    assert max(line(sc.frames[1], "bass")[mid:]) > max(line(sc.frames[1], "bass")[:mid])
    audio = _render(layers)
    fs = int(FRAME_S["sweep"] * SR)
    first_half = _lr_balance_db(audio[:, fs : int(1.5 * fs)])
    assert first_half < 3.0


def test_overview_mode_is_a_steady_chord_per_frame() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    audio = render(
        track_id="t", score=make_score(), layers=layers, spec=SPEC, mode="overview", melody=True
    )
    assert np.abs(audio).max() <= 0.9
    times = _onsets(audio, min_sep_s=0.8)
    assert abs(float(np.median(np.diff(times))) - FRAME_S["overview"]) < 0.2


def test_encode_formats() -> None:
    audio = np.zeros((2, SR // 2), dtype=np.float32)
    assert encode(audio, "wav")[:4] == b"RIFF"
    mp3 = encode(audio, "mp3")
    assert len(mp3) > 100 and (mp3[:3] == b"ID3" or mp3[0] == 0xFF)
