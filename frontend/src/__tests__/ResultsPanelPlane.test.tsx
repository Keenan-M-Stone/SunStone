import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { vi, describe, it, beforeEach, expect } from 'vitest'

vi.mock('../sunstoneApi', async () => {
  return {
    getArtifacts: vi.fn(async (_runId: string) => {
      return [
        { path: 'outputs/monitors/mon1_plane_field.json', size_bytes: 2048, mtime: Date.now() },
      ]
    }),
    downloadArtifactUrl: vi.fn((runId: string, path: string) => `http://localhost:8000/runs/${runId}/artifacts/${encodeURIComponent(path)}`),
  }
})

// Import the mocked module so tests can override implementations per-case
import * as sunstoneApi from '../sunstoneApi'
const globalAny: any = global

import ResultsPanel from '../ResultsPanel'

describe('ResultsPanel plane monitors', () => {
  beforeEach(() => {
    globalAny.fetch = vi.fn((url: string) => {
      if (url.endsWith('mon1_plane_field.json')) {
        const w = 8, h = 8
        const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos(i/6))
        const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/6))
        const Ez = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/4))
        return Promise.resolve({ ok: true, json: async () => ({ width: w, height: h, Ex, Ey, Ez, data: Ez, min: Math.min(...Ez), max: Math.max(...Ez) }) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })
  })

  it('renders planar monitor slice and vectors', async () => {
    render(<ResultsPanel runId={'r1'} snapshotEnabled={true} setSnapshotEnabled={() => {}} livePreview={true} setLivePreview={() => {}} previewComponent={'Ez'} setPreviewComponent={() => {}} previewPalette={'viridis'} setPreviewPalette={() => {}} snapshotStride={4} setSnapshotStride={() => {}} hideCad={false} setHideCad={() => {}} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /mon1_plane_field.json/ })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /mon1_plane_field.json/ }))

    // Ensure rendering of grid
    await waitFor(() => expect(document.querySelector('.results-panel svg rect')).toBeInTheDocument())

    // enable quiver
    await userEvent.click(screen.getByLabelText(/Show vectors/))
    await waitFor(() => expect(document.querySelector('.results-panel svg line')).toBeInTheDocument())
  })

  it('renders point-grid monitor slice and vectors', async () => {
    // override getArtifacts to return point artifacts
    (sunstoneApi as any).getArtifacts.mockImplementation(async () => [
      { path: 'outputs/monitors/mon1_p0_field.json', size_bytes: 512, mtime: Date.now() },
      { path: 'outputs/monitors/mon1_p1_field.json', size_bytes: 512, mtime: Date.now() }
    ])

    globalAny.fetch = vi.fn((url: string) => {
      if (url.endsWith('mon1_p0_field.json') || url.endsWith('mon1_p1_field.json')) {
        const w = 4, h = 4
        const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos(i/6))
        const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/6))
        const Ez = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/4))
        return Promise.resolve({ ok: true, json: async () => ({ width: w, height: h, Ex, Ey, Ez, data: Ez, min: Math.min(...Ez), max: Math.max(...Ez) }) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    render(<ResultsPanel runId={'r1'} snapshotEnabled={true} setSnapshotEnabled={() => {}} livePreview={true} setLivePreview={() => {}} previewComponent={'Ez'} setPreviewComponent={() => {}} previewPalette={'viridis'} setPreviewPalette={() => {}} snapshotStride={4} setSnapshotStride={() => {}} hideCad={false} setHideCad={() => {}} />)

    // Try grouped UI first: select the point child from the points select if present
    const maybeCombo = screen.queryByRole('combobox', { name: /Points for mon1/i })
    if (maybeCombo) {
      const sel = maybeCombo as HTMLSelectElement
      // pick the first option (mon1_p0_field.json)
      await userEvent.selectOptions(sel, screen.getByRole('option', { name: /mon1_p0_field.json/ }))
    } else {
      // Fallback: orphan point artifacts are rendered as buttons
      await waitFor(() => expect(screen.getByRole('button', { name: /mon1_p0_field.json/ })).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /mon1_p0_field.json/ }))
    }

    await waitFor(() => expect(document.querySelector('.results-panel svg rect')).toBeInTheDocument())

    // enable quiver
    await userEvent.click(screen.getByLabelText(/Show vectors/))
    await waitFor(() => expect(document.querySelector('.results-panel svg line')).toBeInTheDocument())

  })
})
