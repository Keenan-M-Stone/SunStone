
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'
import RunPanel from '../RunPanel'

const baseProps: any = {
  run: null,
  backend: 'meep',
  setBackend: () => {},
  backendOptions: {},
  setBackendOptions: () => {},
  backendCapabilities: null,
  setTranslationForBackend: () => {},
  executionMode: 'local',
  setExecutionMode: () => {},
  sshTarget: '',
  setSshTarget: () => {},
  sshOptions: null,
  setSshOptions: () => {},
  remotePythonExecutable: '',
  setRemotePythonExecutable: () => {},
  busy: null,
  error: null,
  project: null,
  onCreateRun: () => {},
  onSubmitRun: () => {},
  onCancelRun: () => {},
  meepPythonExecutable: '',
  setMeepPythonExecutable: () => {},
  previewComponent: 'Ez',
  setPreviewComponent: () => {},
  previewPalette: 'viridis',
  setPreviewPalette: () => {},
  snapshotEnabled: true,
  setSnapshotEnabled: () => {},
  livePreview: false,
  setLivePreview: () => {},
  snapshotStride: 4,
  setSnapshotStride: () => {},
  movieDt: 1,
  setMovieDt: () => {},
  movieStart: 0,
  setMovieStart: () => {},
  movieStop: 1,
  setMovieStop: () => {},
  movieStride: 1,
  setMovieStride: () => {},
  movieMaxFrames: 100,
  setMovieMaxFrames: () => {},
  specText: '',
  specRef: { current: null },
  logs: '',
  onRefreshLogs: () => {},
  artifacts: [],
  onRefreshArtifacts: () => {},
  downloadArtifactUrl: () => '',
  pml: [0,0,0],
  setPml: () => {},
  boundaryType: 'pml',
  setBoundaryType: () => {},
  boundaryPerFace: false,
  setBoundaryPerFace: () => {},
  boundaryFaces: { px: { type: 'pml', thickness: 0 }, nx: { type: 'pml', thickness: 0 }, py: { type: 'pml', thickness: 0 }, ny: { type: 'pml', thickness: 0 }, pz: { type: 'pml', thickness: 0 }, nz: { type: 'pml', thickness: 0 } },
  setBoundaryFaces: () => {},
  showProperties: false,
  setShowProperties: () => {},
  hideCad: false,
  setHideCad: () => {},
  specWarnings: null,
}

describe('Spec Warnings', () => {
  it('displays warnings in Run Settings popout', async () => {
    const props = { ...baseProps, specWarnings: ['Per-face boundary present but backend may not honor it'] }
    render(<RunPanel {...props} />)

    await screen.findByText(/Open Run Settings/i)
    // open settings
    const btn = screen.getByText(/Open Run Settings/i)
    btn.click()

    // spec warning should be visible
    expect(await screen.findByText(/Spec Warnings/)).toBeInTheDocument()
    expect(screen.getByText(/Per-face boundary present/)).toBeInTheDocument()
  })
})
