import { render, fireEvent, screen } from '@testing-library/react'
import React from 'react'
import CadTabs from '../CadTabs'

test('CAD tabs: add, duplicate, delete tabs', async () => {
  render(<CadTabs />)

  // cad tab bar should be visible
  const tabBar = document.querySelector('.cad-tabs')
  expect(tabBar).not.toBeNull()

  const tabSelector = () => document.querySelectorAll('.cad-tabs .tab')
  // initial single tab
  expect(tabSelector().length).toBe(1)

  // add a new tab
  const newBtn = screen.getByText('New tab')
  fireEvent.click(newBtn)
  expect(tabSelector().length).toBe(2)
  expect(tabSelector()[1].textContent).toMatch(/Tab 2/)

  // duplicate the active tab
  const dupBtn = screen.getByText('Duplicate')
  fireEvent.click(dupBtn)
  expect(tabSelector().length).toBe(3)
  expect(tabSelector()[2].textContent).toMatch(/\(copy\)/)

  // delete the active tab (which is the duplicated one)
  const delBtn = screen.getByText('Delete')
  fireEvent.click(delBtn)
  expect(tabSelector().length).toBe(2)

  // delete until only one left - clicking Delete when only one tab should do nothing
  // delete again (removes Tab 2)
  fireEvent.click(delBtn)
  expect(tabSelector().length).toBe(1)

  // attempt to delete last tab - should be ignored
  fireEvent.click(delBtn)
  expect(tabSelector().length).toBe(1)
})
