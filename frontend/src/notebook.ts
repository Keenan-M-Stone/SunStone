import template from './notebook_template.json'

export type ReportMetadata = {
  RESULTS_DIR?: string
  RUN_ID?: string
  PROJECT_NAME?: string
  BACKEND?: string
  BACKEND_VERSION?: string
  APP_COMMIT?: string
  FRAME_RATE?: number
  ANIM_LENGTH_S?: number
  PALETTE?: string
}

export function createReportNotebookObject(meta: ReportMetadata = {}, artifacts: string[] = []) {
  // deep clone template
  const nb = JSON.parse(JSON.stringify(template))
  const placeholders = {
    RESULTS_DIR: meta.RESULTS_DIR ?? '',
    RUN_ID: meta.RUN_ID ?? '',
    PROJECT_NAME: meta.PROJECT_NAME ?? '',
    BACKEND: meta.BACKEND ?? '',
    BACKEND_VERSION: meta.BACKEND_VERSION ?? '',
    APP_COMMIT: meta.APP_COMMIT ?? '',
    FRAME_RATE: meta.FRAME_RATE ?? 10,
    ANIM_LENGTH_S: meta.ANIM_LENGTH_S ?? 10,
    PALETTE: meta.PALETTE ?? 'viridis',
  }
  // Replace placeholders in the first code cell
  if (Array.isArray(nb.cells) && nb.cells.length > 0 && nb.cells[0].cell_type === 'code') {
    const src = nb.cells[0].source.join('')
    const replaced = src.replace('{RESULTS_DIR}', String(placeholders.RESULTS_DIR))
      .replace('{RUN_ID}', String(placeholders.RUN_ID))
      .replace('{PROJECT_NAME}', String(placeholders.PROJECT_NAME))
      .replace('{BACKEND}', String(placeholders.BACKEND))
      .replace('{BACKEND_VERSION}', String(placeholders.BACKEND_VERSION))
      .replace('{APP_COMMIT}', String(placeholders.APP_COMMIT))
      .replace('{FRAME_RATE}', String(placeholders.FRAME_RATE))
      .replace('{ANIM_LENGTH_S}', String(placeholders.ANIM_LENGTH_S))
      .replace('{PALETTE}', String(placeholders.PALETTE))
    nb.cells[0].source = [replaced]
  }

  // If there are point-grid artifacts, add a small representative GIF embed + recipe
  const pointArtifacts = artifacts.filter((p) => /_p\d+_field\.json$/.test(p))
  if (pointArtifacts.length > 0) {
    // pick up to 4 representative frames
    const reps = pointArtifacts.slice(0, 4)
    // small placeholder 1x1 GIF (transparent) base64
    const smallGif = 'data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='
    // Add a markdown cell with inline image (so exported notebook has a sample visual immediately)
    nb.cells.push({ cell_type: 'markdown', metadata: {}, source: [`### Point-grid detector sample animation\n` , `Embedded representative GIF (placeholder):\n`, `![](${smallGif})`] })
    // Add a code cell that, when executed in the notebook, will assemble frames into a GIF
    const code = `# Assemble representative point-grid frames into a GIF (requires imageio)
import imageio
import os
frames = []
base = '''${placeholders.RESULTS_DIR}'''
# Representative artifacts:
artifacts = ${JSON.stringify(reps)}
for a in artifacts:
    path = os.path.join(base, a)
    try:
        frames.append(imageio.imread(path))
    except Exception as e:
        print('Failed to read', path, e)
if frames:
    out = os.path.join(base, 'point_grid_sample.gif')
    imageio.mimsave(out, frames, fps=${placeholders.FRAME_RATE})
    print('Wrote', out)
else:
    print('No frames available to assemble')
`
    nb.cells.push({ cell_type: 'code', metadata: {}, source: [code] })
  }

  return nb
}

export function downloadReportNotebook(filename: string, nbObj: any) {
  const blob = new Blob([JSON.stringify(nbObj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
