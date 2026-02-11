export type Triangle3 = [[number, number, number], [number, number, number], [number, number, number]]

export function toStlSolid(name: string, triangles: Triangle3[]) {
  let out = `solid ${name}\n`
  for (const tri of triangles) {
    const [a, b, c] = tri
    // normal via cross product (b-a) x (c-a)
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    out += `  facet normal ${nx} ${ny} ${nz}\n`
    out += `    outer loop\n`
    out += `      vertex ${a[0]} ${a[1]} ${a[2]}\n`
    out += `      vertex ${b[0]} ${b[1]} ${b[2]}\n`
    out += `      vertex ${c[0]} ${c[1]} ${c[2]}\n`
    out += `    endloop\n`
    out += `  endfacet\n`
  }
  out += `endsolid ${name}\n`
  return out
}

export function boxTriangles(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Triangle3[] {
  const hx = sx / 2
  const hy = sy / 2
  const hz = sz / 2
  const x0 = cx - hx
  const x1 = cx + hx
  const y0 = cy - hy
  const y1 = cy + hy
  const z0 = cz - hz
  const z1 = cz + hz

  const v000: [number, number, number] = [x0, y0, z0]
  const v001: [number, number, number] = [x0, y0, z1]
  const v010: [number, number, number] = [x0, y1, z0]
  const v011: [number, number, number] = [x0, y1, z1]
  const v100: [number, number, number] = [x1, y0, z0]
  const v101: [number, number, number] = [x1, y0, z1]
  const v110: [number, number, number] = [x1, y1, z0]
  const v111: [number, number, number] = [x1, y1, z1]

  const tris: Triangle3[] = []
  // -X
  tris.push([v000, v001, v011], [v000, v011, v010])
  // +X
  tris.push([v100, v110, v111], [v100, v111, v101])
  // -Y
  tris.push([v000, v100, v101], [v000, v101, v001])
  // +Y
  tris.push([v010, v011, v111], [v010, v111, v110])
  // -Z
  tris.push([v000, v010, v110], [v000, v110, v100])
  // +Z
  tris.push([v001, v101, v111], [v001, v111, v011])
  return tris
}

export function cylinderTriangles(cx: number, cy: number, cz: number, radius: number, height: number, segments = 24): Triangle3[] {
  const hz = height / 2
  const z0 = cz - hz
  const z1 = cz + hz
  const top: [number, number, number] = [cx, cy, z1]
  const bot: [number, number, number] = [cx, cy, z0]

  const ring0: Array<[number, number, number]> = []
  const ring1: Array<[number, number, number]> = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const x = cx + radius * Math.cos(t)
    const y = cy + radius * Math.sin(t)
    ring0.push([x, y, z0])
    ring1.push([x, y, z1])
  }

  const tris: Triangle3[] = []
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    // side quads
    tris.push([ring0[i], ring1[i], ring1[j]], [ring0[i], ring1[j], ring0[j]])
    // caps
    tris.push([top, ring1[j], ring1[i]])
    tris.push([bot, ring0[i], ring0[j]])
  }
  return tris
}

export type SimpleGeometryItem = {
  type: 'block' | 'cylinder'
  center: [number, number]
  size?: [number, number]
  radius?: number
  centerZ?: number
  sizeZ?: number
}

export function geometryItemsToStl(name: string, items: SimpleGeometryItem[], defaultThickness = 1): string {
  const triangles: Triangle3[] = []
  for (const g of items) {
    const cz = (g.centerZ ?? 0)
    const sz = (g.sizeZ ?? defaultThickness)
    if (g.type === 'block') {
      const sx = g.size?.[0] ?? 0
      const sy = g.size?.[1] ?? 0
      triangles.push(...boxTriangles(g.center[0], g.center[1], cz, sx, sy, sz))
    } else if (g.type === 'cylinder') {
      const r = g.radius ?? 0
      triangles.push(...cylinderTriangles(g.center[0], g.center[1], cz, r, sz))
    }
  }
  return toStlSolid(name, triangles)
}
