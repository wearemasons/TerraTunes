"""Phenomenon intensity definitions and contextual thresholds, not musical decisions.

Mapping v15 uses these intensity figures for track-relative level and note density. Pitches,
durations and composed harmony belong to mapping/rules.py. Thresholds are textual context;
they do not trigger a separate instrument or an octave jump.
"""

import math
from typing import Literal

from pydantic import BaseModel, Field

Phenomenon = Literal["rain", "wind", "fire", "surf", "biophony", "temperature", "haze", "traffic"]

_ENSEMBLE = (
    "Three instruments carry the measured map: bass follows the slice average, harp its highest "
    "value, and flute its signed change since the previous frame. A disclosed, composed chord "
    "phrase supplies harmony; it is not a measured environmental trend. Pitch conveys relative "
    "values within a frame, not exact units or a comparison across chord changes. The defined "
    "phenomenon intensity, rescaled relative to this track, controls level and fullness. Equal "
    "tones are held; quiet areas have fewer attacks. A rest can mean low activity, while no-data "
    "slices trigger no new notes. Sparse beats and restrained contextual accents may mark dense "
    "or extreme regions; these are not extra measurements or environmental recordings."
)

PHENOMENON_INFO: dict[str, str] = {
    "rain": f"Precipitation: {_ENSEMBLE}",
    "wind": f"Wind speed: {_ENSEMBLE}",
    "fire": f"Carbon monoxide used as a smoke-gas indicator: {_ENSEMBLE} It is not a direct measurement of flames.",
    "surf": f"Sea surface temperature: {_ENSEMBLE} It is not a recording of waves.",
    "biophony": f"Vegetation index: {_ENSEMBLE} Fuller does not mean more dangerous; the intensity definition follows this track's vegetation scale.",
    "temperature": f"Near-surface air temperature: {_ENSEMBLE}",
    "haze": f"Fine particles or ozone, as named on the selected record: {_ENSEMBLE}",
    "traffic": f"Nitrogen oxides: {_ENSEMBLE} This is a concentration mapping, not a count of vehicles or identification of emission sources.",
}


class Threshold(BaseModel):
    value: float
    label: str
    """Spoken label, e.g. hurricane-force wind; contextual text, not an audible alarm."""
    above: bool = True


class IntensityMap(BaseModel):
    """Real value to phenomenon intensity (0..1), later rescaled by the mapping layer.

    This is a declared perceptual intensity convention, not a universal measure of risk.
    """

    lo: float
    hi: float
    log: bool = False

    def __call__(self, value: float) -> float:
        if self.log:
            v, lo, hi = math.log10(max(value, 1e-9)), math.log10(self.lo), math.log10(self.hi)
        else:
            v, lo, hi = value, self.lo, self.hi
        return min(1.0, max(0.0, (v - lo) / (hi - lo)))


class SoundSpec(BaseModel):
    phenomenon: Phenomenon
    intensity: IntensityMap
    thresholds: list[Threshold] = Field(default_factory=list)

    @property
    def description(self) -> str:
        return PHENOMENON_INFO[self.phenomenon]
