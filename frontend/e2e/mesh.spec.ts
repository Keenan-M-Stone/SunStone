import { test, expect } from '@playwright/test'

test('mesh upload and QC shows info', async ({ page }) => {
  await page.goto('/')
  const modeSelect = page.locator('label:has-text("Mode") select')
  await modeSelect.selectOption('fdtd')

  // Upload small OBJ via MeshManager input
  // Wait for any file input to be present, then set file
  await page.waitForSelector('input[type=file]', { timeout: 10000 })
  const input = page.locator('input[type=file]').first()
  const obj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
  await input.setInputFiles({ name: 'tri.obj', mimeType: 'text/plain', buffer: Buffer.from(obj) })

  // Expect QC display (allow a bit more time for upload/QC)
  await expect(page.locator('text=Vertices: 3')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('text=Faces: 1')).toBeVisible({ timeout: 5000 })
})