from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_data_dir() -> Path:
    xdg = Path.home() / ".local" / "share" / "sunstone"
    return xdg


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SUNSTONE_", env_file=".env", extra="ignore")

    data_dir: Path = Field(default_factory=_default_data_dir)

    host: str = "127.0.0.1"
    port: int = 8000

    cors_allow_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    allow_local_execution: bool = True
    default_backend: str = "dummy"


def get_settings() -> Settings:
    return Settings()
