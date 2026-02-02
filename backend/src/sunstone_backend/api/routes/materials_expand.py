from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from typing import Any

from ...settings import get_settings, Settings
from ...util.gradients import discretize_gradient_over_block

router = APIRouter(prefix="/materials", tags=["materials"])


@router.post("/expand_gradient")
def expand_gradient(body: dict[str, Any], settings: Settings = Depends(get_settings)) -> dict:
    """Expand a gradient-defined material over a geometry into discretized slices.

    Expected body: { material: {...}, geometry: {...}, slices: int, axis: 'x'|'y'|'z'|'radial' }
    Returns: { slices: [ { geometry, material } ] }
    """
    material = body.get('material')
    geometry = body.get('geometry')
    if material is None or geometry is None:
        raise HTTPException(status_code=400, detail='material and geometry required')
    slices = int(body.get('slices', 8))
    axis = body.get('axis', 'x')

    if geometry.get('type') != 'block' and axis != 'radial':
        # for now only support block geometries for linear slicing
        raise HTTPException(status_code=400, detail='unsupported geometry for axis slicing')

    sl = discretize_gradient_over_block(material, geometry, axis=axis, n_slices=slices)
    return {'slices': sl}


@router.post("/expand_gradient_batch")
def expand_gradient_batch(body: dict[str, Any], settings: Settings = Depends(get_settings)) -> dict:
    """Batch expand gradients.

    Expected body: { items: [ { key?: str, material: {...}, geometry: {...}, slices?: int, axis?: 'x'|'y'|'z'|'radial' } ] }
    Returns: { results: { <key>: [ slices ] } }
    """
    items = body.get('items')
    if not items or not isinstance(items, list):
        raise HTTPException(status_code=400, detail='items list required')
    results: dict[str, Any] = {}
    for idx, it in enumerate(items):
        material = it.get('material')
        geometry = it.get('geometry')
        if material is None or geometry is None:
            # skip invalid entries
            continue
        slices = int(it.get('slices', 8))
        axis = it.get('axis', 'x')
        try:
            sl = discretize_gradient_over_block(material, geometry, axis=axis, n_slices=slices)
        except Exception as e:
            sl = {'error': str(e)}
        key = it.get('key') or f"item-{idx}"
        results[key] = sl
    return {'results': results}
