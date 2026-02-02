from __future__ import annotations

import json
from pathlib import Path
from .base import Backend
from datetime import datetime

# We will produce simple layered/inclusion bundles using basic heuristics and the
# existing python bundle format.

def _write_bundle_json(out_path: Path, name: str, materials: list, geometry: list, domain: dict, spec: dict):
    payload = {
        "manifest": {
            "format": "sunstone-bundle",
            "version": "0.1",
            "name": name,
            "mode": "cad",
            "dimension": spec.get("domain", {}).get("dimension", "2d"),
            "created_at": datetime.utcnow().isoformat() + 'Z',
            "cad_path": "cad.json",
            "spec_path": "spec.json",
            "extra": {},
        },
        "cad": {
            "materials": materials,
            "geometry": geometry,
            "sources": [],
            "monitors": [],
            "domain": domain,
        },
        "spec": spec,
    }
    out_path.write_text(json.dumps(payload, indent=2))


class SynthesisBackend(Backend):
    name = 'synthesis'

    def run(self, run_dir: Path) -> None:
        spec_path = run_dir / 'spec.json'
        if not spec_path.exists():
            raise FileNotFoundError(spec_path)
        spec = json.loads(spec_path.read_text())

        # Expect either spec['synthesis'] or run_options.analysis_mode == 'synthesis'
        synth = spec.get('synthesis') or (spec.get('run_options') or {}).get('synthesis')
        if not synth:
            # default: try to synthesize for first material
            materials = spec.get('materials') or {}
            # pick first material id if present
            material_id = None
            if isinstance(materials, dict):
                keys = list(materials.keys())
                if keys:
                    material_id = keys[0]
            synth = {'preset': 'layered', 'target_material': material_id}

        outputs_dir = run_dir / 'outputs'
        bundles_dir = outputs_dir / 'bundles'
        bundles_dir.mkdir(parents=True, exist_ok=True)

        # For now implement simple layered and inclusion presets
        preset = synth.get('preset', 'layered')
        domain = spec.get('domain', {})
        if preset == 'layered':
            # create few candidate layered stacks with varying thicknesses
            # Create materials: inclusion (high eps) and host (vac)
            incl_eps = synth.get('incl_eps', 10.0)
            host_eps = synth.get('host_eps', 1.0)
            for i, f in enumerate([0.1, 0.2, 0.3, 0.5]):
                mat_inc = {'id': f'incl-{i}', 'label': f'Incl-{i}', 'eps': incl_eps, 'color': '#f97316'}
                mat_host = {'id': 'host', 'label': 'Host', 'eps': host_eps, 'color': '#94a3b8'}
                # layered geometry as alternating thin blocks across x
                geometry = []
                total_width = domain.get('cell_size', [1.0, 1.0, 0])[0]
                n_layers = 4
                w = total_width / n_layers
                for j in range(n_layers):
                    gid = f'layer-{i}-{j}'
                    mat = 'incl-' + str(i) if (j % 2 == 0) else 'host'
                    geometry.append({
                        'id': gid,
                        'shape': 'block',
                        'size': [w, domain.get('cell_size', [1.0, 1.0, 0])[1]],
                        'center': [(-total_width / 2) + (j + 0.5) * w, 0],
                        'material': mat,
                    })
                name = f'synthesis-layered-{i}'
                out_path = bundles_dir / f'{name}.sunstone.json'
                _write_bundle_json(out_path, name, [mat_host, mat_inc], geometry, domain, spec)
        else:
            # inclusion-based simple circular inclusions grid
            incl_eps = synth.get('incl_eps', 10.0)
            host_eps = synth.get('host_eps', 1.0)
            for i, r in enumerate([0.05, 0.1, 0.2]):
                mat_inc = {'id': f'incl-{i}', 'label': f'Incl-{i}', 'eps': incl_eps, 'color': '#f97316'}
                mat_host = {'id': 'host', 'label': 'Host', 'eps': host_eps, 'color': '#94a3b8'}
                geometry = []
                total_width = domain.get('cell_size', [1.0, 1.0, 0])[0]
                positions = [(-0.25 * total_width, 0), (0.25 * total_width, 0)]
                for j, pos in enumerate(positions):
                    geometry.append({
                        'id': f'c{i}-{j}',
                        'shape': 'cylinder',
                        'size': [r * total_width, 0],
                        'center': [pos[0], pos[1]],
                        'material': 'incl-' + str(i),
                    })
                name = f'synthesis-incl-{i}'
                out_path = bundles_dir / f'{name}.sunstone.json'
                _write_bundle_json(out_path, name, [mat_host, mat_inc], geometry, domain, spec)

        # write an index
        index = {'bundles': [p.name for p in bundles_dir.glob('*.sunstone.json')]}
        (outputs_dir / 'synthesis_index.json').write_text(json.dumps(index, indent=2))

        # write a simple summary
        (outputs_dir / 'summary.json').write_text(json.dumps({'status': 'done', 'type': 'synthesis', 'count': len(index['bundles'])}))
