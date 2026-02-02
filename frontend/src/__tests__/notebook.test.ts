import { describe, it, expect } from 'vitest'
import { createReportNotebookObject } from '../notebook'

describe('createReportNotebookObject', () => {
  it('injects metadata into the first code cell', () => {
    const meta = { RESULTS_DIR: 'http://localhost:8000/runs/r1/artifacts', RUN_ID: 'r1', PROJECT_NAME: 'demo', BACKEND: 'meep', BACKEND_VERSION: '1.2', APP_COMMIT: 'abcd1234', FRAME_RATE: 12, ANIM_LENGTH_S: 10, PALETTE: 'viridis' }
    const nb = createReportNotebookObject(meta)
    expect(nb.cells[0].source[0]).toContain("RESULTS_DIR = \"http://localhost:8000/runs/r1/artifacts\"")
    expect(nb.cells[0].source[0]).toContain('RUN_ID = \"r1\"')
    expect(nb.cells[0].source[0]).toContain('FRAME_RATE = 12')
  })

  it('embeds representative GIF and references point-grid artifacts when provided', () => {
    const meta = { RESULTS_DIR: '/tmp/results', RUN_ID: 'r1' }
    const artifacts = ['mon1_p0_field.json', 'mon1_p1_field.json', 'mon2_plane_field.json']
    const nb = createReportNotebookObject(meta, artifacts)
    // find markdown cell that includes inline GIF
    const md = nb.cells.find((c: any) => c.cell_type === 'markdown' && c.source.join('').includes('data:image/gif;base64'))
    expect(md).toBeDefined()
    const mdSrc = md.source.join('')
    expect(mdSrc).toContain('data:image/gif;base64')
    // find code cell that references representative artifacts
    const code = nb.cells.find((c: any) => c.cell_type === 'code' && c.source.join('').includes('Representative artifacts'))
    expect(code).toBeDefined()
    const codeSrc = code.source.join('')
    expect(codeSrc).toContain('mon1_p0_field.json')
    expect(codeSrc).toContain("point_grid_sample.gif")
  })
})