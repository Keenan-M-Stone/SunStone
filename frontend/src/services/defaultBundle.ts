export interface DefaultSceneData {
  materials: Array<{ id: string; label: string; eps: number; color: string; model?: string }>
  geometry: any[]
  sources: any[]
  monitors: any[]
  cellSize: [number, number, number]
  pml?: [number, number, number]
}

export function loadDefaultScene(bundle: Record<string, unknown>): DefaultSceneData {
  const cad = (bundle as any)?.cad ?? (bundle as any)?.model ?? {}

  const materials = cad?.materials
    ? (cad.materials as any[]).map((m: any) => ({
        id: m.id,
        label: m.label ?? m.id,
        eps: Number.isFinite(m.eps) ? m.eps : 1.0,
        color: m.color ?? '#94a3b8',
        model: m.model ?? 'constant',
      }))
    : []

  return {
    materials,
    geometry: cad?.geometry ?? [],
    sources: cad?.sources ?? [],
    monitors: cad?.monitors ?? [],
    cellSize: cad?.domain?.cell_size ?? [2e-6, 2e-6, 1e-6],
    pml: cad?.domain?.pml,
  }
}
