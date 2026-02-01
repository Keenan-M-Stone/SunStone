/// <reference types="vitest" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DiscretizePreviewModal from '../DiscretizePreviewModal'
import * as api from '../sunstoneApi'
import { vi } from 'vitest'

describe('DiscretizePreviewModal', () => {
  it('fetches preview slices and calls onComplete', async () => {
    const geometry = [{ id: 'g1', shape: 'block', center: [0, 0], size: [1, 1], materialId: 'm1' }]
    const materials = [{ id: 'm1', label: 'mat', eps: 2, gradient: { type: 'linear', start: [0,0,0], end: [1,0,0], axis: 'x', value0: 1, value1: 2 } }]
    const spy = vi.spyOn(api, 'expandGradientBatch').mockResolvedValue({ results: { 'g1:m1': [{ points: [[0,0],[1,0],[1,1]], color: 'rgba(1,2,3,0.5)' }] } })

    const onComplete = vi.fn()
    render(<DiscretizePreviewModal open={true} onClose={() => {}} geometry={geometry} materials={materials} onComplete={onComplete} />)

    const fetchBtn = await screen.findByText('Fetch preview')
    fireEvent.click(fetchBtn)

    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(onComplete).toHaveBeenCalled())

    spy.mockRestore()
  })
})
