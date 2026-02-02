import { describe, it, expect } from 'vitest'
import { translateToOpal, translateToCeviche, translateToScuffem, translateToPyGDM } from '../translators'

describe('backend translators handle plane vs points', () => {
  const spec = {
    monitors: [
      { id: 'mon1', type: 'plane', position: [0, 0, 0], size: [1, 1], sampling: { mode: 'plane' }, orientation: 0 }
    ]
  }

  it('Opal supports plane when backendSupportsPlane=true', () => {
    const out = translateToOpal(spec, { backendSupportsPlane: true })
    expect(out).toContain('backendSupportsPlane=true')
    expect(out).toContain('plane:mon1')
  })

  it('Opal expands plane to points when backendSupportsPlane=false', () => {
    const out = translateToOpal(spec, { backendSupportsPlane: false })
    expect(out).toContain('backendSupportsPlane=false')
    expect(out).toContain('point:mon1_p0')
  })

  it('Ceviche includes monitors and expands when not supported', () => {
    const outTrue = translateToCeviche(spec, { backendSupportsPlane: true })
    expect(outTrue).toContain('"backend": "ceviche"')
    expect(outTrue).toContain('"monitors"')
    expect(outTrue).toContain('mon1')

    const outFalse = translateToCeviche(spec, { backendSupportsPlane: false })
    expect(outFalse).toContain('"monitors"')
    expect(outFalse).toContain('mon1_p0')
  })

  it('Scuffem respects backendSupportsPlane', () => {
    const o1 = translateToScuffem(spec, { backendSupportsPlane: true })
    expect(o1).toContain('backendSupportsPlane=true')
    expect(o1).toContain('plane')
    const o2 = translateToScuffem(spec, { backendSupportsPlane: false })
    expect(o2).toContain('backendSupportsPlane=false')
    expect(o2).toContain('point')
  })

  it('PyGDM includes monitors and backend flag', () => {
    const j1 = JSON.parse(translateToPyGDM(spec, { backendSupportsPlane: true }))
    expect(j1.backendSupportsPlane).toBe(true)
    expect(j1.monitors.some((m: any) => m.id === 'mon1')).toBe(true)

    const j2 = JSON.parse(translateToPyGDM(spec, { backendSupportsPlane: false }))
    expect(j2.backendSupportsPlane).toBe(false)
    expect(j2.monitors.some((m: any) => typeof m.id === 'string' && /_p\d+$/.test(m.id))).toBe(true)
  })
})
