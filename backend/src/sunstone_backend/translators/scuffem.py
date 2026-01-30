from __future__ import annotations

import json
from typing import Any


def translate_spec_to_scuffem(spec: dict[str, Any]) -> str:
    domain = spec.get('domain', {})
    geom = spec.get('geometry', []) or []
    return json.dumps({
        'backend': 'scuffem',
        'domain': domain,
        'geometry_count': len(geom),
        'note': 'scuffem translator stub'
    }, indent=2)


__all__ = ["translate_spec_to_scuffem"]
