import { computeOrientationPoints } from '../MarkerOrientation'
import { describe, it, expect } from 'vitest'

describe('computeOrientationPoints', () => {
  it('computes sensible arrow coordinates', () => {
    const cx = 10
    const cy = 20
    const ang = Math.PI / 4
    const len = 5
    const headSize = 1
    const pts = computeOrientationPoints(cx, cy, ang, len, headSize)
    expect(typeof pts.x1).toBe('number')
    expect(typeof pts.x2).toBe('number')
    expect(pts.x2).not.toBeCloseTo(pts.x1)
    expect(pts.hx1).not.toBeCloseTo(pts.hx2)
  })
})
