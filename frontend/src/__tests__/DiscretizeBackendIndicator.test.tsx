/// <reference types="vitest" />
import { render, screen, fireEvent } from '@testing-library/react'
import DiscretizeBackendIndicator from '../DiscretizeBackendIndicator'
import { vi } from 'vitest'
// vitest globals are available via tsconfig types

describe('DiscretizeBackendIndicator', () => {
  it('renders backend and calls refresh', async () => {
    const onRefresh = vi.fn()
    render(<DiscretizeBackendIndicator backend={'meep'} onRefresh={onRefresh} />)
    expect(screen.getByText('Preview backend')).toBeInTheDocument()
    expect(screen.getByText('meep')).toBeInTheDocument()
    const btn = screen.getByText('Refresh preview')
    fireEvent.click(btn)
    expect(onRefresh).toHaveBeenCalledWith('meep')
  })

  it('renders nothing when backend null', () => {
    const { container } = render(<DiscretizeBackendIndicator backend={null} onRefresh={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
