import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { vi, describe, it, expect } from 'vitest'

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
  showProperties: false,
  setShowProperties: () => {},
  hideCad: false,
  setHideCad: () => {},  boundaryPerFace: false,
  setBoundaryPerFace: () => {},
  boundaryFaces: { px: { type: 'pml', thickness: 0 }, nx: { type: 'pml', thickness: 0 }, py: { type: 'pml', thickness: 0 }, ny: { type: 'pml', thickness: 0 }, pz: { type: 'pml', thickness: 0 }, nz: { type: 'pml', thickness: 0 } },
  setBoundaryFaces: () => {},
  specWarnings: null,}

describe('RunPanel Outputs UI', () => {
  it('toggles outputs and writes backend options', async () => {
    const setBackendOptions = vi.fn()
    const props = { ...baseProps, setBackendOptions, backendOptions: {} }
    render(<RunPanel {...props} />)

    // Find outputs controls
    expect(screen.getByText('Outputs')).toBeInTheDocument()
    const snapshotsCheckbox = screen.getByLabelText(/Save snapshots/i) as HTMLInputElement
    expect(snapshotsCheckbox.checked).toBe(true)

    // toggle snapshots
    await userEvent.click(snapshotsCheckbox)
    expect(setBackendOptions).toHaveBeenCalled()
    const called = setBackendOptions.mock.calls[setBackendOptions.mock.calls.length - 1][0]
    expect(called.outputs).toBeDefined()
    expect(called.outputs.snapshots).toBe(false)

    // toggle monitors
    const monitorsCheckbox = screen.getByLabelText(/Save monitors/i) as HTMLInputElement
    await userEvent.click(monitorsCheckbox)
    const called2 = setBackendOptions.mock.calls[setBackendOptions.mock.calls.length - 1][0]
    expect(called2.outputs.monitors).toBe(false)
  })
})
