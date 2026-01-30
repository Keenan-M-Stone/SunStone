// Minimal translator stubs for solver backends (opal, ceviche, scuffem, pygdm).
// These functions return a string or object that can be fleshed out later
// with full translator logic. They are intentionally conservative and
// safe to call for UI preview and for unit testing.

export function translateToOpal(spec: any): string {
  // TODO: implement full translation to Opal input format
  return `# Opal translator stub\n# Input keys: ${Object.keys(spec).join(', ')}`
}

export function translateToCeviche(spec: any): string {
  // Conservative client-side translation to a Ceviche-like JSON payload.
  const domain = spec?.domain || { dimension: '2d', cell_size: [1, 1, 0], resolution: 20 }
  const geometry = (spec?.geometry || []).map((g: any) => {
    if (g.type === 'cylinder') {
      return { shape: 'cylinder', radius: Number(g.radius || 0), height: Number(g.height || 0), center: g.center || [0, 0, 0], material: g.material }
    }
    if (g.type === 'block') {
      return { shape: 'block', size: g.size || [0, 0, 0], center: g.center || [0, 0, 0], material: g.material }
    }
    return { shape: g.type || 'unknown', ...g }
  })
  const payload = {
    backend: 'ceviche',
    domain: { dimension: domain.dimension, cell_size: domain.cell_size, resolution: Number(domain.resolution || 20) },
    geometry,
    materials: spec?.materials || {},
    meta: { translated_by: 'frontend-ceviche-translator', version: '0.1' },
  }
  return JSON.stringify(payload, null, 2)
}

export function translateToScuffem(spec: any): string {
  return `# Scuff-EM translator stub\n# geometry: ${Array.isArray(spec.geometry) ? spec.geometry.length : 0}`
}

export function translateToPyGDM(spec: any): string {
  return JSON.stringify({ _translated_for: 'pygdm', spec_keys: Object.keys(spec) }, null, 2)
}
