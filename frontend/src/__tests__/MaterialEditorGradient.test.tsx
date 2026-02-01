import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MaterialEditor from '../MaterialEditor'
import * as api from '../sunstoneApi'
import { describe, it, expect, vi } from 'vitest'

describe('MaterialEditor Parameterize', () => {
  it('imports properties from existing material', async () => {
    const materials = [
      { id: 'm1', label: 'src', color: '#112233', eps: 2.5 },
      { id: 'm2', label: 'dst', color: '#cccccc', eps: 1.0 },
    ]
    const setMaterials = vi.fn()
    const onClose = vi.fn()
    render(<MaterialEditor materials={materials} setMaterials={setMaterials} onClose={onClose} />)

    // Click Edit on the second material (dst)
    const editButtons = await screen.findAllByText('Edit')
    expect(editButtons.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(editButtons[1])

    // Open Parameterize tab and confirm Parameterize UI present
    const paramButton = await screen.findByText('Parameterize')
    fireEvent.click(paramButton)
    const importBtn = await screen.findByText('Import properties')
    expect(importBtn).toBeTruthy()
  })

  it('imports gradient arrow and creates material on server', async () => {
    const materials = [
      { id: 'm1', label: 'src', color: '#112233', eps: 2.5 },
    ]
    const setMaterials = vi.fn()
    const onClose = vi.fn()

    // Simulate a user having drawn a gradient arrow on the canvas
    ;(window as any).__last_drawn_gradient = { id: 'g1', shape: 'gradient', start: [0, 0], end: [1e-6, 0], center: [0.5e-6, 0] }

    const createSpy = vi.spyOn(api, 'createMaterial').mockResolvedValue({ id: 'mat-new' })

    // avoid jsdom alert errors
    ;(window as any).alert = vi.fn()

    render(<MaterialEditor materials={materials} setMaterials={setMaterials} onClose={onClose} />)

    // Add a new material and open Parameterize
    const addButton = await screen.findByText('Add')
    fireEvent.click(addButton)
    const paramButton = await screen.findByText('Parameterize')
    fireEvent.click(paramButton)

    // Import the gradient arrow
    const importArrowButton = await screen.findByText('Import gradient arrow')
    fireEvent.click(importArrowButton)

    // Create on server
    const createButton = await screen.findByText('Create on server')
    fireEvent.click(createButton)

    await waitFor(() => expect(createSpy).toHaveBeenCalled())
    const body = createSpy.mock.calls[0][0]
    expect(body).toBeTruthy()
    expect(body.gradient).toBeTruthy()
    expect(body.gradient.start[0]).toBe(0)
    expect(Math.abs(body.gradient.end[0] - 1e-6)).toBeLessThan(1e-12)

    // Now test Auto generation: mock applyGradient func
    ;(window as any).__applyGradientToGeometry = vi.fn()
    const kindSelect = await screen.findByLabelText('Kind')
    fireEvent.change(kindSelect, { target: { value: 'linear' } })
    const coordSelect = await screen.findByLabelText('Coord')
    fireEvent.change(coordSelect, { target: { value: 'cartesian' } })
    // pick the auto-axis select specifically
    const axisSelect = document.getElementById('auto-axis') as HTMLSelectElement
    fireEvent.change(axisSelect, { target: { value: 'x' } })
    const autoButton = await screen.findByText('Auto')
    fireEvent.click(autoButton)

    // expect material in local state to have gradient and a call to __applyGradientToGeometry
    await waitFor(() => expect((window as any).__applyGradientToGeometry).toHaveBeenCalled())

    createSpy.mockRestore()
  })
})