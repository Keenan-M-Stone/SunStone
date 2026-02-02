import React from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import App from '../App'
import * as api from '../sunstoneApi'
// Provide a simple HTMLCanvasElement.getContext shim for tests so three.js can create a context in JSDOM
const _origGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function () {
  // return a minimal object instead of null so three.js won't throw; it won't be used for rendering in tests
  return {} as any
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('Create Run uses spec from the active CAD tab', async () => {
  const createRunSpy = vi.spyOn(api, 'createRun').mockResolvedValue({ id: 'run-1', status: 'created' } as any)
  const createProjectSpy = vi.spyOn(api, 'createProject').mockResolvedValue({ id: 'proj-1', name: 'proj-for-create-run' } as any)

  render(<App />)

  // create a project first (Create button in Tools panel)
  const projectNameInput = screen.getByLabelText('Name') as HTMLInputElement
  fireEvent.change(projectNameInput, { target: { value: 'proj-for-create-run' } })
  const createProjectBtn = screen.getByText('Create')
  fireEvent.click(createProjectBtn)

  // Wait for project to be shown in UI
  await waitFor(() => expect(document.querySelector('.kv .v.mono')?.textContent).toContain('proj-for-create-run'))

  // Show the Run panel, then click Create Run — it should use the current active tab spec (initial tab has default geometry)
  const showRunBtn = screen.getByText('Show Run')
  fireEvent.click(showRunBtn)
  const createRunBtn = await screen.findByText('Create Run')
  fireEvent.click(createRunBtn)

  await waitFor(() => expect(createRunSpy).toHaveBeenCalled())
  const callSpec = createRunSpy.mock.calls[0][1]
  expect(callSpec).toBeDefined()
  // Active tab (initial) should include at least one geometry block
  expect(Array.isArray(callSpec.geometry)).toBe(true)
  expect(callSpec.geometry.length).toBeGreaterThan(0)
})