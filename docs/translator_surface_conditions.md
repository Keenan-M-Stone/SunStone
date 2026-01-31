# Translator Surface Conditions (Design)

This document describes the conservative `surface_conditions` representation produced by server-side translators and how backends should interpret them.

## Purpose
- Provide a canonical, backend-agnostic representation of per-face boundary conditions (PEC/PMC/periodic/etc.).
- Allow translators to produce native fragments (e.g., `opal_input`, `scuffem_input`) that downstream backends or worker adapters can consume.

## Canonical schema (translator -> `surface_conditions`)
Each `surface_condition` entry has the form:

- direction: "X" | "Y" | "Z"
- side: "High" | "Low"
- condition: "conducting" | "magnetic" | "periodic" | "unknown"
- params: dict

Example:

```
"surface_conditions": [
  {"direction": "X", "side": "High", "condition": "conducting", "params": {}},
]
```

## Native translator fragments
Translators are encouraged to include a backend-specific fragment to make it easier for backends to attach the conditions to native inputs.

- Opal translator: `opal_input` with `surface_tags` and `surface_conditions`
- Scuff-EM translator: `scuffem_input` with `surface_tags` and `surface_conditions`
- Ceviche/pyGDM: conservative `ceviche_input` / `pygdm_input` with `surface_conditions`

Backends may simulate, validate, or convert these fragments into their native input formats.

## Backend behaviour
- Backends that advertise `translator_surface_conditions: True` in capabilities should either:
  - Accept `*_input` fragments and apply them (preferred), or
  - At minimum, preserve them in `outputs/summary.json` under `applied` so UI and tests can verify translation round-trips.

## Notes
- Translators and backends should remain conservative: prefer preserving the raw details to guessing geometry/mesh tags that may be inaccurate.
- Future work: automated mapping from `surface_conditions` to mesh-surface tags based on translator-provided mesh/geometry data.