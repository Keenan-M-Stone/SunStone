import { describe, it, expect } from 'vitest'
import { translateToMeep } from '../translators'

describe('translateToMeep', () => {
  it('emits plane monitors when backend supports plane sampling', () => {
    const spec = {
      monitors: [
        { id: 'mon1', type: 'plane', position: [0, 0, 0], size: [1, 1], sampling: { mode: 'plane' }, orientation: 0 }
      ]
    }
    const out = translateToMeep(spec, { backendSupportsPlane: true })
    expect(out).toContain('Monitors:')
    expect(out).toContain('plane')
    expect(out).not.toContain('_p0')
  })

  it('expands plane monitors to points when backend does not support planes', () => {
    const spec = {
      monitors: [
        { id: 'mon1', type: 'plane', position: [0, 0, 0], size: [1, 1], sampling: { mode: 'plane' }, orientation: 0 }
      ]
    }
    const out = translateToMeep(spec, { backendSupportsPlane: false })
    // expanded ids include mon1_p0
    expect(out).toContain('point')
    expect(out).toContain('mon1_p0')
  })

  it('always expands when sampling.mode === "points"', () => {
    const spec = {
      monitors: [
        { id: 'mon1', type: 'plane', position: [0, 0, 0], size: [1, 1], sampling: { mode: 'points', nx: 2, ny: 2 }, orientation: 0 }
      ]
    }
    const out = translateToMeep(spec, { backendSupportsPlane: true })
    expect(out).toContain('point')
    expect(out).toContain('mon1_p0')
  })
})
