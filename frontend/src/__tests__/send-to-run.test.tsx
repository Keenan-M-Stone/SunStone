import React from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import App from '../App'

test('Run inspector shows CAD-derived spec from active tab', async () => {
  render(<App />)

  // Open the Run panel and then the Inspector spec view
  const showRunBtn = screen.getByText('Show Run')
  fireEvent.click(showRunBtn)

  // Wait for the Run panel inspector 'Open Spec' button to appear
  await waitFor(() => expect(screen.getByText('Open Spec / Translation (Inspector)')).toBeInTheDocument())

  const openSpecBtn = screen.getByText('Open Spec / Translation (Inspector)')
  fireEvent.click(openSpecBtn)

  // Now find the spec editable heading and textarea
  const specHeading = await screen.findByText('Spec (editable)')
  const textarea = specHeading.parentElement?.querySelector('textarea') as HTMLTextAreaElement
  expect(textarea).toBeTruthy()
  // The spec should include a geometry array (from active tab initial state)
  expect(textarea.value).toMatch(/"geometry":/)
})
