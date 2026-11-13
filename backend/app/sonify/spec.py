"""What each track measures, the real-world lines that matter, and how the ensemble sings them.

Since mapping_version 14 the sound is an ensemble of three pitched instruments (plucked bass, harp,
flute) — see `render.py` and `docs/SONIFICATION_DESIGN.md`. Nothing here selects a noise generator
any more: `phenomenon` is the *label of the physical process the track measures* (it also drives the
browser's visual model), and `description` is the plain-language text the API returns as
`sound.description`, so a screen reader announces which channel each instrument carries.

Values still come from the calibrated colourbar measurement; `intensity` maps a real value to the
0..1 slice figure that nudges note level inside a 2.7 dB window, and `thresholds` are the lines with
real-world meaning, marked by the harp lifting an octave.
"""

import math
from typing import Literal

from pydantic import BaseModel, Field

Phenomenon = Literal["rain", "wind", "fire", "surf", "biophony", "temperature", "haze", "traffic"]

_ENSEMBLE = (
    "An orchestra of three soloists, no drums and no weather noise: the plucked bass plays the "
    "average value of each slice as the map is scanned west to east, the harp plays the highest "
    "value in that slice, and the flute holds long notes tracing how the slice changed since the "
    "previous frame, all over a string section holding the chord those lines imply. Higher values "
    "mean higher notes, never louder ones — loudness stays level, and silence means no data."
)

PHENOMENON_INFO: dict[str, str] = {
    "rain": f"Precipitation: {_ENSEMBLE} A rising bass line means wetter air over that part of the map.",
    "wind": f"Wind speed: {_ENSEMBLE} A rising bass line means stronger wind over that part of the map.",
    "fire": (
        f"Smoke gas from burning: {_ENSEMBLE} A rising bass line means more carbon monoxide over that "
        "part of the map."
    ),
    "surf": (
        f"Sea surface temperature: {_ENSEMBLE} A rising bass line means warmer water, and the harp "
        "reaches its top notes where the sea is warm enough to fuel storms."
    ),
    "biophony": (
        f"Living green cover: {_ENSEMBLE} A rising bass line means greener, denser vegetation."
    ),
    "temperature": (
        f"Air temperature just above the ground: {_ENSEMBLE} Cold places sit at the bottom of the "
        "scale and hot places at the top; freezing is roughly the middle of the range on these maps."
    ),
    "haze": (
        f"Fine particles and ozone (there is no natural sound for these, so the mapping is agreed "
        f"rather than imitative): {_ENSEMBLE} A rising bass line means dirtier air."
    ),
    "traffic": (
        f"Nitrogen oxides, mostly from engines: {_ENSEMBLE} A rising bass line means more pollution "
        "over that part of the map."
    ),
}


class Threshold(BaseModel):
    value: float
    label: str
    """Spoken label, e.g. "hurricane-force wind"."""
    above: bool = True


class IntensityMap(BaseModel):
    """Real value → 0..1 slice figure. In v14 this only nudges note level (±2.7 dB) and the
    visualisation; pitch comes from the calibrated value itself, via app/mapping/rules.py."""

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
