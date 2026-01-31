import { useState } from 'react'

type DispersionTableRow = { f: number; re: number; im: number }

export default function MaterialEditor({ materials, setMaterials, onClose }:
  { materials: any[]; setMaterials: (m: any[]) => void; onClose: () => void }) {
  void materials // avoid unused variable warnings
  const [local, setLocal] = useState(() => materials.map(m => ({ ...m })))
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

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
                  <div style={{ flex: 1 }}>
                    <div className="mono">{m.id}</div>
                    <div className="muted">{m.label}</div>
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
                  </div>

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
                      <label>eps
                        <input type="number" value={m.eps ?? 1} onChange={(e) => update(editingIndex, { eps: Number(e.target.value) })} />
                      </label>
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
