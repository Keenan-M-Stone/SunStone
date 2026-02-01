import { test, expect } from '@playwright/test'
import { capturePageLogs, stubHealth, stubBackends, stubExpandGradientBatch } from './helpers'

test('material editor -> discretize: parameterize auto and fetch preview', async ({ page }) => {
  const logs = capturePageLogs(page)

  await stubHealth(page)
  await stubBackends(page)

  await page.goto('/')

  // Open material editor
  await page.locator('button:has-text("Manage materials")').click()
  await expect(page.locator('text=Material Editor')).toBeVisible()

  // Add material and set id
  await page.locator('text=Add').click()
  const modal = page.locator('h3:has-text("Material Editor")').locator('..')
  const idInput = modal.locator('label:has-text("ID") input')
  await idInput.fill('m-e2e')

  // Parameterize -> Auto
  await modal.locator('button:has-text("Parameterize")').click()
  await modal.locator('button:has-text("Auto")').click()

  // Save
  await page.locator('text=Save materials').click()
  await expect(page.locator('text=Material Editor')).not.toBeVisible({ timeout: 2000 })

  // Wait for geometry with gradient referencing our id
  await page.waitForFunction(() => {
    return (window as any).__geometry && (window as any).__geometry.some((g: any) => g.shape === 'gradient' && g.materialId === 'm-e2e')
  }, { timeout: 10_000 })

  const geom = await page.evaluate(() => (window as any).__geometry.find((g: any) => g.shape === 'gradient' && g.materialId === 'm-e2e'))
  const geomKey = `${geom.id}:m-e2e`

  // When the expand batch is called, return predictable results for our key
  await stubExpandGradientBatch(page, (items) => {
    const results: Record<string, any[]> = {}
    results[geomKey] = [{ points: [[0,0],[1,0],[1,1]], color: 'rgba(1,2,3,0.5)' }]
    return { results }
  })

  // Switch render mode to Discretize Preview
  const renderSelect = page.locator('label:has-text("Render")').nth(1).locator('select')
  await renderSelect.selectOption('discretize-preview')
  await expect(page.locator('h3:has-text("Discretize Preview")')).toBeVisible({ timeout: 5000 })

  // Click Fetch preview
  await page.locator('button:has-text("Fetch preview")').click()

  // Ensure indicator shows backend name and refresh hides it
  await expect(page.locator('text=Preview backend')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('text=meep')).toBeVisible()

  await page.locator('button:has-text("Refresh preview")').click()
  await expect(page.locator('text=Preview backend')).not.toBeVisible({ timeout: 5000 })

  // Helpful debug output on failure
  const l = logs.slice().join('\n')
  console.log('PAGE LOGS:\n' + l)
})
