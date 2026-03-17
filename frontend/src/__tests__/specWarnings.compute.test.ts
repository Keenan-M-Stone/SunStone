import { describe, it, expect } from 'vitest'
import { computeSpecWarnings } from '../workbench/specWarnings'

describe('computeSpecWarnings', () => {
  it('warns for bianisotropic couplings', () => {
    const w = computeSpecWarnings({
      baseWarnings: null,
      backend: 'meep',
      backendCapabilities: { material_models: ['isotropic'] },
      materials: [{ id: 'm1', xi: [0,0,0,0,1,0,0,0,0] }],
    })
    expect(w?.join('\n') || '').toMatch(/magneto-electric couplings/i)
    expect(w?.join('\n') || '').toMatch(/does not advertise anisotropic/i)
  })

  it('warns on Meep off-diagonal epsilon tensors', () => {
    const w = computeSpecWarnings({
      baseWarnings: null,
      backend: 'meep',
      backendCapabilities: { material_models: ['anisotropic'] },
      materials: [{ id: 'm1', epsilon: [2, 0.1, 0, 0, 2, 0, 0, 0, 2] }],
    })
    expect(w?.join('\n') || '').toMatch(/off-diagonal/i)
  })

  it('warns on Meep complex eps without approximation', () => {
    const w = computeSpecWarnings({
      baseWarnings: null,
      backend: 'meep',
      backendCapabilities: { material_models: ['isotropic', 'drude'] },
      materials: [{ id: 'm1', eps: { real: 2, imag: 0.5 }, approximate_complex: false }],
    })
    expect(w?.join('\n') || '').toMatch(/does not accept complex-valued constant/i)
  })

  it('warns when Meep mu is nontrivial (ignored)', () => {
    const w = computeSpecWarnings({
      baseWarnings: null,
      backend: 'meep',
      backendCapabilities: { material_models: ['isotropic'] },
      materials: [{ id: 'm1', mu: 2 }],
    })
    expect(w?.join('\n') || '').toMatch(/ignores μ/i)
  })

  it('flags stub backends', () => {
    for (const name of ['ceviche', 'opal', 'scuffem', 'pygdm']) {
      const w = computeSpecWarnings({
        backend: name,
        backendCapabilities: { label: `${name} (Test)` },
        materials: [],
      })
      expect(w?.join('\n') || '').toMatch(/stub/i)
    }
  })

  it('does NOT flag meep as a stub', () => {
    const w = computeSpecWarnings({
      backend: 'meep',
      backendCapabilities: { material_models: ['isotropic'] },
      materials: [],
    })
    expect(w).toBeNull()
  })

  it('warns on unsupported boundary type', () => {
    const w = computeSpecWarnings({
      backend: 'ceviche',
      backendCapabilities: { boundary_types: ['pec', 'periodic'] },
      materials: [],
      boundaryType: 'pml',
    })
    expect(w?.join('\n') || '').toMatch(/does not support "pml" boundary/i)
  })

  it('warns on anisotropic material for isotropic-only backend', () => {
    const w = computeSpecWarnings({
      backend: 'opal',
      backendCapabilities: { material_models: ['isotropic'] },
      materials: [{ id: 'm1', epsilon: [2, 0.1, 0, 0, 2, 0, 0, 0, 2] }],
    })
    expect(w?.join('\n') || '').toMatch(/only supports isotropic/i)
  })
})
