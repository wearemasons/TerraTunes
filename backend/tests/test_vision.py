import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.mapping.rules import to_real
from app.schemas.models import Legend, LegendTick
from app.vision.calibrate import NO_DATA, calibrate_frame
from app.vision.colorbar import ValueScale, extract_strip


def gradient(n: int = 256) -> np.ndarray:
    t = np.linspace(0, 1, n)
    return np.stack([t * 255, (1 - abs(2 * t - 1)) * 200, (1 - t) * 255], axis=1).astype(np.uint8)


def colorbar_image(colors: np.ndarray, background: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (400, 100), background)
    strip = Image.fromarray(np.repeat(colors[None], 20, axis=0)).resize((300, 20))
    img.paste(strip, (50, 40))
    draw = ImageDraw.Draw(img)
    for x in range(50, 351, 75):  # tick marks crossing the bottom edge
        draw.line([(x, 55), (x, 65)], fill=(255, 255, 255))
    return img


@pytest.mark.parametrize("bg", [(255, 255, 255), (0, 0, 0), (110, 110, 110)])
def test_extract_strip_finds_bar_on_any_background(bg: tuple[int, int, int]) -> None:
    strip = extract_strip(colorbar_image(gradient(), bg))
    x0, _, x1, _ = strip.box
    assert abs(x0 - 51) <= 2 and abs(x1 - 349) <= 2
    ref = gradient()
    assert np.abs(strip.colors[0].astype(int) - ref[0]).max() < 20
    assert np.abs(strip.colors[-1].astype(int) - ref[-1]).max() < 20


def test_calibration_recovers_values_and_rejects_off_palette_pixels() -> None:
    colors = gradient()
    # Left→right gradient image, with a grey "land" block and a masked logo corner.
    field = np.repeat(np.repeat(colors[None], 200, axis=0), 2, axis=1)  # 200 x 512
    img = field.copy()
    img[80:120, 200:300] = (128, 128, 128)
    grid = calibrate_frame(Image.fromarray(img), colors, cols=32, rows=16, masks=[(0, 0, 0.1, 0.1)])
    assert grid[0, 0] == NO_DATA  # masked
    assert grid[8, 15] == NO_DATA  # grey block isn't on the colorbar
    row = grid[14]
    valid = row[row != NO_DATA].astype(int)
    assert np.all(np.diff(valid) >= 0), "values should rise west to east"
    assert valid[0] < 25 and valid[-1] > 225


def test_value_scale_linear_log_and_piecewise() -> None:
    linear = ValueScale((0, 1), (-40, 40))
    assert linear.to_real(0.5) == 0
    log = ValueScale((0, 1), (0.4, 409.6), log=True)
    assert log.to_real(0.2) == pytest.approx(1.6)
    piece = ValueScale((0, 0.31, 0.55, 0.77, 1), (40, 100, 130, 200, 500), log=True)
    assert piece.to_real(0.31) == pytest.approx(100)
    with pytest.raises(ValueError):
        ValueScale((0, 1), (0, 10), log=True)


def test_mapping_uses_legend_ticks() -> None:
    legend = Legend(
        label="PM",
        unit="u",
        min=0.4,
        max=409.6,
        anchors=[],
        ticks=[LegendTick(position=0, value=0.4), LegendTick(position=1, value=409.6)],
        log=True,
    )
    assert to_real(0.6, legend) == pytest.approx(25.6)


def test_despeckle_removes_isolated_spike_but_keeps_plumes() -> None:
    from app.vision.calibrate import despeckle

    g = np.full((10, 10), 40, dtype=np.uint8)
    g[2, 2] = 220  # lone spike, e.g. dense coastline
    g[6:9, 6:9] = 200  # a real plume
    g[7, 7] = 240
    out = despeckle(g)
    assert out[2, 2] == 40
    assert out[7, 7] == 240 and out[6, 6] == 200
