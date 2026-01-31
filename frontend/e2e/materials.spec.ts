import { test, expect } from '@playwright/test'

test('material editor: add anisotropic material and submit run', async ({ page }) => {


  await page.goto('/')
  // Set workspace to FDTD
  const modeSelect = page.locator('label:has-text("Mode") select')
  await modeSelect.selectOption('fdtd')

  // Open material editor (click the button explicitly to avoid matching explanatory text)
  await page.locator('button:has-text("Manage materials")').click()
  await expect(page.locator('text=Material Editor')).toBeVisible()

  // Add material
  await page.locator('text=Add').click()
  // Edit last material inside the Material Editor modal
  const modal = page.locator('h3:has-text("Material Editor")').locator('..')
  const lastIdInput = modal.locator('label:has-text("ID") input')
  await lastIdInput.fill('anis1')
  const modelSelect = modal.locator('label:has-text("Model") select')
  await modelSelect.selectOption('anisotropic')
  // Fill tensor entries
  const inputs = page.locator('div[style] input').filter({ hasText: '' }) // heuristic

  // Instead of filling all, set first element
  await page.locator('input').nth(6).fill('2')

  await page.locator('text=Save materials').click()
  // Wait for the material editor modal to close
  await expect(page.locator('text=Material Editor')).not.toBeVisible({ timeout: 2000 })

  // Create project and run via the UI using robust waits (no API shortcuts)
  // Fill project name and click Create
  await page.locator('label:has-text("Name") input').fill('demo')
  const createBtn = page.locator('h2:has-text("Project")').locator('button:has-text("Create")')
  await expect(createBtn).toBeEnabled({ timeout: 5000 })
  await createBtn.click()

  // Wait until Create Run becomes enabled, create the run, then Submit
  const createRunBtn = page.locator('button:has-text("Create Run")')
  await expect(createRunBtn).toBeEnabled({ timeout: 5000 })
  await createRunBtn.click()
  const submitBtn = page.locator('button:has-text("Submit Run")')
  await expect(submitBtn).toBeEnabled({ timeout: 5000 })
  await submitBtn.click()

  // Ensure no validation error displayed (no 400)
  await expect(page.locator('text=Run failed').first(), { timeout: 2000 }).not.toBeVisible()
})