import { SourcePropertiesDialog } from './SourcePropertiesDialog'

export default function SourcePropertiesPanel(props: {
  selectedId: string | null
  selectedType: any
  dimension: any

  sources: any[]
  updateSource: (id: string, patch: any) => void
  setSources: (next: any) => void

  waveforms: any[]
  setWaveforms: (next: any) => void

  showSourceDialog: boolean
  setShowSourceDialog: (v: boolean) => void
}) {
  const {
    selectedId,
    selectedType,
    dimension,
    sources,
    updateSource,
    setSources,
    waveforms,
    setWaveforms,
    showSourceDialog,
    setShowSourceDialog,
  } = props

  if (!selectedId || selectedType !== 'source') return null

  return (
    <div className="editor">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Source Properties</h3>
        <button onClick={() => setShowSourceDialog(true)} disabled={!selectedId || selectedType !== 'source'}>
          Advanced…
        </button>
      </div>

      {sources
        .filter((s) => s.id === selectedId)
        .map((s) => (
          <div key={s.id} className="fields">
            <label>
              Source type
              <input value={s.type ?? 'gaussian_pulse'} onChange={(e) => updateSource(s.id, { type: e.target.value })} />
            </label>

            <label>
              Component
              <select value={s.component} onChange={(e) => updateSource(s.id, { component: e.target.value })}>
                <option value="Ex">Ex</option>
                <option value="Ey">Ey</option>
                <option value="Ez">Ez</option>
              </select>
            </label>

            <label>
              Position (x, y)
              <div className="row">
                <input
                  type="number"
                  value={s.position[0]}
                  step="1e-8"
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    updateSource(s.id, {
                      position: [Number.isFinite(v) ? v : s.position[0], s.position[1]],
                    })
                  }}
                />
                <input
                  type="number"
                  value={s.position[1]}
                  step="1e-8"
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    updateSource(s.id, {
                      position: [s.position[0], Number.isFinite(v) ? v : s.position[1]],
                    })
                  }}
                />
              </div>
            </label>

            <label>
              Orientation (deg)
              <input
                type="number"
                value={((s.orientation ?? 0) * 180) / Math.PI}
                step="1"
                onChange={(e) => {
                  const deg = e.currentTarget.valueAsNumber
                  const rad = Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0
                  updateSource(s.id, { orientation: rad })
                }}
              />
            </label>

            {dimension === '3d' && (
              <label>
                Position (z)
                <input
                  type="number"
                  value={s.z}
                  step="1e-8"
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    updateSource(s.id, { z: Number.isFinite(v) ? v : s.z })
                  }}
                />
              </label>
            )}

            <label>
              Center frequency (Hz)
              <input
                type="number"
                value={s.centerFreq}
                step="1e12"
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber
                  updateSource(s.id, { centerFreq: Number.isFinite(v) ? v : s.centerFreq })
                }}
              />
            </label>

            <label>
              Fwidth (Hz)
              <input
                type="number"
                value={s.fwidth}
                step="1e12"
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber
                  updateSource(s.id, { fwidth: Number.isFinite(v) ? v : s.fwidth })
                }}
              />
            </label>

            <label>
              Waveform
              <select value={s.waveformId ?? ''} onChange={(e) => updateSource(s.id, { waveformId: e.target.value || undefined })}>
                <option value="">(default)</option>
                {waveforms.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            {showSourceDialog && (
              <SourcePropertiesDialog
                open={showSourceDialog}
                source={s}
                dimensionMode={dimension}
                waveforms={waveforms}
                onUpsertWaveform={(wf) => {
                  setWaveforms((prev: any[]) => {
                    const idx = prev.findIndex((w) => w.id === wf.id)
                    if (idx >= 0) {
                      const next = [...prev]
                      next[idx] = wf
                      return next
                    }
                    return [...prev, wf]
                  })
                }}
                onDeleteWaveform={(waveformId) => {
                  setWaveforms((prev: any[]) => prev.filter((w) => w.id !== waveformId))
                }}
                onChangeSource={(next) => {
                  setSources((prev: any[]) => prev.map((src) => (src.id === next.id ? next : src)))
                }}
                onClose={() => setShowSourceDialog(false)}
              />
            )}
          </div>
        ))}
    </div>
  )
}
