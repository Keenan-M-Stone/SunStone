from __future__ import annotations

from .base import Backend
from .dummy import DummyBackend
from .meep import MeepBackend


def get_backend(name: str) -> Backend:
    name = name.strip().lower()
    if name == DummyBackend.name:
        return DummyBackend()
    if name == MeepBackend.name:
        return MeepBackend()
    raise ValueError(f"Unknown backend: {name}")


def list_backends() -> list[str]:
    return [DummyBackend.name, MeepBackend.name]
