
import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import { SSHOptions, JobControls } from './RunPanelExtras'
import SchemaForm from './SchemaForm'
// ...other necessary imports (copy from App.tsx)


// Helper to fetch backend logs
async function fetchBackendLog(): Promise<string> {
  const resp = await fetch('/api/logs/backend');
  if (!resp.ok) return 'Log file not found or not accessible.';
  return await resp.text();
}

// TODO: Copy all run/simulation state, logic, and UI from App.tsx here.
// This includes: run creation, backend selection, run settings, spec preview, logs, artifacts, and the Meep 2D compatibility logic.
// Export as a functional component:


import type { ArtifactEntry, ProjectRecord, RunRecord } from './types';

interface RunPanelProps {
    setBackend: (v: string) => void;
  run: RunRecord | null;
  backend: string;
  backendOptions: Record<string, any> | null;
  setBackendOptions: (opts: Record<string, any>) => void;
  backendCapabilities?: Record<string, any> | null;
  setTranslationForBackend?: (txt: string | null) => void;
  translationPreview?: string;
  busy: string | null;
  error: string | null;
  project: ProjectRecord | null;
  onCreateRun: () => void;
  onSubmitRun: () => void;
  onCancelRun: () => void;
  meepPythonExecutable: string;
  setMeepPythonExecutable: (v: string) => void;
  executionMode: 'local'|'ssh'|'slurm';
  setExecutionMode: (v: 'local'|'ssh'|'slurm') => void;
  sshTarget: string;
  setSshTarget: (v: string) => void;
  sshOptions: Record<string, any> | null;
  setSshOptions: (opts: Record<string, any>) => void;
  remotePythonExecutable: string;
  setRemotePythonExecutable: (v: string) => void;
  previewComponent: 'Ez'|'Ex'|'Ey'|'Hz'|'Hx'|'Hy';
  setPreviewComponent: (v: 'Ez'|'Ex'|'Ey'|'Hz'|'Hx'|'Hy') => void;
  previewPalette: 'viridis'|'jet'|'gray';
  setPreviewPalette: (v: 'viridis'|'jet'|'gray') => void;
  snapshotEnabled: boolean;
  setSnapshotEnabled: (v: boolean) => void;
  livePreview: boolean;
  setLivePreview: (v: boolean) => void;
  snapshotStride: number;
  setSnapshotStride: (v: number) => void;
  movieDt: number;
  setMovieDt: (v: number) => void;
  movieStart: number;
  setMovieStart: (v: number) => void;
  movieStop: number;
  setMovieStop: (v: number) => void;
  movieStride: number;
  setMovieStride: (v: number) => void;
  movieMaxFrames: number;
  setMovieMaxFrames: (v: number) => void;
  specText: string;
  specRef: React.RefObject<HTMLTextAreaElement | null>;
  logs: string;
  onRefreshLogs: () => void;
  artifacts: ArtifactEntry[];
  onRefreshArtifacts: () => void;
  downloadArtifactUrl: (runId: string, path: string) => string;
  pml: [number, number, number];
  setPml: (v: [number, number, number]) => void;
  boundaryType: 'pml'|'pec'|'periodic'|'symmetry'|'impedance';
  setBoundaryType: (v: 'pml'|'pec'|'periodic'|'symmetry'|'impedance') => void;
  showProperties: boolean;
  setShowProperties: (v: boolean) => void;
}


const BACKEND_OPTIONS = [
  { value: 'dummy', label: 'Dummy Backend' },
  { value: 'meep', label: 'Meep (FDTD)' },
  { value: 'opal', label: 'Opal (BEM / Eigenmode)' },
  { value: 'ceviche', label: 'Ceviche (Spectral solver)' },
  { value: 'scuffem', label: 'Scuff-EM (BEM)' },
  { value: 'pygdm', label: 'pyGDM (Green dyadic method)' },
];

const RunPanel: React.FC<RunPanelProps> = ({
  run,
  backend,
  setBackend,
  backendOptions,
  setBackendOptions,
  backendCapabilities,
  setTranslationForBackend,
  executionMode,
  setExecutionMode,
  sshTarget,
  setSshTarget,
  sshOptions,
  setSshOptions,
  remotePythonExecutable,
  setRemotePythonExecutable,
  busy,
  error,
  project,
  onCreateRun,
  onSubmitRun,
  onCancelRun,
  meepPythonExecutable,
  setMeepPythonExecutable,
  previewComponent,
  setPreviewComponent,
  previewPalette,
  setPreviewPalette,
  snapshotEnabled,
  setSnapshotEnabled,
  livePreview,
  setLivePreview,
  snapshotStride,
  setSnapshotStride,
  movieDt,
  pml,
  setPml,
  boundaryType,
  setBoundaryType,
  showProperties,
  setShowProperties,
  setMovieDt,
  movieStart,
  setMovieStart,
  movieStop,
  setMovieStop,
  movieStride,
  setMovieStride,
  movieMaxFrames,
  setMovieMaxFrames,
  specText,
  specRef,
  logs,
  onRefreshLogs,
  artifacts,
  onRefreshArtifacts,
  downloadArtifactUrl,
}) => {
  // Backend log modal state (must be inside component)
  const [showLog, setShowLog] = useState(false);
  const [logText, setLogText] = useState('');

  // Dispersion viewer state
  const [dispersionData, setDispersionData] = useState<Record<string, any> | null>(null)
  const [selectedDispersion, setSelectedDispersion] = useState<string | null>(null)

  const openLog = async () => {
    setShowLog(true);
    setLogText('Loading...');
    setLogText(await fetchBackendLog());
  };
  const closeLog = () => setShowLog(false);
  // Meep Python Executable: auto-trim and venv resolution
  const handleMeepPythonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.trim();
    // If a venv path is provided, try to resolve to bin/python
    if (val && !val.endsWith('python') && val.includes('venv')) {
      val = val.replace(/\/+$/, '') + '/bin/python';
    }
    setMeepPythonExecutable(val);
  };

  // Local editable options for this backend
  const [localOptions, setLocalOptions] = useState<Record<string, any>>(backendOptions || {});
  const [meshFile, setMeshFile] = useState<File | null>(null)
  const [meshDensity, setMeshDensity] = useState<number>(1)
  const [meshPreviewText, setMeshPreviewText] = useState<string>('')

  useEffect(() => {
    setLocalOptions(backendOptions || {});
  }, [backend, backendOptions]);

  // ensure the prop is referenced to avoid TS unused parameter warning
  void showProperties

  // When a run exists, show job-level controls for SSH submissions
  const urlParams = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : new URLSearchParams('')
  const e2eJob = urlParams.get('e2e_job') === '1'
  const showJobControls = Boolean((run && executionMode === 'ssh') || e2eJob)

  const [showSchemaModal, setShowSchemaModal] = useState(false)
  const [schemaSelection, setSchemaSelection] = useState<'boundary'|'material'|'source'>('boundary')
  // Update option and notify parent
  const updateOption = (key: string, value: any) => {
    const next = { ...(localOptions || {}), [key]: value };
    setLocalOptions(next);
    setBackendOptions(next);
  };

  // Preset save/load for this backend (localStorage)
  const savePreset = (name = 'default') => {
    try {
      const key = `sunstone_backend_preset_${backend}_${name}`
      localStorage.setItem(key, JSON.stringify(localOptions || {}))
      alert('Preset saved')
    } catch (e) { alert('Failed to save preset') }
  }
  const loadPreset = (name = 'default') => {
    try {
      const key = `sunstone_backend_preset_${backend}_${name}`
      const raw = localStorage.getItem(key)
      if (!raw) { alert('No preset found'); return }
      const obj = JSON.parse(raw)
      setLocalOptions(obj)
      setBackendOptions(obj)
    } catch (e) { alert('Failed to load preset') }
  }

  // Ask the frontend translator (if available) to produce a translated preview
  const [translating, setTranslating] = useState(false)

  const handleTranslate = async () => {
    setTranslating(true)
    try {
      const spec = JSON.parse(specText || '{}')
      // Try server-side translation first
      try {
        // If a mesh file is provided, use the multipart endpoint
        if (meshFile) {
          const fd = new FormData()
          fd.append('spec', JSON.stringify(spec))
          fd.append('mesh', meshFile)
          const res = await fetch(`/backends/${encodeURIComponent(backend)}/translate-multipart`, {
            method: 'POST',
            body: fd,
          })
          if (res.ok) {
            const data = await res.json()
            const translated = data?.translated
            const out = typeof translated === 'string' ? translated : JSON.stringify(translated, null, 2)
            if (setTranslationForBackend) setTranslationForBackend(out)
            else (window as any).__rp_trans_out = out
            if (data?.warnings?.length) {
              alert('Translation complete with warnings: ' + data.warnings.join('; '))
            } else {
              alert('Server translation (with mesh) produced. Switch the Resolution preview to "Translated preview" to view it.')
            }
            setTranslating(false)
            return
          }
        }

        const res = await fetch(`/backends/${encodeURIComponent(backend)}/translate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(spec),
        })
        if (res.ok) {
          const data = await res.json()
          const translated = data?.translated
          const out = typeof translated === 'string' ? translated : JSON.stringify(translated, null, 2)
          if (setTranslationForBackend) setTranslationForBackend(out)
          else (window as any).__rp_trans_out = out
          alert('Server translation produced. Switch the Resolution preview to "Translated preview" to view it.')
          setTranslating(false)
          return
        }
      } catch (e) {
        // ignore and fall back to client-side
      }

      // Fallback to client-side translators
      const t = backend
      const mod = await import('./translators')
      let out = ''
      if (t === 'ceviche' && mod.translateToCeviche) out = mod.translateToCeviche(spec)
      else if (t === 'opal' && mod.translateToOpal) out = mod.translateToOpal(spec)
      else if (t === 'scuffem' && mod.translateToScuffem) out = mod.translateToScuffem(spec)
      else if (t === 'pygdm' && mod.translateToPyGDM) out = mod.translateToPyGDM(spec)
      else out = '# No client-side translator available for this backend.'
      if (setTranslationForBackend) setTranslationForBackend(out)
      else (window as any).__rp_trans_out = out
      alert('Translation preview produced. Switch the Resolution preview to "Translated preview" to view it.')
    } catch (e) {
      alert('Failed to translate spec: ' + String(e))
    } finally {
      setTranslating(false)
    }
  }

  // Simple inline Dispersion plot component
  function DispersionPlot({ params }: { params: any }) {
    // params: { eps_inf, wp, gamma }
    const w = 360, h = 160, pad = 24
    const freqs = Array.from({ length: 120 }).map((_, i) => 2e14 + (i * 4e14) / 119)
    const omegas = freqs.map(f => 2 * Math.PI * f)
    const eps_vals = omegas.map(omega => {
      const eps_inf = Number(params?.eps_inf ?? 1.0)
      const wp = Number(params?.wp ?? 0)
      const gamma = Number(params?.gamma ?? 1e12)
      const A = omega * omega
      const B = gamma * omega
      const denom_mag2 = A * A + B * B
      const re = eps_inf - (wp * wp) * (A / denom_mag2)
      const im = (wp * wp) * (B / denom_mag2)
      return { re, im }
    })
    const re_vals = eps_vals.map(v => v.re)
    const im_vals = eps_vals.map(v => v.im)
    const minY = Math.min(...re_vals, ...im_vals)
    const maxY = Math.max(...re_vals, ...im_vals)
    const scaleY = (v: number) => pad + (h - 2 * pad) * (1 - (v - minY) / (maxY - minY || 1))
    const scaleX = (i: number) => pad + (w - 2 * pad) * (i / (freqs.length - 1))

    const linePath = (arr: number[]) => arr.map((v, i) => `${i===0?'M':'L'} ${scaleX(i)} ${scaleY(v)}`).join(' ')

    // Hover tooltip state
    const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)

    return (
      <div style={{ position: 'relative' }}>
        <svg width={w} height={h} style={{ background: '#080809', borderRadius: 6, display: 'block' }} onMouseMove={(ev) => {
          const rect = (ev.target as SVGElement).getBoundingClientRect()
          const x = ev.clientX - rect.left
          // find closest index
          const i = Math.round(((x - pad) / (w - 2 * pad)) * (freqs.length - 1))
          if (i >= 0 && i < freqs.length) setHoverIdx(i)
        }} onMouseLeave={() => setHoverIdx(null)}>
          <rect x={0} y={0} width={w} height={h} fill="#080809" rx={6} />
          <path d={linePath(re_vals)} stroke="#66d9ef" strokeWidth={1.5} fill="none" />
          <path d={linePath(im_vals)} stroke="#f38ba8" strokeWidth={1.5} fill="none" />
          <text x={pad} y={12} fill="#9aa6b2" style={{ fontSize: 11 }}>Real (teal) / Imag (pink) vs frequency</text>
          {hoverIdx !== null && (
            <g>
              <line x1={scaleX(hoverIdx)} y1={pad} x2={scaleX(hoverIdx)} y2={h - pad} stroke="#445566" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={scaleX(hoverIdx)} cy={scaleY(re_vals[hoverIdx])} r={3} fill="#66d9ef" />
              <circle cx={scaleX(hoverIdx)} cy={scaleY(im_vals[hoverIdx])} r={3} fill="#f38ba8" />
            </g>
          )}
        </svg>
        {hoverIdx !== null && (
          <div style={{ position: 'absolute', left: scaleX(hoverIdx) + 8, top: 8, background: '#0b0b10', color: '#e6eef6', padding: 6, borderRadius: 6, fontSize: 12, border: '1px solid #2b2b2b' }}>
            <div><strong>f:</strong> {(freqs[hoverIdx]).toExponential(3)} Hz</div>
            <div><strong>Re:</strong> {re_vals[hoverIdx].toFixed(4)}</div>
            <div><strong>Im:</strong> {im_vals[hoverIdx].toFixed(4)}</div>
          </div>
        )}
      </div>
    )
  }

  // Use native CSS resize behavior for vertical resizing (see .resizable in App.css)
  // This keeps behavior consistent with the CAD panel and simplifies the component.

  return (
    <div style={{ position: 'relative', maxWidth: '100%' }}>
      {/* Backend log modal */}
      {showLog && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={closeLog}>
          <div style={{ background: '#181818', color: '#eee', padding: 24, borderRadius: 8, minWidth: 480, maxWidth: '80vw', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3>Backend Log</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: '#222', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>{logText}</pre>
            <button onClick={closeLog} style={{ marginTop: 12 }}>Close</button>
          </div>
        </div>
      )}
      <section className="panel run-panel resizable" style={{ overflow: 'auto', minHeight: 360, maxWidth: '100%', padding: 12 }}>
      <Dashboard runId={run?.id ?? null} />
      <hr />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <label>Backend
            <select value={backend} onChange={e => {
              setMeepPythonExecutable('');
              setBackend(e.target.value);
            }}>
              {BACKEND_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>Execution Mode
            <select value={executionMode} onChange={e => setExecutionMode(e.target.value as any)}>
              <option value="local">Local</option>
              <option value="ssh">SSH</option>
              <option value="slurm">SLURM</option>
            </select>
          </label>
          {executionMode === 'ssh' && (
            <>
              <label>SSH Target
                <input value={sshTarget} onChange={e => setSshTarget(e.target.value)} placeholder="user@host" />
              </label>

              {/* SSH advanced options */}
              <div style={{ marginTop: 8 }}>
                <SSHOptions sshOptions={sshOptions} setSshOptions={setSshOptions} />
              </div>
            </>
          )}
          {executionMode !== 'local' && (
            <label>Remote Python Executable
              <input value={remotePythonExecutable} onChange={e => setRemotePythonExecutable(e.target.value)} placeholder="/path/to/python on target" />
            </label>
          )}
          {backend === 'meep' && (
            <label>Meep Python Executable
              <input value={meepPythonExecutable} onChange={handleMeepPythonChange} placeholder="/path/to/venv or python" />
            </label>
          )}

          {/* Simulation settings (boundary, PML, quick access to material editor) */}
          <div className="tool-section" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Simulation settings</div>
            <label>Boundary condition
              <select value={boundaryType} onChange={e => setBoundaryType(e.target.value as any)}>
                {(backendCapabilities?.boundary_types || ['pml']).map((b: string) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            {boundaryType === 'pml' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column' }}>PML X
                  <input type="number" value={pml[0]} onChange={e => setPml([Number(e.target.value) || 0, pml[1], pml[2]])} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column' }}>PML Y
                  <input type="number" value={pml[1]} onChange={e => setPml([pml[0], Number(e.target.value) || 0, pml[2]])} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column' }}>PML Z
                  <input type="number" value={pml[2]} onChange={e => setPml([pml[0], pml[1], Number(e.target.value) || 0])} />
                </label>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowProperties(true)}>Edit materials</button>
            </div>
          </div>

          {/* Backend options dynamic sub-panel */}
          {((backendCapabilities && Object.keys(backendCapabilities.capabilities || {}).length > 0) || backend === 'meep') && (
            <div className="tool-section" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Backend options</div>
              {backendCapabilities?.capabilities ? (
                Object.entries(backendCapabilities.capabilities).map(([k, schema]) => {
                  const s: any = schema
                  const val = (localOptions && localOptions[k] !== undefined) ? localOptions[k] : s.default
                  return (
                    <div key={k} style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block' }}>{s.label || k}
                        {s.type === 'enum' && (
                          <select value={val} onChange={e => updateOption(k, e.target.value)}>
                            {s.values.map((v: any) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        )}
                        {s.type === 'number' && (
                          <input type="number" value={val} step={s.step || 1} min={s.min} max={s.max} onChange={e => updateOption(k, Number(e.target.value))} />
                        )}
                        {s.type === 'range' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            {(s.fields || []).map((f: string) => (
                              <input key={f} type="number" value={(localOptions && localOptions[k] && localOptions[k][f]) || ''} placeholder={f} onChange={e => updateOption(k, { ...((localOptions && localOptions[k]) || {}), [f]: e.target.value })} />
                            ))}
                          </div>
                        )}
                        {s.type === 'file' && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="file" accept={(s.accept || []).join(',')} onChange={e => {
                              const f = e.target.files?.[0] || null
                              if (f) {
                                setLocalOptions((prev) => ({ ...(prev||{}), [k]: f.name }))
                                // keep file separate for upload
                                setMeshFile(f)
                                setBackendOptions({ ...(backendOptions || {}), [k]: f.name })
                              }
                            }} />
                            {localOptions && localOptions[k] && <span style={{ color: '#cfcfcf' }}>{localOptions[k]}</span>}
                          </div>
                        )}
                      </label>
                    </div>
                  )
                })
              ) : (
                <div className="muted">No dynamic options</div>
              )}

              {backendCapabilities?.supports_translation && (
                <div style={{ marginTop: 8 }}>
                  <button onClick={handleTranslate} disabled={translating}>{translating ? 'Translating...' : 'Translate spec (preview)'}</button>
                </div>
              )}

              {/* Mesh generation controls */}
              {backendCapabilities?.capabilities && (backendCapabilities.capabilities.mesh_file) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #333' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Mesh generation</div>
                  <label>Target density
                    <input type="number" min={0.1} max={10} step={0.1} defaultValue={1} onChange={e => setMeshDensity(Number(e.target.value))} />
                  </label>
                  <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={async () => {
                      // estimate triangle count
                      try {
                        const spec = JSON.parse(specText || '{}')
                        const polys = (await import('./mesh/meshGen')).samplePolygonsFromSpec(spec, meshDensity || 1)
                        const est = (await import('./mesh/meshGen')).estimateTriangleCount(polys, meshDensity || 1)
                        alert(`Estimated triangles: ${est}`)
                      } catch (e) { alert('Estimate failed: ' + String(e)) }
                    }}>Estimate triangles</button>
                    <button onClick={async () => {
                      // generate client-side mesh
                      try {
                        const spec = JSON.parse(specText || '{}')
                        const polys = (await import('./mesh/meshGen')).samplePolygonsFromSpec(spec, meshDensity || 1)
                        let triangles: Array<any> = []
                        for (const p of polys) {
                          const t = (await import('./mesh/meshGen')).triangulatePolygon(p)
                          triangles = triangles.concat(t)
                        }
                        const obj = (await import('./mesh/meshGen')).exportOBJ(triangles)
                        const triCount = triangles.length
                        setLocalOptions((prev) => ({ ...(prev || {}), generated_mesh: 'generated.obj', generated_triangles: triCount }))
                        const blob = new Blob([obj], { type: 'text/plain' })
                        const f = new File([blob], 'generated.obj', { type: 'text/plain' })
                        setMeshFile(f)
                        setMeshPreviewText(obj)
                        alert(`Generated mesh: ${triCount} triangles`)
                      } catch (e) { alert('Mesh generation failed: ' + String(e)) }
                    }}>Generate mesh</button>
                    <button onClick={() => {
                      // download current mesh preview
                      if (!meshPreviewText) { alert('No mesh generated yet') ; return }
                      const url = URL.createObjectURL(new Blob([meshPreviewText]))
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'mesh_preview.obj'
                      a.click()
                      URL.revokeObjectURL(url)
                    }}>Download mesh</button>
                    <button onClick={async () => {
                      // use mesh (auto-translate with mesh)
                      if (!meshFile) { alert('No mesh available to use; generate or upload one first') ; return }
                      try {
                        const spec = JSON.parse(specText || '{}')
                        const fd = new FormData()
                        fd.append('spec', JSON.stringify(spec))
                        fd.append('mesh', meshFile as File)
                        const res = await fetch(`/backends/${encodeURIComponent(backend)}/translate-multipart`, { method: 'POST', body: fd })
                        if (!res.ok) { alert('Server translation failed'); return }
                        const data = await res.json()
                        const translated = data?.translated
                        const out = typeof translated === 'string' ? translated : JSON.stringify(translated, null, 2)
                        if (setTranslationForBackend) setTranslationForBackend(out)
                        setTranslationForBackend && setTranslationForBackend(out)
                        alert('Server translation with mesh complete. Switch Resolution preview to view it.')
                      } catch (e) { alert('Failed to use mesh: ' + String(e)) }
                    }}>Use mesh for translation</button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <button onClick={() => savePreset()}>Save preset</button>
                <button onClick={() => loadPreset()} style={{ marginLeft: 8 }}>Load preset</button>
              </div>
            </div>
          )}
          {showJobControls && (
            <div style={{ marginTop: 12 }}>
              <JobControls runId={(run && run.id) || (e2eJob ? 'e2e-run' : '')} />
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <button onClick={() => setShowSchemaModal(true)}>Advanced backend schema</button>
          </div>

          {showSchemaModal && (
            <div style={{ position: 'fixed', left:0, top:0, right:0, bottom:0, zIndex:1200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 640, maxHeight: '80vh', overflow: 'auto', background: '#0f0f10', padding: 12 }}>
                <h3>Backend schema viewer</h3>
                <label>Schema
                  <select value={schemaSelection} onChange={e => setSchemaSelection(e.target.value as any)}>
                    <option value="boundary">boundary</option>
                    <option value="material">material</option>
                    <option value="source">source</option>
                  </select>
                </label>
                <div style={{ marginTop: 8 }}>
                  <SchemaForm schemaPath={schemaSelection} value={{}} onChange={() => {}} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowSchemaModal(false)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Dispersion fits viewer - tabbed preview + graph with download */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Dispersion fits</div>
            <div style={{ color: '#9aa6b2', marginBottom: 8 }}>View fitted Drude parameters for this run (if available).</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={async () => {
                if (!run || !run.id) { alert('No run selected'); return }
                try {
                  const res = await fetch(`/runs/${encodeURIComponent(run.id)}/dispersion`)
                  if (!res.ok) { alert('No dispersion artifacts found for this run'); return }
                  const data = await res.json()
                  setDispersionData(data)
                  setSelectedDispersion(Object.keys(data)[0] || null)
                } catch (e) { alert('Failed to fetch dispersion: ' + String(e)) }
              }}>Load dispersion</button>
              <div className="muted">Click to load fitted dispersion parameters</div>
            </div>

            {dispersionData && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 12 }}>

                  {/* Material list */}
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 600 }}>Materials</div>
                    {Object.keys(dispersionData).length === 0 ? <div className="muted">No fitted materials</div> : (
                      <div style={{ marginTop: 8 }}>
                        {Object.keys(dispersionData).map(mid => (
                          <div key={mid} style={{ padding: 6, borderRadius: 6, background: mid === selectedDispersion ? 'rgba(255,255,255,0.02)' : 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ cursor: 'pointer' }} onClick={() => setSelectedDispersion(mid)}>
                              <div style={{ fontWeight: 700 }}>{mid}</div>
                              <div className="muted">{`eps_inf=${Number(dispersionData[mid].eps_inf).toFixed(2)}`}</div>
                            </div>
                            <div>
                              <button onClick={async (e) => {
                                e.stopPropagation()
                                try {
                                  const res = await fetch(`/runs/${encodeURIComponent(run.id)}/dispersion/${encodeURIComponent(mid)}`)
                                  if (!res.ok) { alert('Failed to fetch artifact'); return }
                                  const data = await res.json()
                                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = `${mid}-dispersion.json`
                                  a.click()
                                  URL.revokeObjectURL(url)
                                } catch (e) { alert('Failed to download dispersion: ' + String(e)) }
                              }}>Download</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right-hand tabbed area: Preview / Graph */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button onClick={() => setDispersionTab('preview')} disabled={dispersionTab === 'preview'}>Preview</button>
                      <button onClick={() => setDispersionTab('graph')} disabled={dispersionTab === 'graph'}>Graph</button>
                    </div>

                    {selectedDispersion ? (
                      <div>
                        {dispersionTab === 'preview' ? (
                          <div>
                            <div style={{ fontWeight: 700 }}>{selectedDispersion}</div>
                            <pre style={{ whiteSpace: 'pre-wrap', background: '#0b0b10', padding: 8 }}>{JSON.stringify(dispersionData[selectedDispersion], null, 2)}</pre>
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                              <button onClick={async () => {
                                try {
                                  const res = await fetch(`/runs/${encodeURIComponent(run!.id)}/dispersion/${encodeURIComponent(selectedDispersion as string)}`)
                                  if (!res.ok) { alert('Failed to fetch artifact'); return }
                                  const data = await res.json()
                                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = `${selectedDispersion}-dispersion.json`
                                  a.click()
                                  URL.revokeObjectURL(url)
                                } catch (e) { alert('Failed to download dispersion: ' + String(e)) }
                              }}>Download JSON</button>

                              <button onClick={async () => {
                                // Download all dispersion artifacts as zip
                                try {
                                  const res = await fetch(`/runs/${encodeURIComponent(run!.id)}/dispersion/zip`)
                                  if (!res.ok) { alert('Failed to download zip: ' + res.statusText); return }
                                  const blob = await res.blob()
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = `dispersion_run_${run!.id}.zip`
                                  a.click()
                                  URL.revokeObjectURL(url)
                                } catch (e) { alert('Failed to download zip: ' + String(e)) }
                              }}>Download all</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <DispersionPlot params={dispersionData[selectedDispersion]} />
                          </div>
                        )}
                      </div>
                    ) : <div className="muted">Select a material to view</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ minWidth: 220, flex: 1 }}>
          <label>Preview Component
            <select value={previewComponent} onChange={e => setPreviewComponent(e.target.value as any)}>
              <option value="Ez">Ez</option>
              <option value="Ex">Ex</option>
              <option value="Ey">Ey</option>
              <option value="Hz">Hz</option>
              <option value="Hx">Hx</option>
              <option value="Hy">Hy</option>
            </select>
          </label>
          <label>Preview Palette
            <select value={previewPalette} onChange={e => setPreviewPalette(e.target.value as any)}>
              <option value="viridis">Viridis</option>
              <option value="jet">Jet</option>
              <option value="gray">Gray</option>
            </select>
          </label>
          <label>Translation Target
            <select value={(window as any).__rp_trans_target || ''} onChange={e => { (window as any).__rp_trans_target = e.target.value }}>
              <option value="">(none)</option>
              <option value="opal">Opal</option>
              <option value="ceviche">Ceviche</option>
              <option value="scuffem">Scuff-EM</option>
              <option value="pygdm">pyGDM</option>
            </select>
            <button onClick={() => {
              const t = (window as any).__rp_trans_target || '';
              if (!t) return alert('Select a translation target');
              try {
                const spec = JSON.parse(specText || '{}');
                // Import translators lazily to keep bundle size small
                import('./translators').then(m => {
                  let out = '';
                  if (t === 'opal') out = m.translateToOpal(spec);
                  if (t === 'ceviche') out = m.translateToCeviche(spec);
                  if (t === 'scuffem') out = m.translateToScuffem(spec);
                  if (t === 'pygdm') out = m.translateToPyGDM(spec);
                  (window as any).__rp_trans_out = out;
                  alert('Translation complete. Scroll to Spec Preview to view.');
                });
              } catch (err) {
                alert('Spec is invalid JSON');
              }
            }} style={{ marginLeft: 8 }}>Translate Spec</button>
          </label>
        </div>
        <div style={{ minWidth: 220, flex: 1 }}>
          <label>Snapshot Enabled
            <input type="checkbox" checked={snapshotEnabled} onChange={e => setSnapshotEnabled(e.target.checked)} />
          </label>
          <label>Live Preview
            <input type="checkbox" checked={livePreview} onChange={e => setLivePreview(e.target.checked)} />
          </label>
        </div>
      </div>
      <hr />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180, flex: 1 }}>
          <label>Snapshot Stride
            <input type="number" value={snapshotStride} onChange={e => setSnapshotStride(Number(e.target.value))} />
          </label>
          <label>Movie dt
            <input type="number" value={movieDt} onChange={e => setMovieDt(Number(e.target.value))} />
          </label>
        </div>
        <div style={{ minWidth: 180, flex: 1 }}>
          <label>Movie Start
            <input type="number" value={movieStart} onChange={e => setMovieStart(Number(e.target.value))} />
          </label>
          <label>Movie Stop
            <input type="number" value={movieStop} onChange={e => setMovieStop(Number(e.target.value))} />
          </label>
        </div>
        <div style={{ minWidth: 180, flex: 1 }}>
          <label>Movie Stride
            <input type="number" value={movieStride} onChange={e => setMovieStride(Number(e.target.value))} />
          </label>
          <label>Movie Max Frames
            <input type="number" value={movieMaxFrames} onChange={e => setMovieMaxFrames(Number(e.target.value))} />
          </label>
        </div>
      </div>
      <hr />
      <div className="row compact" style={{ gap: 12 }}>
        <button
          onClick={onCreateRun}
          disabled={
            !!busy || !project ||
            (backend === 'meep' && !meepPythonExecutable)
          }
        >
          Create Run
        </button>
        <button
          className="primary"
          onClick={onSubmitRun}
          disabled={!!busy || !run}
        >
          Submit Run
        </button>
        <button
          onClick={onCancelRun}
          disabled={
            !!busy || !run ||
            (run?.status !== 'submitted' && run?.status !== 'running')
          }
        >
          Cancel Run
        </button>
      </div>
      <hr />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <label>Spec Preview
            <textarea ref={specRef} value={specText} readOnly style={{ width: '100%', minHeight: 80 }} />
          </label>
          <label style={{ marginTop: 8 }}>Translated / Backend Preview
            <textarea value={(window as any).__rp_trans_out || ''} readOnly style={{ width: '100%', minHeight: 80, background: '#0f0f0f', color: '#e8e8e8' }} />
          </label>
        </div>
        <div style={{ minWidth: 220, flex: 1 }}>
          <label>Logs
            <textarea value={logs} readOnly style={{ width: '100%', minHeight: 80 }} />
            <button onClick={onRefreshLogs}>Refresh Logs</button>
          </label>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
        <label>Artifacts</label>
        <button onClick={openLog} style={{ fontSize: 14, padding: '2px 10px', background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 5 }}>View Backend Log</button>
        <div className="artifacts" style={{ fontSize: 15, gap: 14 }}>
          {artifacts.length === 0 && <div className="muted">No artifacts yet.</div>}
          {artifacts.map(a => {
            const name = a.path.split('/').pop() || a.path;
            const ext = name.split('.').pop()?.toLowerCase() || '';
            const isImage = ['png','jpg','jpeg','gif','bmp','webp'].includes(ext);
            const isText = ['txt','log','json','csv','md'].includes(ext);
            return (
              <div className="artifact list-item" key={a.path} style={{ fontSize: 15, padding: '12px 10px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <a href={downloadArtifactUrl(run?.id || '', a.path)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: 16, color: '#e0e0e0', wordBreak: 'break-all' }}>{name}</a>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{(a.size_bytes/1024).toFixed(1)} KB</span>
                  {isImage && (
                    <img src={downloadArtifactUrl(run?.id || '', a.path)} alt={name} style={{ maxWidth: 180, maxHeight: 120, marginTop: 8, borderRadius: 6, border: '1px solid #333' }} />
                  )}
                  {isText && (
                    <iframe src={downloadArtifactUrl(run?.id || '', a.path)} title={name} style={{ width: 220, height: 80, marginTop: 8, borderRadius: 6, border: '1px solid #333', background: '#181818' }} />
                  )}
                </div>
              </div>
            );
          })}
          <button style={{marginTop:8}} onClick={onRefreshArtifacts}>Refresh Artifacts</button>
        </div>
      </div>
      {/* Immediate error feedback for failed runs */}
      {(error || run?.status === 'failed') && (
        <div className="error" style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          {error || 'Run failed. Check logs for details.'}
        </div>
      )}
      {busy && <div className="busy">{busy}</div>}

      </section>
    </div>
  );
};

export default RunPanel;
