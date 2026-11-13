from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime settings. Override with TERATONES_* env vars or backend/.env."""

    model_config = SettingsConfigDict(env_prefix="TERATONES_", env_file=BACKEND_ROOT / ".env", extra="ignore")

    data_dir: Path = BACKEND_ROOT / "data"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:4173"]

    svs_base_url: str = "https://svs.gsfc.nasa.gov"
    svs_user_agent: str = "TeraTones/0.1 (NASA Space Apps 2026 project)"
    svs_min_interval_s: float = 1.0
    svs_timeout_s: float = 120.0

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def tracks_dir(self) -> Path:
        return self.data_dir / "tracks"

    @property
    def catalog_path(self) -> Path:
        return self.data_dir / "catalog.yaml"


@lru_cache
def get_settings() -> Settings:
    return Settings()
