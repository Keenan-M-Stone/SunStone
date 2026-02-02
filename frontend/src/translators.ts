// Minimal translator stubs for solver backends (opal, ceviche, scuffem, pygdm).
// These functions return a string or object that can be fleshed out later
// with full translator logic. They are intentionally conservative and
// safe to call for UI preview and for unit testing.

// Prepare spec: expand plane monitors into point-grids when backend does not support plane sampling
export function prepareSpecForBackend(spec: any, backendSupportsPlane = true) {
  if (!spec || !Array.isArray(spec.monitors)) return spec
  const needsExpansion = spec.monitors.some((m: any) => m.type === 'plane' && ((m.sampling?.mode ?? '') === 'points' || !backendSupportsPlane))
  if (!needsExpansion) return spec
  const tmp = JSON.parse(JSON.stringify(spec))
  tmp.monitors = (tmp.monitors || []).map((m: any) => {
    if (m.type === 'plane') {
      const mode = m.sampling?.mode ?? 'points'
      if (mode === 'plane' && !backendSupportsPlane) {
        m.sampling = { ...m.sampling, mode: 'points', nx: m.sampling?.nx ?? 5, ny: m.sampling?.ny ?? 5 }
      }
      if (mode === 'points') {
        m.sampling = { ...m.sampling, nx: m.sampling?.nx ?? 5, ny: m.sampling?.ny ?? 5 }
      }
    }
    return m
  })
  return expandPlaneMonitors(tmp)
}

export function translateToOpal(spec: any, options?: { backendSupportsPlane?: boolean }): string {
  // TODO: implement full translation to Opal input format
  const backendSupportsPlane = options?.backendSupportsPlane ?? true
  const workingSpec = prepareSpecForBackend(spec, backendSupportsPlane)
  const monitors = (workingSpec.monitors || []).map((m: any) => (m.type === 'plane' ? `plane:${m.id}` : (m.type === 'point' ? `point:${m.id}` : `unknown:${m.id}`)))
  return `# Opal translator stub\n# backendSupportsPlane=${backendSupportsPlane}\n# Input keys: ${Object.keys(spec).join(', ')}\n# Monitors: ${monitors.join(', ')}`
}

export function translateToCeviche(spec: any, options?: { backendSupportsPlane?: boolean }): string {
  // Conservative client-side translation to a Ceviche-like JSON payload.
  const backendSupportsPlane = options?.backendSupportsPlane ?? true
  const workingSpec = prepareSpecForBackend(spec, backendSupportsPlane)
  const domain = workingSpec?.domain || { dimension: '2d', cell_size: [1, 1, 0], resolution: 20 }
  const geometry = (workingSpec?.geometry || []).map((g: any) => {
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
    materials: workingSpec?.materials || {},
    monitors: workingSpec?.monitors || [],
    meta: { translated_by: 'frontend-ceviche-translator', version: '0.1', backendSupportsPlane },
  }
  return JSON.stringify(payload, null, 2)
}

export function translateToScuffem(spec: any, options?: { backendSupportsPlane?: boolean }): string {
  const backendSupportsPlane = options?.backendSupportsPlane ?? true
  const workingSpec = prepareSpecForBackend(spec, backendSupportsPlane)
  const monitors = (workingSpec.monitors || []).map((m: any) => m.type).join(',')
  return `# Scuff-EM translator stub\n# backendSupportsPlane=${backendSupportsPlane}\n# geometry: ${Array.isArray(workingSpec.geometry) ? workingSpec.geometry.length : 0}\n# monitors: ${monitors}`
}

export function translateToPyGDM(spec: any, options?: { backendSupportsPlane?: boolean }): string {
  const backendSupportsPlane = options?.backendSupportsPlane ?? true
  const workingSpec = prepareSpecForBackend(spec, backendSupportsPlane)
  return JSON.stringify({ _translated_for: 'pygdm', spec_keys: Object.keys(spec), monitors: workingSpec?.monitors || [], backendSupportsPlane }, null, 2)
}

// Expand plane monitors into point-grids when sampling.mode === 'points'. Returns a new spec with expanded monitors.
export function expandPlaneMonitors(spec: any): any {
  const out = { ...spec }
  out.monitors = []
  for (const m of (spec.monitors || [])) {
    if (m.type === 'plane' && (m.sampling?.mode ?? 'points') === 'points') {
      const nx = Math.max(1, m.sampling?.nx ?? 5)
      const ny = Math.max(1, m.sampling?.ny ?? 5)
      const w = (m.size?.[0] ?? 0)
      const h = (m.size?.[1] ?? 0)
      const hw = w / 2
      const hh = h / 2
      const ang = m.orientation ?? 0
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      let count = 0
      for (let i = 0; i < nx; i += 1) {
        for (let j = 0; j < ny; j += 1) {
          const fx = nx === 1 ? 0 : i / (nx - 1)
          const fy = ny === 1 ? 0 : j / (ny - 1)
          const dx = -hw + fx * 2 * hw
          const dy = -hh + fy * 2 * hh
          const x = m.position[0] + dx * c - dy * s
          const y = m.position[1] + dx * s + dy * c
          out.monitors.push({ id: `${m.id}_p${count}`, type: 'point', position: [x, y, m.position[2] ?? 0], components: m.components, dt: m.dt })
          count += 1
        }
      }
    } else {
      out.monitors.push(m)
    }
  }
  return out
}

// Meep translator: prefer direct plane sampling when backendSupportsPlane is true, otherwise expand planes into point-grids.
export function translateToMeep(spec: any, options?: { backendSupportsPlane?: boolean }): string {
  const backendSupportsPlane = options?.backendSupportsPlane ?? true

  // Determine whether any plane monitors need expansion
  // Expand if the monitor explicitly asked for point sampling, or if the backend does not
  // support plane monitors (in which case any plane monitor must be expanded).
  const needsExpansion = (spec.monitors || []).some((m: any) => {
    if (m.type !== 'plane') return false
    if ((m.sampling?.mode ?? '') === 'points') return true
    if (!backendSupportsPlane) return true
    return false
  })

  let workingSpec = spec
  if (needsExpansion) {
    // Convert plane monitors that need expansion to explicit point sampling
    const tmp = JSON.parse(JSON.stringify(spec))
    tmp.monitors = (tmp.monitors || []).map((m: any) => {
      if (m.type === 'plane') {
        const mode = m.sampling?.mode ?? 'points'
        if (mode === 'plane') {
          m.sampling = { ...m.sampling, mode: 'points', nx: m.sampling?.nx ?? 5, ny: m.sampling?.ny ?? 5 }
        }
        if (mode === 'points') {
          m.sampling = { ...m.sampling, nx: m.sampling?.nx ?? 5, ny: m.sampling?.ny ?? 5 }
        }
      }
      return m
    })
    workingSpec = expandPlaneMonitors(tmp)
  }

  const monitors = (workingSpec.monitors || []).map((m: any) => {
    if (m.type === 'plane') {
      return `# Monitor ${m.id}: plane size=${JSON.stringify(m.size)} orientation=${m.orientation}`
    }
    if (m.type === 'point') {
      return `# Monitor ${m.id}: point pos=${JSON.stringify(m.position)}`
    }
    return `# Monitor ${m.id}: unknown type=${m.type}`
  })

  return `# Meep translator\n# backendSupportsPlane=${backendSupportsPlane}\n# Monitors:\n${monitors.join('\n')}`
}
