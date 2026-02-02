import React from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import App from '../App'

test('CAD tab bar is present in the canvas panel and New tab works', async () => {
  render(<App />)

  // The canvas area should contain the cad tab bar with at least one tab
  const tab1 = await screen.findByText('Tab 1')
  expect(tab1).toBeInTheDocument()

  // Click New tab and expect Tab 2 to appear and become active
  const newTabBtn = screen.getByText('New tab')
  fireEvent.click(newTabBtn)

  const tab2 = await screen.findByText('Tab 2')
  expect(tab2).toBeInTheDocument()
})