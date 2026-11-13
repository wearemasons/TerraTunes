"""API contract (docs/API_CONTRACT.md). The frontend mirrors these in src/lib/api/types.ts."""

from typing import Literal

from pydantic import BaseModel, Field

ThemeId = Literal[
    "sea_level",
    "air_quality",
    "wildfires",
    "greenhouse_gases",
    "water",
    "agriculture",
    "biodiversity",
    "energy",
    "disasters",
    "weather",
    "ocean",
]
PresetId = Literal["musical", "clear"]


class LegendAnchor(BaseModel):
    position: float = Field(ge=0, le=1, description="Normalized position along the colorbar.")
    rgb: tuple[int, int, int]


class LegendTick(BaseModel):
    position: float = Field(ge=0, le=1)
    value: float
    label: str | None = None


class Legend(BaseModel):
    label: str
    unit: str
    min: float
    max: float
    anchors: list[LegendAnchor]
    ticks: list[LegendTick] = Field(
        default_factory=list,
        description="Colorbar stops (position → value). When present, values between stops follow them, "
        "linearly or logarithmically (see `log`); otherwise min..max is linear.",
    )
    log: bool = False


class TrackSummary(BaseModel):
    id: str
    title: str
    theme: ThemeId
    summary: str
    date_range: str
    frame_count: int
    duration_s: float
    thumbnail_url: str | None
    credit: str
    source_url: str | None
    calibrated: bool
    synthetic: bool = False


class TranscriptEntry(BaseModel):
    frame: int
    text: str


class TrackDetail(TrackSummary):
    description: str
    audio_key: str
    legend: Legend
    presets: list[PresetId]
    frame_labels: list[str]
    transcript: list[TranscriptEntry]
    sound: "SoundInfo | None" = None


class Hotspot(BaseModel):
    x: float
    y: float
    note: int
    strength: float


class FrameStats(BaseModel):
    mean: float
    min: float
    max: float
    extreme_share: float


class Alert(BaseModel):
    label: str
    value: float
    x: float
    y: float
    region: str
    share: float = Field(description="Share of the data area past the threshold.")
    new: bool = Field(description="First frame (or first again) to cross it.")


class Region(BaseModel):
    region: str
    where: str
    value: float
    x: float
    y: float


class FrameLayers(BaseModel):
    """Soundscape data for one frame (see app/sonify)."""

    intensity: float = Field(description="Whole-map phenomenon intensity 0..1.")
    column_intensity: list[float] = Field(description="Per scan step west→east, 0..1.")
    band_intensity: dict[str, float] = Field(description="north / tropics / south, 0..1.")
    band_peak_value: dict[str, float | None]
    coverage: float
    alerts: list[Alert]
    regions: list[Region] = Field(description="Up to three strongest, well-separated places.")


class ThresholdInfo(BaseModel):
    value: float
    label: str
    above: bool


class SoundInfo(BaseModel):
    phenomenon: str
    description: str
    thresholds: list[ThresholdInfo]
    render_url: str | None = None


class FrameScore(BaseModel):
    index: int
    label: str
    tension: float
    loudness: float
    brightness: float
    rhythm_density: int
    column_notes: list[int]
    hotspot: Hotspot | None
    stats: FrameStats
    description: str
    layers: FrameLayers | None = None


class ScoreKey(BaseModel):
    root: str
    root_midi: int
    scale: str
    bpm: int


class GridSize(BaseModel):
    cols: int
    rows: int


class Score(BaseModel):
    mapping_version: str
    track_id: str
    preset: PresetId
    key: ScoreKey
    grid: GridSize
    steps_per_frame: int
    frames: list[FrameScore]
    sound: SoundInfo | None = None


class GridResponse(BaseModel):
    cols: int
    rows: int
    cells_b64: str = Field(description="uint8 row-major north→south; 0..250 value, 255 = no data.")
    real_min: float
    real_max: float
    unit: str


class Health(BaseModel):
    status: Literal["ok"]
    version: str
    tracks: int


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorBody


TrackDetail.model_rebuild()
