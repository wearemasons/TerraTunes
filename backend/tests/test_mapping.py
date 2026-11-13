import numpy as np

from app.mapping.rules import NO_DATA, STEPS_PER_FRAME, build_score, quantize, scale_ladder
from app.schemas.models import Legend

LEGEND = Legend(label="Value", unit="u", min=0, max=1, anchors=[])


def test_pitch_is_monotonic_for_every_scale() -> None:
    for scale in ["dorian", "minor_pentatonic", "whole_tone", "phrygian_dominant"]:
        ladder = scale_ladder(scale)
        notes = [quantize(v / 100, ladder) for v in range(101)]
        assert notes == sorted(notes)
        assert notes[0] == ladder[0] and notes[-1] == ladder[-1]


def test_gradient_scan_rises_west_to_east() -> None:
    grid = np.tile(np.linspace(0, 250, 64).astype(np.uint8), (32, 1))[None]
    score = build_score(
        track_id="t", theme="sea_level", legend=LEGEND, labels=["a"], grids=grid, preset="musical"
    )
    notes = score.frames[0].column_notes
    assert len(notes) == STEPS_PER_FRAME
    assert notes == sorted(notes)
    assert notes[0] < notes[-1]


def test_no_data_is_silent() -> None:
    grid = np.full((1, 8, 32), NO_DATA, dtype=np.uint8)
    score = build_score(
        track_id="t", theme="sea_level", legend=LEGEND, labels=["a"], grids=grid, preset="musical"
    )
    assert all(n == -1 for n in score.frames[0].column_notes)
    assert score.frames[0].hotspot is None


def test_score_is_deterministic_and_tension_tracks_change() -> None:
    rng = np.random.default_rng(1)
    grids = rng.integers(0, 250, size=(3, 16, 32), dtype=np.uint8)
    grids[1] = grids[0]  # no change between 0 and 1
    a = build_score(track_id="t", theme="wildfires", legend=LEGEND, labels=[], grids=grids, preset="musical")
    b = build_score(track_id="t", theme="wildfires", legend=LEGEND, labels=[], grids=grids, preset="musical")
    assert a == b
    assert a.frames[1].tension == 0
    assert a.frames[2].tension > 0


def test_hotspot_found_at_peak() -> None:
    grid = np.full((1, 20, 40), 20, dtype=np.uint8)
    grid[0, 5, 30] = 250
    score = build_score(
        track_id="t", theme="wildfires", legend=LEGEND, labels=["a"], grids=grid, preset="musical"
    )
    hotspot = score.frames[0].hotspot
    assert hotspot is not None
    assert abs(hotspot.x - (30.5 / 40)) < 1e-9
    assert abs(hotspot.y - (5.5 / 20)) < 1e-9
