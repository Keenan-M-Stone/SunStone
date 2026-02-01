export type CoordSystem = 'cartesian' | 'spherical' | 'cylindrical'
export type AutoKind = 'none' | 'linear' | 'exponential' | 'logarithmic'

export type Gradient = {
  type: 'linear' | 'radial' | 'angular'
  start?: [number, number, number]
  end?: [number, number, number]
  center?: [number, number, number]
  axis?: 'x' | 'y' | 'z' | 'radial'
  func?: any // placeholder for function-based gradients (expressions, tensors)
  slices?: number
}

export function sampleGradient(material: any, pos: [number, number, number], _geomCenter?: [number, number, number]) {  // Very small set of sampling rules mirroring backend semantics enough for preview
  if (!material || !material.gradient) return { eps: material?.eps ?? 1 }
  const g = material.gradient
  if (g.type === 'linear' && g.start && g.end) {
    const sx = g.start[0]
    const sy = g.start[1]
    const ex = g.end[0]
    const ey = g.end[1]
    const dx = ex - sx
    const dy = ey - sy
    const denom = dx * dx + dy * dy || 1
    const t = ((pos[0] - sx) * dx + (pos[1] - sy) * dy) / denom
    // clip
    const tt = Math.max(0, Math.min(1, t))
    const v0 = (g.value0 ?? (material.eps ?? 1))
    const v1 = (g.value1 ?? v0)
    const eps = v0 + (v1 - v0) * tt
    return { eps }
  }
  if (g.type === 'radial' && g.center) {
    const cx = g.center[0]
    const cy = g.center[1]
    const r = Math.hypot(pos[0] - cx, pos[1] - cy)
    const rr = (r - (g.inner ?? 0)) / ((g.outer ?? 1) - (g.inner ?? 0))
    const tt = Math.max(0, Math.min(1, rr))
    const v0 = (g.value0 ?? (material.eps ?? 1))
    const v1 = (g.value1 ?? v0)
    const eps = v0 + (v1 - v0) * tt
    return { eps }
  }
  // fallback
  return { eps: material?.eps ?? 1 }
}

export function computeShading(material: any, pos: [number, number, number]) {
  const s = sampleGradient(material, pos)
  // map eps to color/alpha for preview purposes: interpolate saturation/lightness
  const eps = Number(s.eps ?? 1)
  // simple mapping: lower eps -> lighter, higher eps -> darker
  const t = Math.max(0, Math.min(1, (eps - 1) / 20))
  const r = Math.round(lerp(255, 36, t))
  const g = Math.round(lerp(255, 123, t))
  const b = Math.round(lerp(255, 196, t))
  const alpha = 0.5 + 0.5 * t
  return { color: `rgb(${r}, ${g}, ${b})`, alpha }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function generateGradientStops(material: any, start: [number, number], end: [number, number], n: number = 8) {
  const stops = [] as Array<{ offset: number; color: string; alpha: number }>
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = start[0] + (end[0] - start[0]) * t
    const y = start[1] + (end[1] - start[1]) * t
    const { color, alpha } = computeShading(material, [x, y, 0])
    stops.push({ offset: t, color, alpha })
  }
  return stops
}

export function generateAutoGradient(_kind: AutoKind, coord: CoordSystem, axis: string, bounds: { min: [number, number]; max: [number, number] }): Gradient {
  // generate a simple linear gradient in common defaults
  const [minX, minY] = bounds.min
  const [maxX, maxY] = bounds.max
  if (coord === 'cartesian') {
    // axis selection: x, y, z, xy, xz, yz, xyz
    let sx: [number, number, number] = [minX, (minY + maxY) / 2, 0]
    let ex: [number, number, number] = [maxX, (minY + maxY) / 2, 0]
    if (axis === 'y') {
      sx = [(minX + maxX) / 2, minY, 0]
      ex = [(minX + maxX) / 2, maxY, 0]
    }
    if (axis === 'xy') {
      sx = [minX, minY, 0]
      ex = [maxX, maxY, 0]
    }
    // other combos default to x
    return { type: 'linear', start: sx, end: ex, axis: axis as any }
  }
  if (coord === 'spherical') {
    // produce radial gradient from center out
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    return { type: 'radial', center: [cx, cy, 0] }
  }
  if (coord === 'cylindrical') {
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    return { type: 'radial', center: [cx, cy, 0] }
  }
  return { type: 'linear' }
}
