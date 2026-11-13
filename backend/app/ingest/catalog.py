"""Curated track catalog (data/catalog.yaml). Humans decide what is shown and how it is labelled;
everything else (frames, colours, values) is derived from the SVS assets."""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

from app.schemas.models import ThemeId


class Tick(BaseModel):
    position: float = Field(ge=0, le=1)
    value: float
    label: str | None = None


class LegendSpec(BaseModel):
    label: str
    unit: str
    ticks: list[Tick] = Field(min_length=2)
    log: bool = False


class TimeSpec(BaseModel):
    mode: Literal["steps", "span"] = "steps"
    step_label: str = "Snapshot"
    span_days: int | None = None
    """For mode=span: the frames cover this many days, ending at the SVS page's update date."""


class CatalogEntry(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9-]+$")
    svs_id: int
    theme: ThemeId
    title: str
    summary: str
    description: str | None = None
    movie: str
    colorbar: str
    colorbar_box: tuple[int, int, int, int] | None = None
    legend: LegendSpec
    masks: list[tuple[float, float, float, float]] = []
    frames: int = Field(default=20, ge=2, le=60)
    skip_edges: float = Field(default=0.02, ge=0, lt=0.5, description="Skip intro/outro fades.")
    time: TimeSpec = TimeSpec()
    max_delta_e: float = 14.0
    enabled: bool = True


class Catalog(BaseModel):
    tracks: list[CatalogEntry]


def load_catalog(path: Path) -> Catalog:
    return Catalog.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
