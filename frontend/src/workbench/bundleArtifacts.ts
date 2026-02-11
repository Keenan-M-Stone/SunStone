import { downloadArtifactUrl } from '../sunstoneApi'

export type Bounds2D = { minX: number; minY: number; maxX: number; maxY: number }

export function normalizeBundleGeometryItems<T extends { id: string; shape: 'block'|'cylinder'; center: [number, number]; size: [number, number]; centerZ?: number; sizeZ?: number; materialId?: string }>(
  items: any[] | undefined,
  materialIdMap: Record<string, string>,
  nextId: (prefix: string) => string,
): T[] {
  if (!items) return []
  const out: T[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const shape = String(raw.shape || raw.type || '').toLowerCase()
    if (shape !== 'block' && shape !== 'cylinder') continue
    const center = Array.isArray(raw.center) ? raw.center : [0, 0]
    const size = Array.isArray(raw.size) ? raw.size : [0, 0]
    const midRaw = raw.materialId ?? raw.material ?? raw.material_id
    const mid = midRaw != null ? String(midRaw) : ''
    const mappedMaterialId = materialIdMap[mid] ?? mid

    if (shape === 'block') {
      out.push({
        id: nextId('geom'),
        shape: 'block',
        center: [Number(center[0] ?? 0), Number(center[1] ?? 0)],
        centerZ: 0,
        size: [Number(size[0] ?? 0), Number(size[1] ?? 0)],
        sizeZ: 0,
        materialId: mappedMaterialId,
      } as any)
    } else {
      const d = Number(size[0] ?? 0)
      const d2 = Number(size[1] ?? d)
      out.push({
        id: nextId('geom'),
        shape: 'cylinder',
        center: [Number(center[0] ?? 0), Number(center[1] ?? 0)],
        centerZ: 0,
        size: [d, d2],
        sizeZ: 0,
        materialId: mappedMaterialId,
      } as any)
    }
  }
  return out
}

export function computeGeometryBounds2D(items: Array<{ shape: string; center: [number, number]; size: [number, number] }>): Bounds2D | null {
  if (!items || items.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const g of items) {
    if (g.shape === 'block') {
      const hx = Math.abs(g.size[0] ?? 0) / 2
      const hy = Math.abs(g.size[1] ?? 0) / 2
      minX = Math.min(minX, (g.center[0] ?? 0) - hx)
      maxX = Math.max(maxX, (g.center[0] ?? 0) + hx)
      minY = Math.min(minY, (g.center[1] ?? 0) - hy)
      maxY = Math.max(maxY, (g.center[1] ?? 0) + hy)
    } else if (g.shape === 'cylinder') {
      const rx = Math.abs(g.size[0] ?? 0) / 2
      const ry = Math.abs((g.size[1] ?? g.size[0] ?? 0)) / 2
      minX = Math.min(minX, (g.center[0] ?? 0) - rx)
      maxX = Math.max(maxX, (g.center[0] ?? 0) + rx)
      minY = Math.min(minY, (g.center[1] ?? 0) - ry)
      maxY = Math.max(maxY, (g.center[1] ?? 0) + ry)
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
  return { minX, minY, maxX, maxY }
}

export function applyScaleAndTranslate2D<T extends { id: string; shape: 'block'|'cylinder'; center: [number, number]; size: [number, number] }>(
  items: T[],
  scaleX: number,
  scaleY: number,
  fromCenter: [number, number],
  toCenter: [number, number],
  nextId: (prefix: string) => string,
): T[] {
  const out: T[] = []
  for (const g of items) {
    const dx = (g.center[0] - fromCenter[0]) * scaleX
    const dy = (g.center[1] - fromCenter[1]) * scaleY
    if (g.shape === 'block') {
      out.push({
        ...(g as any),
        id: nextId('geom'),
        center: [toCenter[0] + dx, toCenter[1] + dy],
        size: [Number(g.size[0] ?? 0) * scaleX, Number(g.size[1] ?? 0) * scaleY],
      })
    } else {
      const s = Math.min(Math.abs(scaleX), Math.abs(scaleY))
      out.push({
        ...(g as any),
        id: nextId('geom'),
        center: [toCenter[0] + dx, toCenter[1] + dy],
        size: [Number(g.size[0] ?? 0) * s, Number((g.size[1] ?? g.size[0] ?? 0)) * s],
      })
    }
  }
  return out
}

export async function fetchBundleArtifactJson(runId: string, path: string): Promise<any> {
  const url = downloadArtifactUrl(runId, path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch artifact: ${res.status} ${res.statusText}`)
  return await res.json()
}

export function computeBundleMaterialIdMap(payload: any, bundlePrefix: string): Record<string, string> {
  const cad = payload?.cad ?? payload?.model ?? {}
  const mats = Array.isArray(cad?.materials) ? cad.materials : []
  const materialIdMap: Record<string, string> = {}
  for (const m of mats) {
    const oldId = String(m?.id || '')
    if (!oldId) continue
    materialIdMap[oldId] = `${bundlePrefix}-${oldId}`
  }
  return materialIdMap
}

export function mergeBundleMaterials(payload: any, bundlePrefix: string, currentMaterials: any[]): { nextMaterials: any[] } {
  const cad = payload?.cad ?? payload?.model ?? {}
  const mats = Array.isArray(cad?.materials) ? cad.materials : []
  if (mats.length === 0) return { nextMaterials: currentMaterials }

  const materialIdMap = computeBundleMaterialIdMap(payload, bundlePrefix)
  const next = [...currentMaterials]
  for (const m of mats) {
    const oldId = String(m?.id || '')
    if (!oldId) continue
    const newId = materialIdMap[oldId]
    if (next.some((x: any) => String(x?.id) === newId)) continue
    next.push({
      ...m,
      id: newId,
      label: String(m?.label ?? newId),
      color: String(m?.color ?? '#94a3b8'),
      model: String(m?.model ?? m?.type ?? 'constant'),
    })
  }
  return { nextMaterials: next }
}
