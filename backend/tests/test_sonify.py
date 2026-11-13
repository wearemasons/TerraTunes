import numpy as np

from app.schemas.models import FrameLayers, Legend, LegendTick
from app.sonify.analysis import analyse_frames, real_values
from app.sonify.regions import region_name
from app.sonify.render import FRAME_S, encode, render
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


def test_real_values_and_regions() -> None:
    real = real_values(np.array([[0, 125, 250, 255]], dtype=np.uint8), LEGEND)
    assert real[0, 0] == 0 and real[0, 1] == 20 and real[0, 2] == 40 and np.isnan(real[0, 3])
    assert region_name(0.5, 0.25) == "Europe"  # 45°N, 0°E
    assert region_name(0.375, 0.3) == "the North Atlantic"  # 36°N, 45°W


def test_layers_alerts_and_intensity() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    assert layers[0].intensity == 0 and not layers[0].alerts
    storm = layers[1]
    assert storm.alerts and storm.alerts[0].new and storm.alerts[0].x > 0.7
    assert not layers[2].alerts[0].new  # already over the line: no repeat chime
    east, west = storm.column_intensity[12], storm.column_intensity[2]  # storm spans columns 36-39
    assert east > 0.7 and west == 0
    assert storm.band_intensity["north"] > storm.band_intensity["south"]
    assert storm.regions and storm.regions[0].value == 40


def _render(layers: list[FrameLayers]) -> np.ndarray:
    from app.mapping.rules import build_score

    score = build_score(
        track_id="t", theme="weather", legend=LEGEND, labels=[], grids=grids(), preset="musical"
    )
    return render(track_id="t", score=score, layers=layers, spec=SPEC, mode="sweep", melody=False)


def test_render_is_bounded_deterministic_and_follows_the_storm() -> None:
    layers = analyse_frames(grids(), LEGEND, SPEC)
    a = _render(layers)
    b = _render(layers)
    assert a.shape[0] == 2 and np.abs(a).max() <= 0.9
    assert np.array_equal(a, b)
    fs = int(FRAME_S["sweep"] * SR)
    calm = np.sqrt((a[:, :fs] ** 2).mean())
    stormy = np.sqrt((a[:, fs : 2 * fs] ** 2).mean())
    assert stormy > 2 * calm
    # The storm sits in the east, so frame 1 is louder on the right than the left.
    assert a[1, fs : 2 * fs].std() > a[0, fs : 2 * fs].std()


def test_encode_formats() -> None:
    audio = np.zeros((2, SR // 2), dtype=np.float32)
    assert encode(audio, "wav")[:4] == b"RIFF"
    mp3 = encode(audio, "mp3")
    assert len(mp3) > 100 and (mp3[:3] == b"ID3" or mp3[0] == 0xFF)
