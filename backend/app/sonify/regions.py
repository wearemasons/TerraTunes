"""Approximate named regions for spoken descriptions ("near the North Atlantic").

Coarse lat/lon boxes, land first then oceans. Good enough for orientation, not for geography.
"""

# (name, lat_min, lat_max, lon_min, lon_max)
_BOXES: list[tuple[str, float, float, float, float]] = [
    ("Antarctica", -90, -63, -180, 180),
    ("Greenland", 59, 84, -73, -12),
    ("Alaska", 52, 72, -170, -130),
    ("Canada", 49, 75, -140, -52),
    ("the United States", 25, 49, -125, -67),
    ("Mexico and Central America", 7, 32, -117, -77),
    ("the Caribbean", 10, 25, -85, -60),
    ("the Amazon", -15, 5, -75, -45),
    ("South America", -56, 13, -82, -34),
    ("Europe", 36, 71, -10, 40),
    ("the Sahara and North Africa", 15, 37, -17, 33),
    ("the Middle East", 12, 42, 33, 63),
    ("Central Africa", -10, 15, 8, 40),
    ("Southern Africa", -35, -10, 10, 41),
    ("Madagascar", -26, -12, 43, 51),
    ("Russia and Central Asia", 42, 78, 40, 180),
    ("South Asia", 5, 35, 63, 92),
    ("China and East Asia", 20, 54, 92, 146),
    ("Southeast Asia", -11, 22, 92, 141),
    ("Australia", -44, -10, 112, 154),
    ("the Arctic Ocean", 72, 90, -180, 180),
    ("the Southern Ocean", -75, -50, -180, 180),
    ("the North Atlantic", 0, 72, -80, 0),
    ("the South Atlantic", -50, 0, -70, 20),
    ("the Indian Ocean", -50, 25, 20, 120),
    ("the North Pacific", 0, 66, 120, 180),
    ("the North Pacific", 0, 66, -180, -80),
    ("the South Pacific", -50, 0, 130, 180),
    ("the South Pacific", -50, 0, -180, -70),
]


def region_name(x: float, y: float) -> str:
    """x: 0..1 west→east, y: 0..1 north→south (equirectangular)."""
    lon = -180 + x * 360
    lat = 90 - y * 180
    for name, la0, la1, lo0, lo1 in _BOXES:
        if la0 <= lat <= la1 and lo0 <= lon <= lo1:
            return name
    return "the open ocean"
