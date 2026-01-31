import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../sunstoneApi', async () => {
  return {
    getArtifacts: vi.fn(async (_runId: string) => {
      return [
        { path: 'outputs/fields/field_snapshot.json', size_bytes: 123, mtime: Date.now() },
        { path: 'outputs/monitors/mon1.csv', size_bytes: 64, mtime: Date.now() },
      ]
    }),
    downloadArtifactUrl: vi.fn((runId: string, path: string) => `http://localhost:8000/runs/${runId}/artifacts/${encodeURIComponent(path)}`),
  }
})

// Mock fetch globally for artifact downloads
const globalAny: any = global

import ResultsPanel from '../ResultsPanel'

describe('ResultsPanel', () => {
  beforeEach(() => {
    // reset global.fetch mock
    globalAny.fetch = vi.fn((url: string) => {
      if (url.endsWith('field_snapshot.json')) {
        const w = 8, h = 8
        const data = new Array(w * h).fill(0).map((_, i) => Math.sin(i / 4))
        const Ex = new Array(w * h).fill(0).map((_, i) => Math.cos(i / 6))
        const Ey = new Array(w * h).fill(0).map((_, i) => Math.sin(i / 6))
        return Promise.resolve({ ok: true, json: async () => ({ width: w, height: h, data, Ex, Ey, min: Math.min(...data), max: Math.max(...data) }) })
      }
      if (url.endsWith('mon1.csv')) {
        const csv = 't,value\n0,0\n1e-15,1\n2e-15,0.5\n3e-15,0.2\n4e-15,0.1'
        return Promise.resolve({ ok: true, text: async () => csv })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })
  })

  it('renders snapshot grid and quiver arrows', async () => {
    render(<ResultsPanel runId={'r1'} snapshotEnabled={true} setSnapshotEnabled={() => {}} livePreview={true} setLivePreview={() => {}} previewComponent={'Ez'} setPreviewComponent={() => {}} previewPalette={'viridis'} setPreviewPalette={() => {}} snapshotStride={4} setSnapshotStride={() => {}} hideCad={false} setHideCad={() => {}} />)

    // Wait for field buttons to appear
    await waitFor(() => expect(screen.getByRole('button', { name: /field_snapshot.json/ })).toBeInTheDocument())

    // Click the artifact button to load
    await userEvent.click(screen.getByRole('button', { name: /field_snapshot.json/ }))

    // Query for an SVG rect directly
    await waitFor(() => expect(document.querySelector('.results-panel svg rect')).toBeInTheDocument())

    // Enable vectors
    await userEvent.click(screen.getByLabelText(/Show vectors/))
    // Expect at least one line element for arrows
    await waitFor(() => expect(document.querySelector('.results-panel svg line')).toBeInTheDocument())
  })

  it('plots monitor CSV time series and FFT', async () => {
    render(<ResultsPanel runId={'r1'} snapshotEnabled={true} setSnapshotEnabled={() => {}} livePreview={true} setLivePreview={() => {}} previewComponent={'Ez'} setPreviewComponent={() => {}} previewPalette={'viridis'} setPreviewPalette={() => {}} snapshotStride={4} setSnapshotStride={() => {}} hideCad={false} setHideCad={() => {}} />)

    // Click monitor button
    await waitFor(() => expect(screen.getByRole('button', { name: /mon1.csv/ })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /mon1.csv/ }))

    // Ensure time-series plot path is present
    await waitFor(() => expect(document.querySelector('.results-panel svg path')).toBeInTheDocument())

    // Switch to FFT mode in the monitor controls
    const plotSelect = screen.getByLabelText(/Plot/) as HTMLElement
    // plotSelect may be the label or the select; if it's the label, find the select inside
    const select = plotSelect.tagName === 'SELECT' ? (plotSelect as HTMLSelectElement) : plotSelect.querySelector('select') as HTMLSelectElement
    await userEvent.selectOptions(select, 'fft')

    // FFT rendering should replace the path (still a path present)
    await waitFor(() => expect(document.querySelector('.results-panel svg path')).toBeInTheDocument())
  })
})