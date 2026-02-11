export default function DetectorPropertiesPanel(props: {
  selectedId: string | null
  selectedType: any
  dimension: any

  monitors: any[]
  updateMonitor: (id: string, patch: any) => void

  displayUnits: any
  displayScale: number
  toDisplayLength: (v: number, units: any) => number
  fromDisplayLength: (v: number, units: any) => number
}) {
  const {
    selectedId,
    selectedType,
    dimension,
    monitors,
    updateMonitor,
    displayUnits,
    displayScale,
    toDisplayLength,
    fromDisplayLength,
  } = props

  if (!selectedId || selectedType !== 'monitor') return null

  return (
    <div className="editor">
      <h3>Detector Properties</h3>
      {monitors
        .filter((m) => m.id === selectedId)
        .map((m) => (
          <div key={m.id} className="fields">
            <label>
              Components
              <div className="row">
                {(['Ex', 'Ey', 'Ez'] as const).map((c) => (
                  <label key={c} className="check">
                    <input
                      type="checkbox"
                      checked={m.components.includes(c)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...m.components, c] : m.components.filter((v: any) => v !== c)
                        updateMonitor(m.id, { components: next })
                      }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </label>

            <label>
              Position (x, y)
              <div className="row">
                <input
                  type="number"
                  value={m.position[0]}
                  step="1e-8"
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    updateMonitor(m.id, { position: [Number.isFinite(v) ? v : m.position[0], m.position[1]] })
                  }}
                />
                <input
                  type="number"
                  value={m.position[1]}
                  step="1e-8"
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    updateMonitor(m.id, { position: [m.position[0], Number.isFinite(v) ? v : m.position[1]] })
                  }}
                />
              </div>
            </label>

            {dimension === '3d' && (
              <label>
                Position (z)
                <input
                  type="number"
                  value={m.z}
                  step="1e-8"
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    updateMonitor(m.id, { z: Number.isFinite(v) ? v : m.z })
                  }}
                />
              </label>
            )}

            <label>
              dt
              <input
                type="number"
                value={m.dt}
                step="1e-16"
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber
                  updateMonitor(m.id, { dt: Number.isFinite(v) ? v : m.dt })
                }}
              />
            </label>

            <label>
              Orientation (deg)
              <input
                type="number"
                value={((m.orientation ?? 0) * 180) / Math.PI}
                step="1"
                onChange={(e) => {
                  const deg = e.currentTarget.valueAsNumber
                  const rad = Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0
                  updateMonitor(m.id, { orientation: rad })
                }}
              />
            </label>

            <label>
              Type
              <select value={m.shape ?? 'point'} onChange={(e) => updateMonitor(m.id, { shape: e.target.value })}>
                <option value="point">Point</option>
                <option value="plane">Planar slice</option>
              </select>
            </label>

            {m.shape === 'plane' && (
              <>
                <label>
                  Size (width, height) ({displayUnits === 'um' ? 'µm' : displayUnits})
                  <div className="row">
                    <input
                      type="number"
                      value={toDisplayLength(m.size?.[0] ?? 4e-7, displayUnits)}
                      step={1e-8 * displayScale}
                      onChange={(e) => {
                        const v = e.currentTarget.valueAsNumber
                        const next = [
                          Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : m.size?.[0] ?? 4e-7,
                          m.size?.[1] ?? 4e-7,
                        ] as [number, number]
                        updateMonitor(m.id, { size: next })
                      }}
                    />
                    <input
                      type="number"
                      value={toDisplayLength(m.size?.[1] ?? 4e-7, displayUnits)}
                      step={1e-8 * displayScale}
                      onChange={(e) => {
                        const v = e.currentTarget.valueAsNumber
                        const next = [
                          m.size?.[0] ?? 4e-7,
                          Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : m.size?.[1] ?? 4e-7,
                        ] as [number, number]
                        updateMonitor(m.id, { size: next })
                      }}
                    />
                  </div>
                </label>

                <label>
                  Sampling mode
                  <select
                    value={m.sampling?.mode ?? 'points'}
                    onChange={(e) => updateMonitor(m.id, { sampling: { ...(m.sampling || {}), mode: e.target.value as any } })}
                  >
                    <option value="plane">Direct plane (backend must support)</option>
                    <option value="points">Grid of point monitors (fallback / approximate)</option>
                  </select>
                </label>

                {m.sampling?.mode === 'points' && (
                  <label>
                    Grid resolution (nx × ny)
                    <div className="row">
                      <input
                        type="number"
                        value={m.sampling?.nx ?? 5}
                        step={1}
                        min={1}
                        onChange={(e) =>
                          updateMonitor(m.id, { sampling: { ...(m.sampling || {}), nx: Math.max(1, Number(e.currentTarget.valueAsNumber || 1)) } })
                        }
                      />
                      <input
                        type="number"
                        value={m.sampling?.ny ?? 5}
                        step={1}
                        min={1}
                        onChange={(e) =>
                          updateMonitor(m.id, { sampling: { ...(m.sampling || {}), ny: Math.max(1, Number(e.currentTarget.valueAsNumber || 1)) } })
                        }
                      />
                    </div>
                  </label>
                )}

                <div className="muted">
                  Note: Not all backends support direct planar sampling. If unsupported, the UI can fall back to a grid of
                  point monitors (preview shown).
                </div>
              </>
            )}
          </div>
        ))}
    </div>
  )
}
