"""What each track should *sound like*: the natural phenomenon and the thresholds that matter.

Auditory icons (rain, wind, fire, surf, birds…) say WHAT is happening; data drives HOW MUCH and
WHERE. For quantities with no natural sound (pollutants), a labelled metaphor is used instead.
"""

import math
from typing import Literal

from pydantic import BaseModel, Field

Phenomenon = Literal["rain", "wind", "fire", "surf", "biophony", "temperature", "haze", "traffic"]

PHENOMENON_INFO: dict[str, str] = {
    "rain": "Rain: droplets get denser and louder with heavier rain; extreme cells add rumble and thunder.",
    "wind": "Wind: the whoosh rises in pitch and gusts harder with speed; storm-force wind howls.",
    "fire": "Fire: crackles and roar grow with the amount of smoke gas from burning.",
    "surf": "Ocean surf: waves wash continuously; colder water sounds brighter and icier, warmer water darker.",
    "biophony": "Birds and insects: the greener the land, the busier the chorus.",
    "temperature": "Heat brings a cicada chorus; below freezing you hear thin icy wind and creaks.",
    "haze": "Haze (a metaphor, no natural sound): a dull drone that gets rougher and more muffled as pollution rises.",
    "traffic": "Traffic hum (the main source of this pollutant): a low rumble that thickens with concentration.",
}


class Threshold(BaseModel):
    value: float
    label: str
    """Spoken label, e.g. "hurricane-force wind"."""
    above: bool = True


class IntensityMap(BaseModel):
    """Real value → 0..1 loudness/density of the phenomenon sound."""

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
