"""Focused checks for deterministic, finite, lightly organic instrument grains."""

import numpy as np
import pytest

from app.sonify.synth import SR, Synth


@pytest.mark.parametrize(
    ("voice", "freq", "dur"),
    [("plucked_bass", 110.0, 0.37), ("harp", 220.0, 0.83), ("flute", 330.0, 0.47)],
)
def test_grains_are_deterministic_exact_length_and_unclipped(
    voice: str, freq: float, dur: float
) -> None:
    a = getattr(Synth(2 * SR, 17), voice)(freq, dur)
    b = getattr(Synth(2 * SR, 17), voice)(freq, dur)

    assert a.dtype == np.float32
    assert len(a) == int(dur * SR)
    assert np.array_equal(a, b)
    assert np.isfinite(a).all()
    assert np.abs(a).max() <= 1.0
    assert np.isclose(np.abs(a).max(), 1.0, atol=1e-6)


def test_partial_drift_stays_bounded_and_continuous() -> None:
    k = np.arange(int(2.0 * SR), dtype=np.float32) / SR
    ratio = Synth._partial_drift(k, depth_cents=1.5, rate_hz=0.25, phase=0.37)
    cents = 1200.0 * np.log2(ratio.astype(np.float64))

    assert ratio.dtype == np.float32
    assert np.isfinite(ratio).all()
    assert float(np.abs(cents).max()) <= 1.50001
    assert float(np.abs(np.diff(cents)).max()) < 0.02
