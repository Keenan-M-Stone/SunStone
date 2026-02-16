import { useMemo, useState } from 'react'
import type { StarDustAppExtensions } from './stardust'
import EmPolarizationEditor from './polarization/EmPolarizationEditor'

function ensureFlat9(v: any): number[] {
  if (Array.isArray(v) && v.length === 9) {
    const n = v.map((x: any) => (x === '' || x === null || x === undefined ? 0 : Number(x)))
    return n.map((x: any) => (Number.isFinite(x) ? x : 0))
  }
  if (Array.isArray(v) && v.length === 3 && v.every((r: any) => Array.isArray(r) && r.length === 3)) {
    const flat = [
      Number(v[0][0]),
      Number(v[0][1]),
      Number(v[0][2]),
      Number(v[1][0]),
      Number(v[1][1]),
      Number(v[1][2]),
      Number(v[2][0]),
      Number(v[2][1]),
      Number(v[2][2]),
    ]
    return flat.map((x: any) => (Number.isFinite(x) ? x : 0))
  }
  return Array(9).fill(0)
}

function TensorGrid({
  label,
  value,
  onChange,
}: {
  label: string
  value: any
  onChange: (next: number[]) => void
}) {
  const arr = useMemo(() => ensureFlat9(value), [value])
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{label} (3x3, row-major)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {Array.from({ length: 9 }).map((_, idx) => (
          <input
            key={idx}
            value={arr[idx]}
            onChange={(e) => {
              const next = ensureFlat9(value)
              next[idx] = Number(e.currentTarget.value)
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function SunStoneAdvancedTensorFields({
  material,
  updateMaterial,
}: {
  material: any
  updateMaterial: (patch: any) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ marginTop: 12 }}>
      <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        Advanced tensors
      </label>
      {open && (
        <div style={{ marginTop: 8 }}>
          <TensorGrid
            label="ε (epsilon)"
            value={(material as any)?.epsilon}
            onChange={(next) => updateMaterial({ epsilon: next })}
          />
          <TensorGrid
            label="μ (mu)"
            value={(material as any)?.mu}
            onChange={(next) => updateMaterial({ mu: next })}
          />
          <TensorGrid
            label="ξ (xi)"
            value={(material as any)?.xi}
            onChange={(next) => updateMaterial({ xi: next })}
          />
          <TensorGrid
            label="ζ (zeta)"
            value={(material as any)?.zeta}
            onChange={(next) => updateMaterial({ zeta: next })}
          />
        </div>
      )}
    </div>
  )
}

export const sunstoneStarDustExtensions: StarDustAppExtensions = {
  renderMaterialEditorFields: ({ material, updateMaterial }: { material: any; updateMaterial: (patch: any) => void }) => (
    <SunStoneAdvancedTensorFields material={material} updateMaterial={updateMaterial} />
  ),

  renderSourceEditorFields: ({ source, updateSource }: { source: any; updateSource: (patch: any) => void }) => (
    <div style={{ marginTop: 12 }}>
      <h4>Polarization</h4>
      <EmPolarizationEditor
        value={(source as any)?.polarization}
        onChange={(next) => updateSource({ polarization: next })}
      />
    </div>
  ),
}
