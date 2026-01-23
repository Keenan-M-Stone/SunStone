# SunStone Project Bundle (v0.1)

A portable, versioned container for sharing SunStone models and simulation specs.

## Structure

A bundle is a directory (or zip) with these files:

```
manifest.json
cad.json
spec.json
```

### manifest.json

```json
{
  "format": "sunstone.bundle",
  "version": "0.1",
  "name": "double-slit-2d",
  "mode": "fdtd",
  "dimension": "2d",
  "created_at": "2026-01-23T00:00:00Z",
  "cad_path": "cad.json",
  "spec_path": "spec.json",
  "extra": {}
}
```

### cad.json

```json
{
  "materials": [{"id": "pec", "model": "pec", "eps": 1.0, "color": "#e2e8f0", "label": "PEC"}],
  "geometry": [{"id": "geom-1", "shape": "block", "center": [0, 0], "centerZ": 0, "size": [1e-6, 1e-6], "sizeZ": 0, "materialId": "pec"}],
  "sources": [{"id": "src-1", "position": [-5e-6, 0], "z": 0, "component": "Ez", "centerFreq": 3e14, "fwidth": 1e13}],
  "monitors": [{"id": "mon-1", "position": [5e-6, 0], "z": 0, "components": ["Ez"], "dt": 1e-16}],
  "domain": {"cell_size": [2e-5, 1.2e-5, 0], "resolution": 40, "pml": [2e-6, 2e-6, 0]},
  "view": {"center": [0, 0], "zoom": 1}
}
```

### spec.json

The solver-ready spec used by the backend. This should be a superset of the CAD data and include:
- `domain` settings
- `boundary_conditions`
- `materials`
- `geometry`
- `sources`
- `monitors`
- `outputs` (optional)

## Versioning

Use `manifest.version` to branch parsers. For example:
- `0.1`: base CAD + FDTD spec format
- `0.2+`: extensions for 3D CAD meshes, anisotropic materials, or custom detector definitions

## Reference Implementation

Backend helper utilities are available in:
- [backend/src/sunstone_backend/util/bundle.py](backend/src/sunstone_backend/util/bundle.py)
