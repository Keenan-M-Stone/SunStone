import earcut from 'earcut'

export type Point = [number, number]

// Triangulate a single polygon (no holes) given as array of [x,y]
export function triangulatePolygon(points: Point[]) {
  // flatten
  const coords: number[] = []
  for (const p of points) {
    coords.push(p[0], p[1])
  }
  const indices = earcut(coords)
  const triangles: Array<[Point, Point, Point]> = []
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    triangles.push([points[a], points[b], points[c]])
  }
  return triangles
}

export function exportOBJ(triangles: Array<[Point, Point, Point]>) {
  let out = ''
  for (const tri of triangles) {
    for (const v of tri) {
      out += `v ${v[0]} ${v[1]} 0\n`
    }
  }
  // faces (triplets sequentially added per triangle)
  for (let i = 0; i < triangles.length; i++) {
    const idx = i * 3
    out += `f ${idx + 1} ${idx + 2} ${idx + 3}\n`
  }
  return out
}

export function exportSTL(triangles: Array<[Point, Point, Point]>, name = 'mesh') {
  let out = `solid ${name}\n`
  for (const tri of triangles) {
    const [a, b, c] = tri
    // compute normal (z only)
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const nx = 0
    const ny = 0
    const nz = ux * vy - uy * vx
    out += `  facet normal ${nx} ${ny} ${nz}\n`
    out += `    outer loop\n`
    out += `      vertex ${a[0]} ${a[1]} 0\n`
    out += `      vertex ${b[0]} ${b[1]} 0\n`
    out += `      vertex ${c[0]} ${c[1]} 0\n`
    out += `    endloop\n`
    out += `  endfacet\n`
  }
  out += `endsolid ${name}\n`
  return out
}

export function estimateTriangleCount(polygons: Point[][], density = 1) {
  // crude estimate: sum of polygon areas * density
  let area = 0
  for (const poly of polygons) {
    let a = 0
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]
      const p2 = poly[(i + 1) % poly.length]
      a += p1[0] * p2[1] - p2[0] * p1[1]
    }
    area += Math.abs(a) / 2
  }
  // assume one triangle per unit area*density
  const tri = Math.max(1, Math.floor(area * density))
  return tri
}

export function samplePolygonsFromSpec(spec: any, density = 1): Point[][] {
  // look for polygon-like shapes in spec.geometry
  const polys: Point[][] = []
  for (const g of spec.geometry || []) {
    if (g.shape === 'polygon' && Array.isArray(g.points)) {
      polys.push(g.points.map((p: any) => [Number(p[0]), Number(p[1])]))
    }
    // fallback: for block -> rectangle polygon
    if (g.type === 'block') {
      const size = g.size || [0, 0, 0]
      const c = g.center || [0, 0, 0]
      const hw = (size[0] || 0) / 2
      const hh = (size[1] || 0) / 2
      polys.push([
        [c[0] - hw, c[1] - hh],
        [c[0] + hw, c[1] - hh],
        [c[0] + hw, c[1] + hh],
        [c[0] - hw, c[1] + hh],
      ])
    }
    if (g.type === 'cylinder') {
      const r = g.radius || 0.1
      const c = g.center || [0, 0, 0]
      const n = Math.max(12, Math.floor(6 * density))
      const pts: Point[] = []
      for (let i = 0; i < n; i++) {
        const theta = (i / n) * Math.PI * 2
        pts.push([c[0] + r * Math.cos(theta), c[1] + r * Math.sin(theta)])
      }
      polys.push(pts)
    }
  }
  return polys
}
