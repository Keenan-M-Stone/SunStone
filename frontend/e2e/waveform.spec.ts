import { test, expect } from '@playwright/test'

test('waveform editor: create waveform and assign to source', async ({ page }) => {
  await page.goto('/')
  const modeSelect = page.locator('label:has-text("Mode") select')
  await modeSelect.selectOption('fdtd')

  // Open waveform editor
  await page.locator('text=Edit waveforms').click()
  await expect(page.locator('text=Waveform Editor')).toBeVisible()

  // Add Gaussian
  await page.locator('text=Add Gaussian').click()
  await page.locator('label:has-text("Label") input').fill('mygauss')
  await page.locator('text=Save waveforms').click()

  // Select first source for editing, then assign waveform
  // Edit the first source (has id starting with src-)
  await page.locator('div.list-item:has-text("src-") button:has-text("Edit")').click()
  await page.locator('label:has-text("Waveform") select').selectOption({ label: 'mygauss' })

  // Verify spec preview contains waveform id/label
  const specText = await page.locator('label:has-text("Spec Preview") textarea').inputValue()
  expect(specText).toContain('mygauss')
})