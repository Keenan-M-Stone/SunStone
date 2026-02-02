import React, { useEffect, useState } from 'react'
import { getArtifacts, downloadArtifactUrl } from './sunstoneApi'
import type { ArtifactEntry } from './types'

type Props = {
  runId: string | null
  snapshotEnabled: boolean
  setSnapshotEnabled: (v: boolean) => void
  livePreview: boolean
  setLivePreview: (v: boolean) => void
  previewComponent: 'Ez' | 'Ex' | 'Ey' | 'Hz' | 'Hx' | 'Hy'
  setPreviewComponent: (v: 'Ez' | 'Ex' | 'Ey' | 'Hz' | 'Hx' | 'Hy') => void
  previewPalette: 'viridis' | 'jet' | 'gray' | 'lava'
  setPreviewPalette: (v: 'viridis' | 'jet' | 'gray' | 'lava') => void
  snapshotStride: number
  setSnapshotStride: (v: number) => void
  hideCad: boolean
  setHideCad: (v: boolean) => void
  boundaryPerFace?: boolean
  setBoundaryPerFace?: (v: boolean) => void
}

function paletteColor(name: 'viridis' | 'jet' | 'gray' | 'lava', t: number) {
  const x = Math.max(0, Math.min(1, t))
  if (name === 'gray') {
    const v = Math.round(lerp(0, 255, x))
    return `rgb(${v}, ${v}, ${v})`
  }
  if (name === 'jet') {
    const r = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 3))))
    const g = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 2))))
    const b = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 1))))
    return `rgb(${r}, ${g}, ${b})`
  }
  if (name === 'lava') {
    // simple warm map
    const r = Math.round(lerp(0, 255, x))
    const g = Math.round(lerp(0, 80, x * 0.7))
    const b = Math.round(lerp(0, 30, x * 0.5))
    return `rgb(${r}, ${g}, ${b})`
  }
  // viridis-like stops
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ]
  const scaled = x * (stops.length - 1)
  const idx = Math.floor(scaled)
  const t0 = scaled - idx
  const c0 = stops[idx]
  const c1 = stops[Math.min(idx + 1, stops.length - 1)]
  const r = Math.round(lerp(c0[0], c1[0], t0))
  const g = Math.round(lerp(c0[1], c1[1], t0))
  const b = Math.round(lerp(c0[2], c1[2], t0))
  return `rgb(${r}, ${g}, ${b})`
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// CSV parser that handles quoted fields (simple state machine)
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line: string) {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur.trim())
        cur = ''
        continue
      }
      cur += ch
    }
    out.push(cur.trim())
    return out
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

// Efficient in-place iterative radix-2 FFT implementation
function bitReverseIndices(n: number) {
  const bits = Math.log2(n)
  const rev: number[] = new Array(n)
  for (let i = 0; i < n; i += 1) {
    let x = i
    let y = 0
    for (let b = 0; b < bits; b += 1) {
      y = (y << 1) | (x & 1)
      x >>= 1
    }
    rev[i] = y
  }
  return rev
}

function fftTransform(real: number[], imag: number[]) {
  const n = real.length
  if ((n & (n - 1)) !== 0) throw new Error('fftTransform requires power-of-two length')
  const rev = bitReverseIndices(n)
  for (let i = 0; i < n; i += 1) {
    const j = rev[i]
    if (j > i) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlen_r = Math.cos(ang)
    const wlen_i = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < (len >> 1); j += 1) {
        const u_r = real[i + j]
        const u_i = imag[i + j]
        const v_r = real[i + j + (len >> 1)] * wr - imag[i + j + (len >> 1)] * wi
        const v_i = real[i + j + (len >> 1)] * wi + imag[i + j + (len >> 1)] * wr
        real[i + j] = u_r + v_r
        imag[i + j] = u_i + v_i
        real[i + j + (len >> 1)] = u_r - v_r
        imag[i + j + (len >> 1)] = u_i - v_i
        const nxt_wr = wr * wlen_r - wi * wlen_i
        const nxt_wi = wr * wlen_i + wi * wlen_r
        wr = nxt_wr
        wi = nxt_wi
      }
    }
  }
}

// Replace naive DFT with FFT: returns freqs & mags
function computeFFT(times: number[], values: number[]) {
  const orig_n = values.length
  if (orig_n < 2) return { freqs: [], mags: [] }
  // choose n as power of two <= 1024
  const maxN = 1024
  const n = Math.min(maxN, 1 << Math.floor(Math.log2(orig_n)))
  if (n < 2) return { freqs: [], mags: [] }
  // prepare arrays (take first n samples)
  const re = new Array(n).fill(0)
  const im = new Array(n).fill(0)
  for (let i = 0; i < n; i += 1) re[i] = values[i]
  // run FFT
  try {
    fftTransform(re, im)
  } catch (err) {
    return { freqs: [], mags: [] }
  }
  const dt = (times[times.length - 1] - times[0]) / Math.max(1, times.length - 1)
  const freqs: number[] = []
  const mags: number[] = []
  for (let k = 0; k < n / 2; k += 1) {
    const m = Math.hypot(re[k], im[k]) / n
    freqs.push(k / (n * dt))
    mags.push(m)
  }
  return { freqs, mags }
}

const ResultsPanel: React.FC<Props> = ({
  runId,
  snapshotEnabled,
  setSnapshotEnabled,
  livePreview,
  setLivePreview,
  previewComponent,
  setPreviewComponent,
  previewPalette,
  setPreviewPalette,
  snapshotStride,
  setSnapshotStride,
  hideCad,
  setHideCad,
}) => {
  const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([])
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>(null)
  const [fieldPayload, setFieldPayload] = useState<any | null>(null)

  // Monitor plotting state
  const [monitorCsv, setMonitorCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [monitorComponent, setMonitorComponent] = useState<string | null>(null)
  const [monitorPlotMode, setMonitorPlotMode] = useState<'time' | 'fft'>('time')

  // Plane monitor artifacts (2D slices from planar detectors)
  const planeArtifacts = artifacts.filter((a) => a.path.includes('outputs/monitors/') && a.path.endsWith('_plane_field.json'))
  // Point-grid artifacts generated from expanded plane monitors (e.g., mon1_p0_field.json)
  const pointArtifacts = artifacts.filter((a) => a.path.includes('outputs/monitors/') && /_p\d+_field\.json$/.test(a.path))

  // Quiver/vector options
  const [showQuiver, setShowQuiver] = useState(false)
  const [arrowDensity, setArrowDensity] = useState(8)
  const [arrowScale, setArrowScale] = useState(0.8)

  useEffect(() => {
    let timer: number | null = null
    let mounted = true
    async function poll() {
      if (!runId) return
      try {
        const list = await getArtifacts(runId)
        if (!mounted) return
        setArtifacts(list)
        // if no selection, pick first field artifact if present
        const field = list.find((a) => a.path.endsWith('outputs/fields/field_snapshot.json'))
        if (field && !selectedField) setSelectedField(field.path)
        const mon = list.find((a) => a.path.includes('outputs/monitors/') && a.path.endsWith('.csv'))
        if (mon && !selectedMonitor) setSelectedMonitor(mon.path)
      } catch (err) {
        // ignore
      }
    }
    poll()
    if (livePreview) timer = window.setInterval(poll, 3000)
    return () => { mounted = false; if (timer) window.clearInterval(timer) }
  }, [runId, livePreview])

  useEffect(() => {
    let timer: number | null = null
    let active = true
    async function fetchField() {
      if (!runId || !selectedField) return
      try {
        const res = await fetch(downloadArtifactUrl(runId, selectedField))
        if (!res.ok) return
        const payload = await res.json()
        if (!active) return
        // set field payload for both field snapshots and planar monitor slices
        setFieldPayload(payload)
      } catch (err) {
        // ignore
      }
    }
    fetchField()
    if (livePreview) timer = window.setInterval(fetchField, 3000)

    // Also fetch monitor CSV if a monitor is selected
    async function fetchMonitor() {
      if (!runId || !selectedMonitor) return
      try {
        const res = await fetch(downloadArtifactUrl(runId, selectedMonitor))
        if (!res.ok) return
        const text = await res.text()
        const parsed = parseCSV(text)
        if (!active) return
        setMonitorCsv(parsed)
        // default to first numeric column beyond time
        const numericCols = parsed.headers.slice(1)
        setMonitorComponent(numericCols[0] ?? null)
      } catch (err) {
        // ignore
      }
    }
    fetchMonitor()
    if (livePreview) timer = window.setInterval(() => { fetchField(); fetchMonitor(); }, 3000)
    return () => { active = false; if (timer) window.clearInterval(timer) }
  }, [runId, selectedField, selectedMonitor, livePreview])

  const fieldArtifacts = artifacts.filter((a) => a.path.includes('outputs/fields/') && a.path.endsWith('.json'))
  const monitorArtifacts = artifacts.filter((a) => a.path.includes('outputs/monitors/') && a.path.endsWith('.csv'))

  return (
    <div className="results-panel panel" style={{ padding: 12, marginBottom: 12 }}>
      <h3>Results</h3>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>Snapshot Enabled
          <input type="checkbox" checked={snapshotEnabled} onChange={(e) => setSnapshotEnabled(e.target.checked)} />
        </label>
        <label>Live Preview
          <input type="checkbox" checked={livePreview} onChange={(e) => setLivePreview(e.target.checked)} />
        </label>
        <label>Preview Component
          <select value={previewComponent} onChange={(e) => setPreviewComponent(e.target.value as any)}>
            <option value="Ez">Ez</option>
            <option value="Ex">Ex</option>
            <option value="Ey">Ey</option>
            <option value="Hz">Hz</option>
            <option value="Hx">Hx</option>
            <option value="Hy">Hy</option>
          </select>
        </label>
        <label>Palette
          <select value={previewPalette} onChange={(e) => setPreviewPalette(e.target.value as any)}>
            <option value="viridis">Viridis</option>
            <option value="jet">Jet</option>
            <option value="gray">Gray</option>
            <option value="lava">Lava</option>
          </select>
        </label>
        <label>Stride
          <input type="number" value={snapshotStride} onChange={(e) => setSnapshotStride(Number(e.target.value))} style={{ width: 72 }} />
        </label>
        <label>Hide CAD
          <input type="checkbox" checked={hideCad} onChange={(e) => setHideCad(e.target.checked)} />
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={async () => { if (!runId) return; const list = await getArtifacts(runId); setArtifacts(list) }}>Refresh artifacts</button>
          <button style={{ marginLeft: 8 }} onClick={() => {
            if (!runId) return
            // create notebook and download
            try {
              const base = downloadArtifactUrl(runId, '')
              const meta = { RESULTS_DIR: base.replace(/\/$/, ''), RUN_ID: runId, PROJECT_NAME: (window as any).__projectName || '', BACKEND: (window as any).__backend || '', BACKEND_VERSION: (window as any).__backendVersion || '', APP_COMMIT: (window as any).__appCommit || '', FRAME_RATE: 10, ANIM_LENGTH_S: 10, PALETTE: 'viridis' }
              // dynamic import to keep file small
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const nb = require('./notebook')
              const artifactNames = (artifacts || []).map((a) => a.path.split('/').slice(-1)[0])
              const nbObj = nb.createReportNotebookObject(meta, artifactNames)
              nb.downloadReportNotebook(`run-${runId}-report.ipynb`, nbObj)
            } catch (err) {
              console.error('Failed to generate notebook', err)
              alert('Failed to generate notebook: ' + String(err))
            }
          }}>Export report (notebook)</button>
        </div>
        <style>{`.results-panel .muted { font-size: 12px } .results-panel label { margin-left: 8px; font-size: 12px }`}</style>
      </div>

      <hr />

      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {fieldArtifacts.length === 0 && monitorArtifacts.length === 0 && (
            <div className="muted">No detector artifacts found for this run.</div>
          )}
          {fieldArtifacts.map((a) => (
            <button key={a.path} onClick={() => { setFieldPayload(null); setSelectedField(a.path); setSelectedMonitor(null) }} className={selectedField === a.path ? 'active' : ''}>{a.path.split('/').slice(-1)[0]}</button>
          ))}
          {planeArtifacts.map((a) => {
            const name = a.path.split('/').slice(-1)[0]
            // derive base monitor id like 'mon1' from 'mon1_plane_field.json'
            const base = name.replace('_plane_field.json', '')
            const children = pointArtifacts.filter((p) => p.path.includes(`/outputs/monitors/${base}_p`))
            return (
              <div key={a.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => { setFieldPayload(null); setSelectedField(a.path); setSelectedMonitor(null) }} className={selectedField === a.path ? 'active' : ''}>{name}</button>
                {children.length > 0 && (
                  <select aria-label={`Points for ${base}`} value={selectedField && selectedField.includes(`${base}_p`) ? selectedField : ''} onChange={(e) => { setFieldPayload(null); setSelectedField(e.target.value); setSelectedMonitor(null) }}>
                    <option value="">Points ({children.length})</option>
                    {children.map((c) => (<option key={c.path} value={c.path}>{c.path.split('/').slice(-1)[0]}</option>))}
                  </select>
                )}
              </div>
            )
          })}
          {/* Render any orphan point artifacts not attached to a plane */}
          {pointArtifacts.filter((p) => !planeArtifacts.some((a) => p.path.includes(a.path.split('_plane_field.json')[0]))).map((a) => (
            <button key={a.path} onClick={() => { setFieldPayload(null); setSelectedField(a.path); setSelectedMonitor(null) }} className={selectedField === a.path ? 'active' : ''}>{a.path.split('/').slice(-1)[0]}</button>
          ))}
          {monitorArtifacts.map((a) => (
            <button key={a.path} onClick={() => { setSelectedMonitor(a.path); setSelectedField(null) }} disabled={selectedMonitor === a.path}>{a.path.split('/').slice(-1)[0]}</button>
          ))}
        </div>

        {selectedField && fieldPayload && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <strong>{selectedField.split('/').slice(-1)[0]}</strong>
              <button style={{ marginLeft: 8 }} onClick={() => { if (!runId) return; window.open(downloadArtifactUrl(runId, selectedField), '_blank') }}>Download</button>
              <label style={{ marginLeft: 12 }}>Show vectors
                <input type="checkbox" checked={showQuiver} onChange={(e) => setShowQuiver(e.target.checked)} />
              </label>
              <label style={{ marginLeft: 8 }}>Density
                <input type="range" min={2} max={24} value={arrowDensity} onChange={(e) => setArrowDensity(Number(e.target.value))} />
              </label>
              <label style={{ marginLeft: 8 }}>Scale
                <input type="number" step={0.1} value={arrowScale} onChange={(e) => setArrowScale(Number(e.target.value))} style={{ width: 64 }} />
              </label>
            </div>
            <div style={{ width: '100%', maxWidth: 640, maxHeight: 520, overflow: 'auto', border: '1px solid #222', padding: 8 }}>
              {/* Render grid and optionally vectors */}
              {(() => {
                const w = fieldPayload.width
                const h = fieldPayload.height
                const hasEx = Array.isArray(fieldPayload.Ex) && fieldPayload.Ex.length === w * h
                const hasEy = Array.isArray(fieldPayload.Ey) && fieldPayload.Ey.length === w * h
                const hasHx = Array.isArray(fieldPayload.Hx) && fieldPayload.Hx.length === w * h
                const hasHy = Array.isArray(fieldPayload.Hy) && fieldPayload.Hy.length === w * h
                const scalarData = Array.isArray(fieldPayload.data) ? fieldPayload.data : null
                const min = fieldPayload.min ?? (scalarData ? Math.min(...scalarData) : 0)
                const max = fieldPayload.max ?? (scalarData ? Math.max(...scalarData) : 1)
                const span = Math.max(1e-12, max - min)

                const cells: React.ReactElement[] = []
                if (scalarData) {
                  for (let j = 0; j < h; j += 1) {
                    for (let i = 0; i < w; i += 1) {
                      const idx = j * w + i
                      const v = (scalarData[idx] - min) / span
                      cells.push(<rect key={`r-${i}-${j}`} x={i} y={j} width={1} height={1} fill={paletteColor(previewPalette as any, v)} />)
                    }
                  }
                }

                const arrows: React.ReactElement[] = []
                const vx = hasEx ? fieldPayload.Ex : (hasHx ? fieldPayload.Hx : null)
                const vy = hasEy ? fieldPayload.Ey : (hasHy ? fieldPayload.Hy : null)
                if (showQuiver && vx && vy) {
                  const stepX = Math.max(1, Math.floor(w / arrowDensity))
                  const stepY = Math.max(1, Math.floor(h / arrowDensity))
                  // compute max magnitude for scaling
                  let maxMag = 0
                  for (let j = 0; j < h; j += stepY) {
                    for (let i = 0; i < w; i += stepX) {
                      const idx = j * w + i
                      const mx = vx[idx]
                      const my = vy[idx]
                      const m = Math.hypot(mx, my)
                      if (m > maxMag) maxMag = m
                    }
                  }
                  const scale = (Math.min(1, arrowScale) * Math.min(w, h) * 0.4) / (maxMag || 1)
                  for (let j = 0; j < h; j += stepY) {
                    for (let i = 0; i < w; i += stepX) {
                      const idx = j * w + i
                      const mx = vx[idx]
                      const my = vy[idx]
                      const m = Math.hypot(mx, my)
                      if (m === 0) continue
                      const ex = (mx * scale)
                      const ey = (my * scale)
                      const x1 = i + 0.5
                      const y1 = j + 0.5
                      const x2 = x1 + ex
                      const y2 = y1 + ey
                      arrows.push(
                        <g key={`a-${i}-${j}`}>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={m > 0 ? '#fff' : '#888'} strokeWidth={0.15} strokeLinecap="round" />
                          <circle cx={x2} cy={y2} r={0.25} fill={m > 0 ? '#fff' : '#888'} />
                        </g>
                      )
                    }
                  }
                }

                return (
                  <svg width={Math.min(640, w)} height={Math.min(520, h)} viewBox={`0 0 ${w} ${h}`}>
                    {cells}
                    <g opacity={showQuiver ? 0.9 : 0}>{arrows}</g>
                  </svg>
                )
              })()}
            </div>
          </div>
        )}

        {selectedMonitor && (
          <div>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{selectedMonitor.split('/').slice(-1)[0]}</strong>
              <button style={{ marginLeft: 8 }} onClick={() => { if (!runId) return; window.open(downloadArtifactUrl(runId, selectedMonitor), '_blank') }}>Download</button>
              <label style={{ marginLeft: 12 }}>Plot
                <select value={monitorPlotMode} onChange={(e) => setMonitorPlotMode(e.target.value as any)} style={{ marginLeft: 6 }}>
                  <option value="time">Time series</option>
                  <option value="fft">FFT</option>
                </select>
              </label>
              <label style={{ marginLeft: 8 }}>Component
                <select value={monitorComponent ?? ''} onChange={(e) => setMonitorComponent(e.target.value)} style={{ marginLeft: 6 }}>
                  {(monitorCsv?.headers ?? []).slice(1).map((h) => (<option key={h} value={h}>{h}</option>))}
                </select>
              </label>
            </div>

            <div style={{ width: '100%', maxWidth: 640, maxHeight: 420, overflow: 'auto', border: '1px solid #222', padding: 8 }}>
              {monitorCsv && monitorComponent ? (() => {
                const timeColIdx = 0
                const compIdx = Math.max(0, (monitorCsv.headers.indexOf(monitorComponent)))
                const times = monitorCsv.rows.map(r => Number(r[timeColIdx]))
                const vals = monitorCsv.rows.map(r => Number(r[compIdx]))
                if (monitorPlotMode === 'time') {
                  const w = 600
                  const h = 200
                  const min = Math.min(...vals)
                  const max = Math.max(...vals)
                  const span = Math.max(1e-12, max - min)
                  const path = vals.map((v, i) => {
                    const x = (i / (vals.length - 1)) * w
                    const y = h - ((v - min) / span) * h
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                  }).join(' ')
                  return (
                    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                      <path d={path} stroke="#66d9ef" strokeWidth={1.5} fill="none" />
                    </svg>
                  )
                }
                // FFT
                const { freqs, mags } = computeFFT(times, vals)
                if (freqs.length === 0) return <div className="muted">Not enough samples for FFT</div>
                const w = 600
                const h = 200
                const maxMag = Math.max(...mags)
                const path = mags.map((v, i) => {
                  const x = (i / (mags.length - 1)) * w
                  const y = h - (v / maxMag) * h
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
                }).join(' ')
                return (
                  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                    <path d={path} stroke="#f38ba8" strokeWidth={1.5} fill="none" />
                  </svg>
                )

              })() : (
                <div className="muted">No monitor data yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ResultsPanel
