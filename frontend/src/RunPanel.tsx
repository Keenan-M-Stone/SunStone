
import React, { useState, useRef, useEffect } from 'react';
import Dashboard from './Dashboard';
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
  busy: string | null;
  error: string | null;
  project: ProjectRecord | null;
  onCreateRun: () => void;
  onSubmitRun: () => void;
  onCancelRun: () => void;
  meepPythonExecutable: string;
  setMeepPythonExecutable: (v: string) => void;
  previewComponent: string;
  setPreviewComponent: (v: string) => void;
  previewPalette: string;
  setPreviewPalette: (v: string) => void;
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
  specRef: React.RefObject<HTMLTextAreaElement>;
  logs: string;
  onRefreshLogs: () => void;
  artifacts: ArtifactEntry[];
  onRefreshArtifacts: () => void;
  downloadArtifactUrl: (artifact: ArtifactEntry) => string;
}


const BACKEND_OPTIONS = [
  { value: 'dummy', label: 'Dummy Backend' },
  { value: 'meep', label: 'Meep (FDTD)' },
];

const RunPanel: React.FC<RunPanelProps> = ({
  run,
  backend,
  setBackend,
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

  // Resizable vertical panel
  const [panelHeight, setPanelHeight] = useState(420);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Mouse event handlers for resizing
  const onDragStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    document.body.style.cursor = 'ns-resize';
  };
  const onDrag = (e: MouseEvent) => {
    if (!isDragging.current || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const newHeight = Math.max(300, e.clientY - rect.top); // min 300px
    setPanelHeight(newHeight);
  };
  const onDragEnd = () => {
    isDragging.current = false;
    document.body.style.cursor = '';
  };
  React.useEffect(() => {
    const move = (e: MouseEvent) => onDrag(e);
    const up = () => onDragEnd();
    if (isDragging.current) {
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isDragging.current]);

  return (
    <div ref={panelRef} style={{ position: 'relative', height: panelHeight, maxWidth: '100%' }}>
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
      <section className="panel run-panel" style={{ overflow: 'auto', height: '100%', maxWidth: '100%' }}>
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
          {backend === 'meep' && (
            <label>Meep Python Executable
              <input value={meepPythonExecutable} onChange={handleMeepPythonChange} placeholder="/path/to/venv or python" />
            </label>
          )}
        </div>
        <div style={{ minWidth: 220, flex: 1 }}>
          <label>Preview Component
            <select value={previewComponent} onChange={e => setPreviewComponent(e.target.value)}>
              <option value="Ez">Ez</option>
              <option value="Ex">Ex</option>
              <option value="Ey">Ey</option>
              <option value="Hz">Hz</option>
              <option value="Hx">Hx</option>
              <option value="Hy">Hy</option>
            </select>
          </label>
          <label>Preview Palette
            <select value={previewPalette} onChange={e => setPreviewPalette(e.target.value)}>
              <option value="viridis">Viridis</option>
              <option value="jet">Jet</option>
              <option value="gray">Gray</option>
            </select>
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
                  <a href={downloadArtifactUrl(a)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: 16, color: '#e0e0e0', wordBreak: 'break-all' }}>{name}</a>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{(a.size_bytes/1024).toFixed(1)} KB</span>
                  {isImage && (
                    <img src={downloadArtifactUrl(a)} alt={name} style={{ maxWidth: 180, maxHeight: 120, marginTop: 8, borderRadius: 6, border: '1px solid #333' }} />
                  )}
                  {isText && (
                    <iframe src={downloadArtifactUrl(a)} title={name} style={{ width: 220, height: 80, marginTop: 8, borderRadius: 6, border: '1px solid #333', background: '#181818' }} />
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
        {/* Drag handle for resizing */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 8,
            cursor: 'ns-resize',
            background: 'rgba(80,80,80,0.18)',
            zIndex: 10,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 8,
          }}
          onMouseDown={onDragStart}
          title="Drag to resize vertically"
        />
      </section>
    </div>
  );
};

export default RunPanel;
