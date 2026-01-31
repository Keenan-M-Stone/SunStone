import React from 'react'

export function computeOrientationPoints(cx: number, cy: number, ang: number, len: number, headSize: number) {
  const x1 = cx
  const y1 = cy
  const x2 = cx + Math.cos(ang) * len
  const y2 = cy + Math.sin(ang) * len
  const hx1 = cx + Math.cos(ang + 0.35) * headSize
  const hy1 = cy + Math.sin(ang + 0.35) * headSize
  const hx2 = cx + Math.cos(ang - 0.35) * headSize
  const hy2 = cy + Math.sin(ang - 0.35) * headSize
  return { x1, y1, x2, y2, hx1, hy1, hx2, hy2 }
}

export default function MarkerOrientation({ cx, cy, ang, len, headSize, color = 'rgba(255,255,255,0.95)', strokeWidth = 1, vectorEffect }: {
  cx: number
  cy: number
  ang: number
  len: number
  headSize: number
  color?: string
  strokeWidth?: number
  vectorEffect?: string | undefined
}) {
  const pts = computeOrientationPoints(cx, cy, ang, len, headSize)
  return (
    <>
      <line x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2} stroke={color} strokeWidth={strokeWidth} vectorEffect={vectorEffect} />
      <polygon points={`${pts.x2},${pts.y2} ${pts.hx1},${pts.hy1} ${pts.hx2},${pts.hy2}`} fill={color} />
    </>
  )
}
