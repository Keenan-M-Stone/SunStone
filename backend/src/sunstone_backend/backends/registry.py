from __future__ import annotations

from .base import Backend
from .dummy import DummyBackend
from .meep import MeepBackend
from .opal import OpalBackend
from .ceviche import CevicheBackend
from .scuffem import ScuffemBackend
from .pygdm import PyGDMBackend


def get_backend(name: str) -> Backend:
    name = name.strip().lower()
    if name == DummyBackend.name:
        return DummyBackend()
    if name == MeepBackend.name:
        return MeepBackend()
    if name == OpalBackend.name:
        return OpalBackend()
    if name == CevicheBackend.name:
        return CevicheBackend()
    if name == ScuffemBackend.name:
        return ScuffemBackend()
    if name == PyGDMBackend.name:
        return PyGDMBackend()
    raise ValueError(f"Unknown backend: {name}")


def list_backends() -> list[str]:
    return [
        DummyBackend.name,
        MeepBackend.name,
        OpalBackend.name,
        CevicheBackend.name,
        ScuffemBackend.name,
        PyGDMBackend.name,
    ]
