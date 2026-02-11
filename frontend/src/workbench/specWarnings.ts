type ComputeSpecWarningsArgs = {
  baseWarnings?: string[] | null
  backend: string
  backendCapabilities?: any
  materials: any[]
}

function isAllZeroTensor(v: any): boolean {
  try {
    if (Array.isArray(v) && v.length === 9) return v.every((x) => Number(x) === 0)
    if (Array.isArray(v) && v.length === 3 && v.every((r: any) => Array.isArray(r) && r.length === 3)) {
      return v.flat().every((x: any) => Number(x) === 0)
    }
  } catch (e) {}
  return false
}

function getFlat9(v: any): number[] | null {
  if (!Array.isArray(v)) return null
  if (v.length === 9) return v.map((x) => Number(x))
  if (v.length === 3 && v.every((r: any) => Array.isArray(r) && r.length === 3)) {
    const flat = v.flat().map((x: any) => Number(x))
    return flat.length === 9 ? flat : null
  }
  return null
}

function hasOffDiagonal(flat9: number[]): boolean {
  // row-major indices: 0 1 2 / 3 4 5 / 6 7 8
  const off = [1, 2, 3, 5, 6, 7]
  return off.some((i) => Number(flat9[i]) !== 0)
}

function isComplexScalar(v: any): boolean {
  if (!v) return false
  if (typeof v === 'string') return /j|i/.test(v)
  if (typeof v === 'object' && ('real' in v) && ('imag' in v)) {
    const im = Number((v as any).imag)
    return Number.isFinite(im) && im !== 0
  }
  return false
}

function hasNonTrivialMu(m: any): boolean {
  const mu = m?.mu
  const muTensor = m?.mu_tensor
  if (muTensor != null && !isAllZeroTensor(muTensor)) return true
  if (Array.isArray(mu) && mu.length) {
    const flat = getFlat9(mu)
    if (!flat) return true
    // identity check
    return !(flat[0] === 1 && flat[4] === 1 && flat[8] === 1 && [1,2,3,5,6,7].every((i) => flat[i] === 0))
  }
  if (typeof mu === 'number') return mu !== 1
  if (typeof mu === 'object' && mu && ('real' in mu) && ('imag' in mu)) {
    const re = Number((mu as any).real)
    const im = Number((mu as any).imag)
    return (Number.isFinite(re) && re !== 1) || (Number.isFinite(im) && im !== 0)
  }
  return false
}

export function computeSpecWarnings({ baseWarnings, backend, backendCapabilities, materials }: ComputeSpecWarningsArgs): string[] | null {
  const warnings: string[] = [...(baseWarnings || [])]
  const caps = backendCapabilities || {}
  const allowedModels = Array.isArray((caps as any).material_models) ? (caps as any).material_models : []
  const backendKey = String(backend || '').toLowerCase()

  const hasBianisotropic = (materials || []).some((m: any) => {
    const xi = (m as any)?.xi
    const zeta = (m as any)?.zeta
    const xiTensor = (m as any)?.xi_tensor
    const zetaTensor = (m as any)?.zeta_tensor
    const hasXi = xi != null || xiTensor != null
    const hasZeta = zeta != null || zetaTensor != null
    if (!hasXi && !hasZeta) return false
    if (hasXi && (isAllZeroTensor(xi) || isAllZeroTensor(xiTensor))) return false
    if (hasZeta && (isAllZeroTensor(zeta) || isAllZeroTensor(zetaTensor))) return false
    return true
  })

  if (hasBianisotropic) {
    const msg = 'Materials include magneto-electric couplings (ξ/ζ); most backends may ignore these unless bianisotropic media is supported.'
    if (!warnings.includes(msg)) warnings.push(msg)
    if (!allowedModels.includes('anisotropic')) {
      const msg2 = `Backend "${backend}" does not advertise anisotropic material support; tensor materials may be ignored or rejected.`
      if (!warnings.includes(msg2)) warnings.push(msg2)
    }
  }

  // Meep-specific constraints of our current backend implementation.
  if (backendKey === 'meep') {
    const hasOffDiagEps = (materials || []).some((m: any) => {
      const epsFlat = getFlat9(m?.epsilon)
      if (!epsFlat) return false
      return hasOffDiagonal(epsFlat)
    })
    if (hasOffDiagEps) {
      const msg = 'Meep backend currently supports only diagonal anisotropic ε (off-diagonal ε tensor terms will be rejected).'
      if (!warnings.includes(msg)) warnings.push(msg)
    }

    const hasComplexEps = (materials || []).some((m: any) => isComplexScalar(m?.eps))
    const hasComplexEpsWithoutApprox = (materials || []).some((m: any) => isComplexScalar(m?.eps) && !m?.approximate_complex)
    if (hasComplexEpsWithoutApprox) {
      const msg = 'Meep backend does not accept complex-valued constant ε; enable “Approximate complex eps (Drude fit)” or use a backend that accepts complex ε.'
      if (!warnings.includes(msg)) warnings.push(msg)
    } else if (hasComplexEps) {
      const hasFit = (materials || []).some((m: any) => !!m?.dispersion_fit && Array.isArray(m?.dispersion_fit?.freqs))
      if (!hasFit) {
        const msg = 'Complex ε approximation is enabled but no dispersion table is present; the Drude approximation will be a single-frequency heuristic.'
        if (!warnings.includes(msg)) warnings.push(msg)
      }
    }

    const hasMu = (materials || []).some((m: any) => hasNonTrivialMu(m))
    if (hasMu) {
      const msg = 'Meep backend currently ignores μ (magnetic materials are not applied in this backend implementation).'
      if (!warnings.includes(msg)) warnings.push(msg)
    }
  }

  return warnings.length > 0 ? warnings : null
}
