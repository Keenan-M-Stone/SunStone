import { useState } from 'react'
import { expandGradientBatch } from './sunstoneApi'

export default function DiscretizePreviewModal({ open, onClose, geometry, materials, defaultSlices = 8, defaultAxis = 'x', onComplete }: {
  open: boolean
  onClose: () => void
  geometry: any[]
  materials: any[]
  defaultSlices?: number
  defaultAxis?: string
  onComplete: (backend: string, results: Record<string, any[]>) => void
}) {
  const [backend, setBackend] = useState<string>('meep')
  const [slices, setSlices] = useState<number>(defaultSlices)
  const [axis, setAxis] = useState<string>(defaultAxis)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchPreview() {
    setBusy(true)
    setError(null)
    try {
      // For each geometry with gradient or material that has gradient, build batch items
      const items: Array<any> = []
      for (const g of geometry) {
        const mat = materials.find((m) => m.id === g.materialId) || null
        if ((g.shape === 'gradient') || (mat && mat.gradient)) {
          const key = `${g.id}:${mat?.id ?? 'inline'}`
          const bodyMat = mat || g.material || {}
          const geom = g || {}
          items.push({ key, material: bodyMat, geometry: geom, slices, axis })
        }
      }
      if (items.length === 0) {
        onComplete(backend, {})
        return
      }
      // Use batch API for efficiency
      const res = await expandGradientBatch(items)
      const results: Record<string, any[]> = {}
      if (res && res.results) {
        for (const k of Object.keys(res.results)) {
          results[k] = res.results[k]
        }
      }
      onComplete(backend, results)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ width: 640, background: '#0b0b10', color: '#e8e8e8', padding: 16, borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Discretize Preview</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label>Backend
            <select value={backend} onChange={e => setBackend(e.target.value)}>
              <option value="meep">Meep</option>
              <option value="dummy">Dummy</option>
              <option value="opal">Opal</option>
            </select>
          </label>
          <label>Slices
            <input type="number" value={slices} onChange={e => setSlices(Number(e.target.value))} style={{ width: 80, marginLeft: 6 }} />
          </label>
          <label>Axis
            <select value={axis} onChange={e => setAxis(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="x">x</option>
              <option value="y">y</option>
              <option value="z">z</option>
              <option value="radial">radial</option>
            </select>
          </label>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ marginRight: 8 }}>Cancel</button>
            <button className="primary" onClick={fetchPreview} disabled={busy}>{busy ? 'Fetching...' : 'Fetch preview'}</button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="muted">This will call the backend's expand/discretize logic to compute slices. Results are cached per backend/material/geometry.</div>
          {error ? <div style={{ color: 'salmon', marginTop: 8 }}>{error}</div> : null}
        </div>
      </div>
    </div>
  )
}
