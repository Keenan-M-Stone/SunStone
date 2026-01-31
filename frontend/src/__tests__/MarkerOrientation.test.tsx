import React from 'react'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'
import MarkerOrientation from '../MarkerOrientation'

describe('MarkerOrientation component', () => {
  it('renders line and polygon', () => {
    const { container } = render(<svg><MarkerOrientation cx={10} cy={10} ang={Math.PI/2} len={5} headSize={1} /></svg>)
    const line = container.querySelector('line')
    const poly = container.querySelector('polygon')
    expect(line).toBeTruthy()
    expect(poly).toBeTruthy()
  })
})
