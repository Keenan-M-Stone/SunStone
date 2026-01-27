import React, { useState, useRef } from 'react';
import Dashboard from './Dashboard';
// ...other necessary imports (copy from App.tsx)

// TODO: Copy all run/simulation state, logic, and UI from App.tsx here.
// This includes: run creation, backend selection, run settings, spec preview, logs, artifacts, and the Meep 2D compatibility logic.
// Export as a functional component:


import type { ArtifactEntry, ProjectRecord, RunRecord } from './types';

interface RunPanelProps {
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
  // Meep Python Executable: auto-trim and venv resolution
  const handleMeepPythonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.trim();
    // If a venv path is provided, try to resolve to bin/python
    if (val && !val.endsWith('python') && val.includes('venv')) {
      val = val.replace(/\/+$/, '') + '/bin/python';
    }
    setMeepPythonExecutable(val);
  };

  return (
    <section className="panel run-panel" style={{ overflow: 'auto', maxHeight: 420, maxWidth: '100%' }}>
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
        <button onClick={onCreateRun}>Create Run</button>
        <button onClick={onSubmitRun}>Submit Run</button>
        <button onClick={onCancelRun}>Cancel Run</button>
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
        <div style={{ minWidth: 220, flex: 1 }}>
          <label>Artifacts
            <ul>
              {artifacts.map(a => (
                <li key={a.id}>
                  <a href={downloadArtifactUrl(a)} target="_blank" rel="noopener noreferrer">{a.name}</a>
                </li>
              ))}
            </ul>
            <button onClick={onRefreshArtifacts}>Refresh Artifacts</button>
          </label>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {busy && <div className="busy">{busy}</div>}
    </section>
  );
};

export default RunPanel;
