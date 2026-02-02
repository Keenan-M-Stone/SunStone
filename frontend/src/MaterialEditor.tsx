import { useState, useRef, useEffect } from 'react'
import { createMaterial } from './sunstoneApi'
import * as Gradients from './util/gradients'

type DispersionTableRow = { f: number; re: number; im: number }

export default function MaterialEditor({ materials, setMaterials, onClose }:
  { materials: any[]; setMaterials: (m: any[]) => void; onClose: () => void }) {
  void materials // avoid unused variable warnings
  const [local, setLocal] = useState(() => materials.map(m => ({ ...m })))
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [paramOpen, setParamOpen] = useState(false)
  const [paramImportId, setParamImportId] = useState<string>('')
  const [autoCoord, setAutoCoord] = useState<'cartesian'|'spherical'|'cylindrical'>('cartesian')
  const [autoKind, setAutoKind] = useState<'none'|'linear'|'exponential'|'logarithmic'>('linear')
  const [autoAxis, setAutoAxis] = useState<string>('x')
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  // feature-detect canvas context availability (avoid noisy jsdom errors in test env)
  const canvasAvailable = (() => {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') return false
      if (typeof OffscreenCanvas !== 'undefined') return true
      if (typeof HTMLCanvasElement === 'undefined') return false
      const proto = (HTMLCanvasElement.prototype as any)
      if (!proto || typeof proto.getContext !== 'function') return false
      try {
        const c = document.createElement('canvas')
        const ctx = (c as any).getContext && (c as any).getContext('2d')
        return !!ctx
      } catch (e) {
        return false
      }
    } catch (e) {
      return false
    }
  })()

  function addMaterial() {
    const id = 'mat-' + Math.random().toString(36).slice(2, 8)
    setLocal(prev => {
      const idx = prev.length
      const next = [...prev, { id, label: id, eps: 1.0, color: '#cccccc', model: 'isotropic' }]
      setEditingIndex(idx)
      return next
    })
  }

  function update(idx: number, changes: any) {
    setLocal(prev => prev.map((m, i) => i === idx ? { ...m, ...changes } : m))
  }

  function remove(idx: number) {
    setLocal(prev => prev.filter((_, i) => i !== idx))
    setEditingIndex(null)
  }

  function importCSV(idx: number, file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const txt = String(reader.result || '')
      const rows = txt.trim().split(/\r?\n/).map(l => l.split(/,|\s+/).map(s => s.trim()).filter(Boolean))
      const data: DispersionTableRow[] = []
      for (const r of rows) {
        if (r.length >= 2) {
          const f = Number(r[0])
          const re = Number(r[1])
          const im = r.length >= 3 ? Number(r[2]) : 0
          if (!Number.isNaN(f) && !Number.isNaN(re) && !Number.isNaN(im)) data.push({ f, re, im })
        }
      }
      update(idx, { dispersion: { model: 'table', data } })
    }
    reader.readAsText(file)
  }

  function save() {
    setMaterials(local)
    onClose()
  }

  // draw preview when editing gradient
  useEffect(() => {
    const c = previewRef.current
    if (!c || editingIndex === null) return
    const g = local[editingIndex].gradient
    const m = local[editingIndex]
    if (!canvasAvailable) return
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = (c as HTMLCanvasElement).getContext('2d')
    } catch (e) {
      ctx = null
    }
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    if (!g) return
    try {
      const start: [number, number] = [g.start?.[0] ?? -0.5, g.start?.[1] ?? 0]
      const end: [number, number] = [g.end?.[0] ?? 0.5, g.end?.[1] ?? 0]
      const stops = Gradients.generateGradientStops(m, start, end, 16)
      const grad = ctx.createLinearGradient(0, c.height / 2, c.width, c.height / 2)
      stops.forEach((s: any) => {
        grad.addColorStop(s.offset, s.color)
      })
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, c.width, c.height)
    } catch (e) {
      // ignore
    }
  }, [editingIndex, local])

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 900, maxHeight: '80vh', overflow: 'auto', background: '#0b0b10', color: '#e8e8e8', padding: 18, borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Material Editor</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Materials</strong>
              <button onClick={addMaterial}>Add</button>
            </div>
            <div style={{ marginTop: 12 }}>
              {local.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 6, borderRadius: 6, background: i === editingIndex ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <div style={{ width: 10, height: 24, background: m.color, borderRadius: 4 }} />
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div className="mono">{m.id}</div>
                      <div className="muted">{m.label}</div>
                    </div>
                    {m.approximate_complex ? (
                      <div style={{ background: '#2b6cb0', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>Approximate</div>
                    ) : null}
                  </div>
                  <div>
                    <button onClick={() => setEditingIndex(i)}>Edit</button>
                    <button onClick={() => remove(i)} style={{ marginLeft: 6 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {editingIndex === null ? <div className="muted">Select a material to edit</div> : (() => {
              const m = local[editingIndex]
              if (!m) return null
              return (
                <div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ flex: 1 }}>ID
                      <input value={m.id} onChange={(e) => update(editingIndex, { id: e.target.value })} />
                    </label>
                    <label style={{ flex: 2 }}>Label
                      <input value={m.label} onChange={(e) => update(editingIndex, { label: e.target.value })} />
                    </label>
                    <label>Color
                      <input type="color" value={m.color} onChange={(e) => update(editingIndex, { color: e.target.value })} />
                    </label>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label>Model
                      <select value={m.model || 'isotropic'} onChange={(e) => update(editingIndex, { model: e.target.value })}>
                        <option value="isotropic">Isotropic (scalar eps)</option>
                        <option value="anisotropic">Anisotropic (3x3 tensor)</option>
                        <option value="drude">Drude</option>
                        <option value="lorentz">Lorentz</option>
                      </select>
                    </label>
                    <button style={{ marginLeft: 12 }} onClick={() => setParamOpen(p => !p)}>Parameterize</button>
                  </div>
                  {paramOpen && (
                    <div style={{ marginTop: 12, padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={paramImportId} onChange={(e) => setParamImportId(e.target.value)}>
                          <option value="">-- Import from existing --</option>
                          {materials.map(mat => <option key={mat.id} value={mat.id}>{mat.id} - {mat.label}</option>)}
                        </select>
                        <button onClick={() => {
                          if (editingIndex === null || !paramImportId) return
                          const src = materials.find(x => x.id === paramImportId)
                          if (!src) return
                          update(editingIndex, { eps: src.eps, color: src.color, model: src.model, dispersion: src.dispersion, gradient: src.gradient })
                        }}>Import properties</button>

                        <button onClick={() => {
                          if (editingIndex === null) return
                          const g = (window as any).__last_drawn_gradient
                          if (!g) return
                          const s = g.start || [0, 0]
                          const e = g.end || [0, 0]
                          update(editingIndex, { gradient: { type: 'linear', start: [s[0], s[1], 0], end: [e[0], e[1], 0], axis: 'x' } })
                        }}>Import gradient arrow</button>

                        {/* Parameter fields for Drude model */}
                        {m.model === 'drude' && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12 }}>
                            <label>eps_inf
                              <input type="number" step="0.1" value={m.eps_inf ?? 1.0} onChange={(e) => update(editingIndex, { eps_inf: Number(e.target.value) })} />
                            </label>
                            <label>wp
                              <input type="number" step="1e13" value={(m.params && m.params.wp) ?? 1e16} onChange={(e) => update(editingIndex, { params: { ...(m.params || {}), wp: Number(e.target.value) } })} />
                            </label>
                            <label>gamma
                              <input type="number" step="1e12" value={(m.params && m.params.gamma) ?? 1e13} onChange={(e) => update(editingIndex, { params: { ...(m.params || {}), gamma: Number(e.target.value) } })} />
                            </label>
                          </div>
                        )}

                        {/* Auto gradient controls */}
                        <div style={{ marginLeft: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            Coord
                            <select id="auto-coord" defaultValue="cartesian" onChange={(e) => setAutoCoord(e.target.value as any)}>
                              <option value="cartesian">Cartesian</option>
                              <option value="spherical">Spherical</option>
                              <option value="cylindrical">Cylindrical</option>
                            </select>
                          </label>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            Kind
                            <select id="auto-kind" defaultValue="linear" onChange={(e) => setAutoKind(e.target.value as any)}>
                              <option value="none">none</option>
                              <option value="linear">linear</option>
                              <option value="exponential">exponential</option>
                              <option value="logarithmic">logarithmic</option>
                            </select>
                          </label>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            Axis
                            <select id="auto-axis" defaultValue="x" onChange={(e) => setAutoAxis(e.target.value)}>
                              <option value="x">x</option>
                              <option value="y">y</option>
                              <option value="z">z</option>
                              <option value="xy">xy</option>
                              <option value="xyz">xyz</option>
                            </select>
                          </label>
                          <button onClick={() => {
                            if (editingIndex === null) return
                            const mat = local[editingIndex]
                            const bounds: { min: [number, number]; max: [number, number] } = { min: [-0.5, -0.5], max: [0.5, 0.5] }
                            // try to read geometry bounds from global geometry if present
                            try {
                              const geom = (window as any).__geometry || []
                              const used = geom.find((gg: any) => gg.materialId === mat.id)
                              if (used) {
                                const minx = (used.center?.[0] ?? 0) - (used.size?.[0] ?? 1) / 2
                                const miny = (used.center?.[1] ?? 0) - (used.size?.[1] ?? 1) / 2
                                const maxx = (used.center?.[0] ?? 0) + (used.size?.[0] ?? 1) / 2
                                const maxy = (used.center?.[1] ?? 0) + (used.size?.[1] ?? 1) / 2
                                bounds.min = [minx, miny]
                                bounds.max = [maxx, maxy]
                              }
                            } catch (e) { }
                            try {
                                const grad = Gradients.generateAutoGradient(autoKind, autoCoord as any, autoAxis, bounds)
                              update(editingIndex, { gradient: grad })
                              // apply to CAD via global helper
                              try { (window as any).__applyGradientToGeometry && (window as any).__applyGradientToGeometry(local[editingIndex].id, grad) } catch (e) {}
                            } catch (e) {
                              console.warn('auto generation failed', e)
                            }
                          }}>Auto</button>
                        </div>

                      </div>

                      <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                        <div style={{ width: 220 }}>
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>Preview</div>
                          <canvas ref={previewRef} width={220} height={80} style={{ width: '220px', height: '80px', marginTop: 6, borderRadius: 4, background: 'rgba(0,0,0,0.08)' }} />
                        </div>

                        <div style={{ flex: 1 }}>
                          {editingIndex !== null && (local[editingIndex].gradient ? (() => {
                            const g = local[editingIndex].gradient
                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div>
                                  <div className="muted">Start (x, y, z)</div>
                                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <input type="number" value={g.start[0] ?? 0} onChange={e => update(editingIndex, { gradient: { ...g, start: [Number(e.target.value), g.start[1] ?? 0, g.start[2] ?? 0] } })} />
                                    <input type="number" value={g.start[1] ?? 0} onChange={e => update(editingIndex, { gradient: { ...g, start: [g.start[0] ?? 0, Number(e.target.value), g.start[2] ?? 0] } })} />
                                    <input type="number" value={g.start[2] ?? 0} onChange={e => update(editingIndex, { gradient: { ...g, start: [g.start[0] ?? 0, g.start[1] ?? 0, Number(e.target.value)] } })} />
                                  </div>
                                </div>
                                <div>
                                  <div className="muted">End (x, y, z)</div>
                                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <input type="number" value={g.end[0] ?? 0} onChange={e => update(editingIndex, { gradient: { ...g, end: [Number(e.target.value), g.end[1] ?? 0, g.end[2] ?? 0] } })} />
                                    <input type="number" value={g.end[1] ?? 0} onChange={e => update(editingIndex, { gradient: { ...g, end: [g.end[0] ?? 0, Number(e.target.value), g.end[2] ?? 0] } })} />
                                    <input type="number" value={g.end[2] ?? 0} onChange={e => update(editingIndex, { gradient: { ...g, end: [g.end[0] ?? 0, g.end[1] ?? 0, Number(e.target.value)] } })} />
                                  </div>
                                </div>

                                <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                  <label>Axis
                                    <select value={g.axis || 'x'} onChange={e => update(editingIndex, { gradient: { ...g, axis: e.target.value } })}>
                                      <option value="x">x</option>
                                      <option value="y">y</option>
                                      <option value="z">z</option>
                                      <option value="radial">radial</option>
                                    </select>
                                  </label>
                                  <label style={{ marginLeft: 12 }}>Slices
                                    <input type="number" value={g.slices ?? 8} onChange={e => update(editingIndex, { gradient: { ...g, slices: Number(e.target.value) } })} />
                                  </label>
                                </div>

                                <div style={{ gridColumn: '1 / -1', marginTop: 8, display: 'flex', gap: 8 }}>
                                  <button onClick={async () => {
                                    const m = local[editingIndex]
                                    const body = { label: m.label, model: m.model, color: m.color, eps: m.eps, gradient: m.gradient }
                                    try {
                                      const res = await createMaterial(body)
                                      setLocal(prev => prev.map((it, idx) => idx === editingIndex ? { ...it, id: res.id } : it))
                                      alert('Material created: ' + res.id)
                                    } catch (err) {
                                      console.error('create failed', err)
                                      alert('Create failed: ' + String(err))
                                    }
                                  }}>Create on server</button>
                                </div>

                              </div>
                            )
                          })() : <div className="muted">No gradient defined for this material</div>)}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    {m.model === 'anisotropic' ? (
                      <div>
                        <div className="muted">Enter 3x3 permittivity tensor (row-major)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                          {Array.from({ length: 9 }).map((_, idx) => (
                            <input key={idx} value={(m.epsilon && m.epsilon[idx]) ?? ''} onChange={(e) => {
                              const next = (m.epsilon && [...m.epsilon]) || Array(9).fill(0)
                              next[idx] = Number(e.target.value)
                              update(editingIndex, { epsilon: next })
                            }} />
                          ))}
                        </div>
                      </div>
                    ) : m.model === 'isotropic' ? (
                      <div>
                        <label>eps
                          <input type="number" value={m.eps ?? 1} onChange={(e) => update(editingIndex, { eps: Number(e.target.value) })} />
                        </label>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="checkbox" checked={!!m.approximate_complex} onChange={(e) => update(editingIndex, { approximate_complex: e.target.checked })} />
                            <span className="muted">Approximate complex eps (Drude fit)</span>
                          </label>
                          <a href="/docs/foss-optics-fdtd-spec.md" target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>Docs</a>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="muted">Simple dispersion parameters</div>
                        {m.model === 'drude' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <label>plasma_freq<input type="number" value={m.dispersion?.plasma_freq ?? ''} onChange={e => update(editingIndex, { dispersion: { ...(m.dispersion||{}), plasma_freq: Number(e.target.value) } })} /></label>
                            <label>gamma<input type="number" value={m.dispersion?.gamma ?? ''} onChange={e => update(editingIndex, { dispersion: { ...(m.dispersion||{}), gamma: Number(e.target.value) } })} /></label>
                          </div>
                        )}
                        {m.model === 'lorentz' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <label>omega0<input type="number" value={m.dispersion?.omega0 ?? ''} onChange={e => update(editingIndex, { dispersion: { ...(m.dispersion||{}), omega0: Number(e.target.value) } })} /></label>
                            <label>gamma<input type="number" value={m.dispersion?.gamma ?? ''} onChange={e => update(editingIndex, { dispersion: { ...(m.dispersion||{}), gamma: Number(e.target.value) } })} /></label>
                          </div>
                        )}
                        <div style={{ marginTop: 8 }}>
                          <div>Or import CSV (freq, real, imag)</div>
                          <input type="file" accept=".csv,.txt" onChange={e => importCSV(editingIndex, e.target.files?.[0] ?? null)} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button onClick={() => setEditingIndex(null)}>Done</button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={() => onClose()}>Cancel</button>
          <button className="primary" onClick={save}>Save materials</button>
        </div>
      </div>
    </div>
  )
}
