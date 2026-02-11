import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactEntry } from './types'
import { createRun, downloadArtifactUrl, getArtifacts, submitRun } from './sunstoneApi'
import { geometryItemsToStl, type SimpleGeometryItem } from './mesh/stl3d'

type SubmitOptions = {
  mode: 'local' | 'ssh' | 'slurm'
  pythonExecutable?: string
  backendOptions?: Record<string, any>
  sshTarget?: string
  sshOptions?: Record<string, any>
}

export default function ConstitutiveWorkbenchDialog({
  open,
  onClose,
  projectId,
  materials,
  setMaterials,
  selectedMaterialId,
  buildSpecForSynthesis,
  submitOptions,
  onOpenMaterialEditor,
  onOpenBundleArtifact,
  onInsertBundleArtifact,
}: {
  open: boolean
  onClose: () => void
  projectId: string | null
  materials: any[]
  setMaterials: (next: any[]) => void
  selectedMaterialId: string | null
  buildSpecForSynthesis: (opts: { preset: string; targetMaterialId: string | null }) => any
  submitOptions: SubmitOptions
  onOpenMaterialEditor: () => void
  onOpenBundleArtifact: (runId: string, path: string) => void
  onInsertBundleArtifact: (runId: string, path: string) => void
}) {
  const [preset, setPreset] = useState<string>('layered')
  const [targetMaterial, setTargetMaterial] = useState<string>('')
  const [runId, setRunId] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    // default target: current selection if available, else first material
    const fallback = materials?.[0]?.id ? String(materials[0].id) : ''
    setTargetMaterial((prev) => prev || selectedMaterialId || fallback)
  }, [open, selectedMaterialId, materials])

  const bundleArtifacts = useMemo(() => {
    return (artifacts || []).filter((a) => {
      const p = String((a as any).path || '')
      return p.endsWith('.sunstone.json')
    })
  }, [artifacts])

  const effectiveExtractionAvailable = false

  async function refreshArtifacts(rid: string) {
    const list = await getArtifacts(rid)
    setArtifacts(list)
  }

  async function runSynthesis() {
    setError(null)
    if (!open) return
    if (!projectId) {
      setError('Create a project first.')
      return
    }
    const t = targetMaterial || null
    setBusy('Creating synthesis run…')
    try {
      const spec = buildSpecForSynthesis({ preset, targetMaterialId: t })
      const run = await createRun(projectId, spec)
      setRunId(run.id)
      setBusy('Submitting synthesis run…')
      await submitRun(
        run.id,
        'synthesis',
        submitOptions.pythonExecutable,
        submitOptions.backendOptions,
        submitOptions.mode,
        submitOptions.sshTarget,
        submitOptions.sshOptions,
      )
      setBusy('Refreshing artifacts…')
      await refreshArtifacts(run.id)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRefresh() {
    setError(null)
    if (!runId) return
    setBusy('Refreshing artifacts…')
    try {
      await refreshArtifacts(runId)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  function downloadText(filename: string, text: string, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 200)
  }

  async function downloadCandidateStl(path: string) {
    if (!runId) return
    setError(null)
    setBusy('Building STL…')
    try {
      const url = downloadArtifactUrl(runId, path)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch artifact: ${res.status}`)
      const payload = await res.json()
      const geom = payload?.cad?.geometry || []
      const items: SimpleGeometryItem[] = []
      for (const g of geom) {
        if (g?.type === 'block') {
          const c = g.center || [0, 0, 0]
          const s = g.size || [0, 0, 0]
          items.push({ type: 'block', center: [Number(c[0]) || 0, Number(c[1]) || 0], centerZ: Number(c[2]) || 0, size: [Number(s[0]) || 0, Number(s[1]) || 0], sizeZ: Number(s[2]) || 0 })
        }
        if (g?.type === 'cylinder') {
          const c = g.center || [0, 0, 0]
          items.push({ type: 'cylinder', center: [Number(c[0]) || 0, Number(c[1]) || 0], centerZ: Number(c[2]) || 0, radius: Number(g.radius) || 0, sizeZ: Number(g.height) || Number(g.sizeZ) || 0 })
        }
      }
      const stl = geometryItemsToStl('candidate', items, 1)
      const base = path.split('/').pop() || 'candidate'
      downloadText(base.replace(/\.sunstone\.json$/i, '.stl'), stl, 'model/stl')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  function exportSelectedMaterialJson() {
    const mid = targetMaterial || selectedMaterialId || ''
    const m = materials.find((x) => String(x.id) === String(mid))
    if (!m) return
    downloadText(`${m.id}.material.json`, JSON.stringify(m, null, 2), 'application/json')
  }

  function importMaterialJson() {
    fileInputRef.current?.click()
  }

  async function handleMaterialFile(e: any) {
    const file: File | null = e?.target?.files?.[0] || null
    if (!file) return
    setError(null)
    try {
      const matrix3x3ToFlat9 = (m: any): number[] | null => {
        if (Array.isArray(m) && m.length === 9) return m.map((x) => Number(x) || 0)
        if (Array.isArray(m) && m.length === 3 && m.every((r: any) => Array.isArray(r) && r.length === 3)) {
          const flat = [
            Number(m[0][0]), Number(m[0][1]), Number(m[0][2]),
            Number(m[1][0]), Number(m[1][1]), Number(m[1][2]),
            Number(m[2][0]), Number(m[2][1]), Number(m[2][2]),
          ]
          return flat.map((x) => (Number.isFinite(x) ? x : 0))
        }
        return null
      }

      const normalizeMaterialTensors = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj
        const out: any = { ...obj }
        // epsilon tensor may be provided as eps_tensor/epsilon_tensor (3x3) instead of flat-9 epsilon.
        if (out.epsilon == null) {
          const epsFlat = matrix3x3ToFlat9(out.eps_tensor ?? out.epsilon_tensor ?? out.eps)
          if (epsFlat) out.epsilon = epsFlat
        }
        if (out.mu == null || Array.isArray(out.mu)) {
          const muFlat = matrix3x3ToFlat9(out.mu_tensor ?? out.mu)
          if (muFlat) out.mu = muFlat
        }
        if (out.xi == null || Array.isArray(out.xi)) {
          const xiFlat = matrix3x3ToFlat9(out.xi_tensor ?? out.xi)
          if (xiFlat) out.xi = xiFlat
        }
        if (out.zeta == null || Array.isArray(out.zeta)) {
          const zetaFlat = matrix3x3ToFlat9(out.zeta_tensor ?? out.zeta)
          if (zetaFlat) out.zeta = zetaFlat
        }
        return out
      }

      const text = await file.text()
      const obj = JSON.parse(text)
      if (!obj || typeof obj !== 'object') throw new Error('Invalid JSON')
      const mid = targetMaterial || selectedMaterialId || ''
      if (!mid) throw new Error('Select a target material first.')
      // Replace selected material fields, but preserve its id.
      const next = materials.map((m) => {
        if (String(m.id) !== String(mid)) return m
        return normalizeMaterialTensors({ ...m, ...obj, id: m.id })
      })
      setMaterials(next)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      // reset
      if (e?.target) e.target.value = ''
    }
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}>
      <div style={{ width: 860, background: '#0b0b10', color: '#e8e8e8', padding: 16, borderRadius: 8, maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Constitutive Workbench</h3>
          <div className="muted">Exact tensors, dispersion (CSV), and geometry candidates</div>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onClose}>Close</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <label>Target material
            <select value={targetMaterial} onChange={(e) => setTargetMaterial(e.target.value)} style={{ marginLeft: 6, minWidth: 220 }}>
              {(materials || []).map((m) => (
                <option key={m.id} value={String(m.id)}>{String(m.id)} — {String(m.label || '')}</option>
              ))}
            </select>
          </label>
          <label>Preset
            <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="layered">Layered</option>
              <option value="inclusions">Inclusions</option>
            </select>
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onOpenMaterialEditor}>Manage materials (tensors/CSV)</button>
            <button
              onClick={() => {}}
              disabled={!effectiveExtractionAvailable}
              title={effectiveExtractionAvailable ? 'Compute effective constitutive parameters from the current geometry' : 'Not implemented yet: geometry → effective constitutive extraction'}
            >
              Compute effective tensor (from geometry)
            </button>
            <button onClick={exportSelectedMaterialJson}>Export material JSON</button>
            <button onClick={importMaterialJson}>Import material JSON</button>
            <button onClick={runSynthesis} className="primary" disabled={!!busy}>Generate candidates</button>
            <button onClick={onRefresh} disabled={!runId || !!busy}>Refresh</button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleMaterialFile} />

        <div style={{ marginTop: 10 }}>
          <div className="muted">Notes: ξ/ζ couplings are preserved in bundles but many backends ignore them. Use “Manage materials” for exact tensor entry and dispersion CSV import/export.</div>
          {!effectiveExtractionAvailable ? (
            <div className="muted" style={{ marginTop: 6 }}>
              Geometry → effective constitutive extraction is not wired up yet. The intended path is a backend service that homogenizes the selected geometry (optionally angle/wavelength dependent) into ε/μ/ξ/ζ and/or a Drude-fit approximation.
            </div>
          ) : null}
          {busy ? <div style={{ marginTop: 6 }}>{busy}</div> : null}
          {error ? <div style={{ color: 'salmon', marginTop: 6 }}>{error}</div> : null}
        </div>

        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: 0 }}>Candidate bundles</h4>
          <div className="muted">Preview opens in a new CAD tab (2D/3D viewports). Insert replaces the selected block/cylinder.</div>
          {!runId ? (
            <div style={{ marginTop: 8 }} className="muted">No synthesis run yet.</div>
          ) : bundleArtifacts.length === 0 ? (
            <div style={{ marginTop: 8 }} className="muted">No bundle artifacts found for run {runId}.</div>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              {bundleArtifacts.map((a) => {
                const p = String((a as any).path)
                const name = p.split('/').pop() || p
                return (
                  <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div className="mono">{name}</div>
                      <div className="muted">{p}</div>
                    </div>
                    <button onClick={() => onOpenBundleArtifact(runId!, p)} disabled={!!busy}>Preview</button>
                    <button onClick={() => onInsertBundleArtifact(runId!, p)} disabled={!!busy}>Insert</button>
                    <button onClick={() => downloadCandidateStl(p)} disabled={!!busy}>Download STL</button>
                    <a href={downloadArtifactUrl(runId!, p)} target="_blank" rel="noreferrer">JSON</a>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
