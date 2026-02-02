import { describe, it, expect } from 'vitest'
import { expandPlaneMonitors } from '../translators'

describe('expandPlaneMonitors', () => {
  it('expands a 2x2 sampling grid into 4 point monitors', () => {
    const spec = {
      monitors: [
        {
          id: 'm1',
          type: 'plane',
          position: [0, 0, 0],
          size: [2, 2],
          components: ['Ez'],
          dt: 1e-16,
          sampling: { mode: 'points', nx: 2, ny: 2 },
        },
      ],
    }
    const out = expandPlaneMonitors(spec)
    expect(out.monitors).toHaveLength(4)
    expect(out.monitors[0].type).toBe('point')
    expect(out.monitors[0].id).toMatch(/m1_p\d+/)
  })

  it('keeps non-plane monitors unchanged', () => {
    const spec = { monitors: [{ id: 's1', type: 'point', position: [1, 2, 0], components: ['Ex'], dt: 1e-16 }] }
    const out = expandPlaneMonitors(spec)
    expect(out.monitors).toHaveLength(1)
    expect(out.monitors[0].id).toBe('s1')
  })
})
