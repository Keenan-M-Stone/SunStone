from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class BundleManifest(BaseModel):
    format: str = "sunstone.bundle"
    version: str = "0.1"
    name: str
    mode: str
    dimension: str
    created_at: str
    cad_path: str = "cad.json"
    spec_path: str = "spec.json"
    extra: dict[str, Any] = Field(default_factory=dict)


class BundleCad(BaseModel):
    materials: list[dict[str, Any]]
    geometry: list[dict[str, Any]]
    sources: list[dict[str, Any]]
    monitors: list[dict[str, Any]]
    domain: dict[str, Any]
    view: dict[str, Any] | None = None


class BundleSpec(BaseModel):
    spec: dict[str, Any]


def save_bundle(bundle_dir: Path, manifest: BundleManifest, cad: BundleCad, spec: dict[str, Any]) -> None:
    bundle_dir.mkdir(parents=True, exist_ok=True)
    (bundle_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2))
    (bundle_dir / manifest.cad_path).write_text(cad.model_dump_json(indent=2))
    (bundle_dir / manifest.spec_path).write_text(json.dumps(spec, indent=2))


def load_bundle(bundle_dir: Path) -> tuple[BundleManifest, BundleCad, dict[str, Any]]:
    manifest = BundleManifest.model_validate_json((bundle_dir / "manifest.json").read_text())
    cad = BundleCad.model_validate_json((bundle_dir / manifest.cad_path).read_text())
    spec = json.loads((bundle_dir / manifest.spec_path).read_text())
    return manifest, cad, spec
