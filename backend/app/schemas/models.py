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
]
PresetId = Literal["musical", "clear"]


class LegendAnchor(BaseModel):
    position: float = Field(ge=0, le=1, description="Normalized position along the colorbar.")
    rgb: tuple[int, int, int]


class Legend(BaseModel):
    label: str
    unit: str
    min: float
    max: float
    anchors: list[LegendAnchor]


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
