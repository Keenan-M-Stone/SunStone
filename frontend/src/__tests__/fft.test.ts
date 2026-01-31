import { describe, it, expect } from 'vitest'
import { computeFFT } from '../util/fft'

describe('computeFFT', () => {
  it('returns empty for too few samples', () => {
    const r = computeFFT([0], [1])
    expect(r.freqs).toEqual([])
    expect(r.mags).toEqual([])
  })

  it('finds a peak at known frequency for a sine wave', () => {
    const fs = 1e15
    const n = 1024
    const t = Array.from({ length: n }, (_, i) => i / fs)
    const f0 = 1e12
    const vals = t.map((tt) => Math.sin(2 * Math.PI * f0 * tt))
    const { freqs, mags } = computeFFT(t, vals)
    // find frequency with largest magnitude
    const idx = mags.indexOf(Math.max(...mags))
    expect(freqs[idx]).toBeGreaterThan(0.9e12)
    expect(freqs[idx]).toBeLessThan(1.1e12)
  })
})