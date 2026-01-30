from __future__ import annotations

import json
from typing import Any


def translate_spec_to_pygdm(spec: dict[str, Any]) -> str:
    domain = spec.get('domain', {})
    geom = spec.get('geometry', []) or []
    return json.dumps({
        'backend': 'pygdm',
        'domain': domain,
        'geometry_count': len(geom),
        'note': 'pyGDM translator stub'
    }, indent=2)


__all__ = ["translate_spec_to_pygdm"]
