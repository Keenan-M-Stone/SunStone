
import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import ResultsPanel from './ResultsPanel'
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
  previewPalette: 'viridis'|'jet'|'gray'|'lava';
  setPreviewPalette: (v: 'viridis'|'jet'|'gray'|'lava') => void;
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
  hideCad: boolean;
  setHideCad: (v: boolean) => void;
  // per-face boundaries
  boundaryPerFace: boolean;
  setBoundaryPerFace: (v: boolean) => void;
  boundaryFaces: Record<string, { type: string; thickness?: number }>;
  setBoundaryFaces: (m: Record<string, { type: string; thickness?: number }>) => void;
  specWarnings: string[] | null;
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
  hideCad,
  setHideCad,
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
  boundaryPerFace,
  setBoundaryPerFace,
  boundaryFaces,
  setBoundaryFaces,
  specWarnings,
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
  // Backend log text
  const [logText, setLogText] = useState('');

  // Dispersion viewer state
  const [dispersionData, setDispersionData] = useState<Record<string, any> | null>(null)
  const [selectedDispersion, setSelectedDispersion] = useState<string | null>(null)
  // Tabs: preview (JSON) or graph view
  const [dispersionTab, setDispersionTab] = useState<'preview'|'graph'>('preview')
  // specRef is a prop; reference it to avoid unused warnings
  void specRef;

  const openLog = async () => {
    setLogText('Loading...');
    try {
      const txt = await fetchBackendLog();
      setLogText(txt);
    } catch (e) {
      setLogText('Failed to load backend log: ' + String(e));
    }
  };

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
  void meshFile; // keep reference for uploads; value may be unused until mesh operations are invoked

  useEffect(() => {
    setLocalOptions(backendOptions || {});
  }, [backend, backendOptions]);

  // ensure the prop is referenced to avoid TS unused parameter warning
  void showProperties
  // silence some kept-for-future state vars
  void meshFile;

  // When a run exists, show job-level controls for SSH submissions
  const urlParams = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : new URLSearchParams('')
  const e2eJob = urlParams.get('e2e_job') === '1'
  const showJobControls = Boolean((run && executionMode === 'ssh') || e2eJob)

  const [schemaSelection, setSchemaSelection] = useState<'boundary'|'material'|'source'>('boundary')
  // Run Settings & Inspector popouts
  const [showRunSettings, setShowRunSettings] = useState(false)
  const [showInspector, setShowInspector] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<'logs'|'artifacts'|'spec'>('logs')
  // Editable spec in inspector (local only, not applied to CAD automatically)
  const [editedSpec, setEditedSpec] = useState<string>(specText)
  useEffect(() => setEditedSpec(specText), [specText])
  const [translating, setTranslating] = useState(false)
  void translating;
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


  // Note: server-side translation is performed inline from the Inspector using the editable spec (editedSpec). The old helper was removed to keep translation flows local to the Inspector.

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

      <section className="panel run-panel resizable" style={{ overflow: 'auto', minHeight: 360, maxWidth: '100%', padding: 12 }}>
      <ResultsPanel
        runId={run?.id ?? null}
        snapshotEnabled={snapshotEnabled}
        setSnapshotEnabled={setSnapshotEnabled}
        livePreview={livePreview}
        setLivePreview={setLivePreview}
        previewComponent={previewComponent}
        setPreviewComponent={setPreviewComponent}
        previewPalette={previewPalette}
        setPreviewPalette={setPreviewPalette}
        snapshotStride={snapshotStride}
        setSnapshotStride={setSnapshotStride}
        hideCad={hideCad}
        setHideCad={setHideCad}
        boundaryPerFace={boundaryPerFace}
        setBoundaryPerFace={setBoundaryPerFace}
        boundaryFaces={boundaryFaces}
        setBoundaryFaces={setBoundaryFaces}
      />
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

          {/* Run settings moved to a popout modal to reduce clutter in the main Tools panel */}
          <div className="tool-section" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Run settings</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowRunSettings(true)}>Open Run Settings</button>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>Simulation & backend options are now available in the Run Settings popout.</div>
          </div>

          {/* Backend options moved into Run Settings modal. */}
          {showJobControls && (
            <div style={{ marginTop: 12 }}>
              <JobControls runId={(run && run.id) || (e2eJob ? 'e2e-run' : '')} />
            </div>
          )}



          {/* Dispersion fits viewer - tabbed preview + graph with download */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Dispersion fits</div>
            <div style={{ color: '#9aa6b2', marginBottom: 8 }}>View fitted Drude parameters for this run (if available).</div>
            <div className="row compact" style={{ alignItems: 'center' }}>
              <div style={{ minWidth: 220 }}>
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
              </div>
              <div className="muted">Click to load fitted dispersion parameters</div>
            </div>

            {dispersionData && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 12 }}>

                  {/* Material list */}
                  <div style={{ minWidth: 220 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600 }}>Materials</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div className="muted">Manage materials from the Properties panel.</div>
                        <button onClick={() => setShowProperties(true)}>Manage</button>
                      </div>
                    </div>
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
                                  if (!run?.id) { alert('No run selected'); return }
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
                                  if (!run?.id) { alert('No run selected'); return }
                                  const res = await fetch(`/runs/${encodeURIComponent(run.id)}/dispersion/${encodeURIComponent(selectedDispersion as string)}`)
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
                                  if (!run?.id) { alert('No run selected'); return }
                                  const res = await fetch(`/runs/${encodeURIComponent(run.id)}/dispersion/zip`)
                                  if (!res.ok) { alert('Failed to download zip: ' + res.statusText); return }
                                  const blob = await res.blob()
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = `dispersion_run_${run.id}.zip`
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
          <div style={{ marginTop: 6 }}>
            <button onClick={() => { setShowInspector(true); setInspectorTab('spec') }}>Open Spec / Translation (Inspector)</button>
            <div className="muted" style={{ marginTop: 6 }}>Translation controls moved to the Spec tab in the Inspector popout.</div>
          </div>
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
          <div style={{ marginTop: 8, padding: 8, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Outputs</div>
            {/* Use backend options to persist these output selections */}
            <label>
              <input type="checkbox" checked={Boolean((localOptions as any)?.outputs?.snapshots ?? true)} onChange={(e) => {
                const next = { ...(localOptions as any)?.outputs || {} , snapshots: e.target.checked }
                updateOption('outputs', next)
              }} /> Save snapshots
            </label>
            <label>
              <input type="checkbox" checked={Boolean((localOptions as any)?.outputs?.monitors ?? true)} onChange={(e) => {
                const next = { ...(localOptions as any)?.outputs || {} , monitors: e.target.checked }
                updateOption('outputs', next)
              }} /> Save monitors
            </label>
            <label>
              <input type="checkbox" checked={Boolean((localOptions as any)?.outputs?.dispersion ?? false)} onChange={(e) => {
                const next = { ...(localOptions as any)?.outputs || {} , dispersion: e.target.checked }
                updateOption('outputs', next)
              }} /> Save dispersion fits
            </label>
            <label>
              Output path
              <input type="text" value={((localOptions as any)?.outputs?.path) ?? ''} onChange={(e) => {
                const next = { ...(localOptions as any)?.outputs || {} , path: e.target.value }
                updateOption('outputs', next)
              }} />
            </label>
            <label>
              <input type="checkbox" checked={Boolean((localOptions as any)?.outputs?.auto_movie ?? false)} onChange={(e) => {
                const next = { ...(localOptions as any)?.outputs || {} , auto_movie: e.target.checked }
                updateOption('outputs', next)
              }} /> Auto-create movie (use Movie settings)
            </label>
          </div>
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={() => { setShowInspector(true); setInspectorTab('logs') }}>Open Inspector (Logs / Artifacts / Spec)</button>
        <div className="muted">Open Inspector to view and manage logs, artifacts and edit/translate the spec.</div>
      </div>

      {/* Run Settings popout */}
      {showRunSettings && (
        <div style={{ position: 'fixed', left: 40, right: 40, top: 40, bottom: 40, zIndex: 1200, background: 'rgba(10,10,12,0.98)', padding: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Run Settings</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={() => setShowRunSettings(false)}>Close</button>
            </div>
          </div>          {specWarnings && specWarnings.length > 0 && (
            <div style={{ marginTop: 8, padding: 8, border: '1px solid #9a3', background: '#1b2a1b', color: '#dfe7df', borderRadius: 6 }}>
              <div style={{ fontWeight: 700 }}>Spec Warnings</div>
              {specWarnings.map((w, i) => <div key={i} style={{ marginTop: 4 }}>{w}</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <h4>Simulation settings</h4>
              <label>
                <input type="checkbox" checked={boundaryPerFace} onChange={(e) => setBoundaryPerFace(e.target.checked)} /> Per-face boundary settings
              </label>

              {!boundaryPerFace ? (
                <>
                  <label>Boundary condition
                    <select value={boundaryType} onChange={e => setBoundaryType(e.target.value as any)}>
                      {(backendCapabilities?.boundary_types || ['pml']).map((b: string) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                  {boundaryType === 'pml' && (
                    <div className="row three-cols" style={{ marginTop: 8 }}>
                      <div className="field"><label>PML X
                        <input type="number" value={pml[0]} onChange={e => setPml([Number(e.target.value) || 0, pml[1], pml[2]])} />
                      </label></div>
                      <div className="field"><label>PML Y
                        <input type="number" value={pml[1]} onChange={e => setPml([pml[0], Number(e.target.value) || 0, pml[2]])} />
                      </label></div>
                      <div className="field"><label>PML Z
                        <input type="number" value={pml[2]} onChange={e => setPml([pml[0], pml[1], Number(e.target.value) || 0])} />
                      </label></div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {['px','nx','py','ny','pz','nz'].map((face) => (
                      <div key={face} style={{ padding: 8, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{face.toUpperCase()}</div>
                        <div>
                          <select value={(boundaryFaces as any)[face]?.type ?? (backendCapabilities?.boundary_types?.[0] ?? 'pml')} onChange={(e) => {
                            const next = { ...(boundaryFaces || {}) }
                            next[face] = { ...(next[face] || {}), type: e.target.value }
                            setBoundaryFaces(next)
                          }}>
                            {(backendCapabilities?.boundary_types || ['pml']).map((b: string) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        {(boundaryFaces as any)[face]?.type === 'pml' && (
                          <div style={{ marginTop: 6 }}>
                            <label>Thickness
                              <input type="number" step="0.01" value={Number((boundaryFaces as any)[face]?.thickness ?? 0)} onChange={(e) => {
                                const v = Number(e.target.value) || 0
                                const next = { ...(boundaryFaces || {}) }
                                next[face] = { ...(next[face] || {}), thickness: v }
                                setBoundaryFaces(next)
                              }} />
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <button onClick={() => setShowProperties(true)}>Edit materials</button>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 320 }}>
              <h4>Backend options</h4>
              {backendCapabilities?.capabilities ? (
                <div className="row two-cols">
                  {Object.entries(backendCapabilities.capabilities).map(([k, schema]) => {
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
                  })}
                </div>
              ) : (
                <div className="muted">No dynamic options</div>
              )}

              <div style={{ marginTop: 8 }}>
                <button onClick={() => savePreset()}>Save preset</button>
                <button onClick={() => loadPreset()} style={{ marginLeft: 8 }}>Load preset</button>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600 }}>Advanced backend schema</div>
                <div style={{ marginTop: 6 }}>
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
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inspector popout (Logs | Artifacts | Spec) */}
      {showInspector && (
        <div style={{ position: 'fixed', left: 40, right: 40, top: 40, bottom: 40, zIndex: 1200, background: 'rgba(10,10,12,0.98)', padding: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Inspector</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className={inspectorTab === 'logs' ? 'primary' : ''} onClick={() => setInspectorTab('logs')}>Logs</button>
              <button className={inspectorTab === 'artifacts' ? 'primary' : ''} onClick={() => setInspectorTab('artifacts')}>Artifacts</button>
              <button className={inspectorTab === 'spec' ? 'primary' : ''} onClick={() => setInspectorTab('spec')}>Spec</button>
              <button onClick={() => setShowInspector(false)}>Close</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {inspectorTab === 'logs' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Run logs</div>
                  <textarea value={logs} readOnly style={{ width: '100%', height: '60vh' }} />
                  <div style={{ marginTop: 8 }}><button onClick={onRefreshLogs}>Refresh run logs</button></div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Backend logs</div>
                  <textarea value={logText} readOnly style={{ width: '100%', height: '60vh' }} />
                  <div style={{ marginTop: 8 }}><button onClick={openLog}>Refresh backend log</button></div>
                </div>
              </div>
            )}

            {inspectorTab === 'artifacts' && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Artifacts</div>
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
                            <img src={downloadArtifactUrl(run?.id || '', a.path)} alt={name} style={{ maxWidth: 220, maxHeight: 180, marginTop: 8, borderRadius: 6, border: '1px solid #333' }} />
                          )}
                          {isText && (
                            <iframe src={downloadArtifactUrl(run?.id || '', a.path)} title={name} style={{ width: 420, height: 160, marginTop: 8, borderRadius: 6, border: '1px solid #333', background: '#181818' }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 8 }}><button onClick={onRefreshArtifacts}>Refresh Artifacts</button></div>
                </div>
              </div>
            )}

            {inspectorTab === 'spec' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Spec (editable)</div>
                  <div className="muted">Edits here will not be applied to CAD canvas automatically; use with caution.</div>
                  <textarea value={editedSpec} onChange={(e) => setEditedSpec(e.target.value)} style={{ width: '100%', height: '60vh', marginTop: 8 }} />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button onClick={async () => {
                      try {
                        const s = JSON.parse(editedSpec || '{}')
                        setTranslating(true)
                        const res = await fetch(`/backends/${encodeURIComponent(backend)}/translate`, {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify(s),
                        })
                        setTranslating(false)
                        if (!res.ok) { alert('Server translation failed'); return }
                        const data = await res.json()
                        const translated = data?.translated
                        const out = typeof translated === 'string' ? translated : JSON.stringify(translated, null, 2)
                        if (setTranslationForBackend) { setTranslationForBackend(out) } else { (window as any).__rp_trans_out = out }
                        alert('Server translation complete.')
                      } catch (e) { setTranslating(false); alert('Spec is invalid JSON') }
                    }}>Translate (server)</button>
                    <button onClick={() => {
                      try {
                        const t = (window as any).__rp_trans_target || '';
                        if (!t) return alert('Select a translation target at the top-right of this panel');
                        const specObj = JSON.parse(editedSpec || '{}');
                        import('./translators').then(m => {
                          let out = '';
                          if (t === 'opal') out = m.translateToOpal(specObj);
                          if (t === 'ceviche') out = m.translateToCeviche(specObj);
                          if (t === 'scuffem') out = m.translateToScuffem(specObj);
                          if (t === 'pygdm') out = m.translateToPyGDM(specObj);
                          (window as any).__rp_trans_out = out;
                          alert('Client-side translation complete.');
                        });
                      } catch (e) { alert('Spec is invalid JSON') }
                    }}>Translate (client)</button>
                    <button onClick={() => { navigator.clipboard.writeText(editedSpec || ''); alert('Copied to clipboard'); }}>Copy spec</button>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>Translated / Backend Preview</div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <select value={(window as any).__rp_trans_target || ''} onChange={e => { (window as any).__rp_trans_target = e.target.value }}>
                        <option value="">(none)</option>
                        <option value="opal">Opal</option>
                        <option value="ceviche">Ceviche</option>
                        <option value="scuffem">Scuff-EM</option>
                        <option value="pygdm">pyGDM</option>
                      </select>
                      <button onClick={() => { setInspectorTab('spec'); }}>Refresh</button>
                    </div>
                  </div>
                  <textarea value={(window as any).__rp_trans_out || ''} readOnly style={{ width: '100%', height: '60vh', background: '#0f0f0f', color: '#e8e8e8', marginTop: 8 }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
