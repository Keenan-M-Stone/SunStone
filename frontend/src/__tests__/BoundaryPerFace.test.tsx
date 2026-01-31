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
  backendCapabilities: { boundary_types: ['pml','pec','periodic'], per_face_boundary: true },
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
  boundaryPerFace: true,
  setBoundaryPerFace: () => {},
  boundaryFaces: { px: { type: 'pml', thickness: 0 }, nx: { type: 'pml', thickness: 0 }, py: { type: 'pml', thickness: 0 }, ny: { type: 'pml', thickness: 0 }, pz: { type: 'pml', thickness: 0 }, nz: { type: 'pml', thickness: 0 } },
  setBoundaryFaces: () => {},
  showProperties: false,
  setShowProperties: () => {},
  hideCad: false,
  setHideCad: () => {},
  specWarnings: null,
}

describe('Per-face boundary UI', () => {
  it('renders per-face controls and updates faces', async () => {
    const setBoundaryFaces = vi.fn()
    const props = { ...baseProps, setBoundaryFaces }
    render(<RunPanel {...props} />)

    // Open Run Settings
    await userEvent.click(screen.getByText(/Open Run Settings/i))

    // Toggle per-face (already true in props) — the control should be checked
    const perFaceCheckbox = screen.getByLabelText(/Per-face boundary settings/i) as HTMLInputElement
    expect(perFaceCheckbox.checked).toBe(true)

    // Find the PX face selector and change it
    const pxLabel = screen.getByText('PX')
    expect(pxLabel).toBeInTheDocument()
    const pxContainer = pxLabel.parentElement
    expect(pxContainer).toBeTruthy()
    const pxSelect = pxContainer!.querySelector('select') as HTMLSelectElement
    expect(pxSelect).toBeTruthy()
    await userEvent.selectOptions(pxSelect, 'pec')
    expect(setBoundaryFaces).toHaveBeenCalled()
  })
})
