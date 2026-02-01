import { test, expect } from '@playwright/test'

test('full gradient flow: draw param auto -> discretize preview', async ({ page }) => {
  // capture console, network failures, and page errors for debugging
  const logs: string[] = []
  page.on('console', msg => {
    const t = msg.text()
    console.log('[PAGE CONSOLE]', t)
    logs.push('[CONSOLE] ' + t)
  })
  page.on('pageerror', err => {
    console.error('[PAGE ERROR]', err)
    logs.push('[PAGE ERROR] ' + String(err))
  })
  page.on('requestfailed', req => {
    const f = req.failure()
    console.log('[REQ FAILED]', req.method(), req.url(), f && f.errorText)
    logs.push('[REQ FAILED] ' + req.method() + ' ' + req.url() + ' ' + (f && f.errorText))
  })
  page.on('response', res => {
    if (!res.ok()) {
      console.log('[RESP NOT OK]', res.status(), res.url(), res.statusText())
      logs.push('[RESP] ' + res.status() + ' ' + res.url())
    }
  })

  // stub backend endpoints the app calls on startup
  await page.route('**/health', route => {
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }), headers: { 'Content-Type': 'application/json' } })
  })
  await page.route('**/api/backends/*', route => {
    route.fulfill({ status: 200, body: JSON.stringify({ capabilities: {} }), headers: { 'Content-Type': 'application/json' } })
  })
  await page.goto('/')

  // Wait for app to be ready and open material editor
  await page.waitForSelector('h2:has-text("Workspace")', { timeout: 60_000 })
  await page.waitForSelector('button:has-text("Manage materials")', { timeout: 15_000 })
  await page.locator('button:has-text("Manage materials")').click()
  await expect(page.locator('text=Material Editor')).toBeVisible({ timeout: 5000 })

  // Add material and set a fixed id
  await page.locator('text=Add').click()
  const modal = page.locator('h3:has-text("Material Editor")').locator('..')
  const idInput = modal.locator('label:has-text("ID") input')
  await idInput.fill('m-test')

  // Click Parameterize, hit Auto with defaults
  await modal.locator('button:has-text("Parameterize")').click()
  await modal.locator('button:has-text("Auto")').click()

  // Save materials and close modal
  await page.locator('text=Save materials').click()
  await expect(page.locator('text=Material Editor')).not.toBeVisible({ timeout: 2000 })

  // Wait for geometry to include a gradient that references our material id
  await page.waitForFunction(() => {
    return (window as any).__geometry && (window as any).__geometry.some((g: any) => g.shape === 'gradient' && g.materialId === 'm-test')
  })

  const geom = await page.evaluate(() => (window as any).__geometry.find((g: any) => g.shape === 'gradient' && g.materialId === 'm-test'))
  const geomKey = `${geom.id}:m-test`

  // Intercept backend expand_gradient_batch call and return fake results
  await page.route('**/materials/expand_gradient_batch', route => {
    const response = {
      results: { [geomKey]: [{ points: [[0,0],[1,0],[1,1]], color: 'rgba(1,2,3,0.5)' }] }
    }
    route.fulfill({ status: 200, body: JSON.stringify(response), headers: { 'Content-Type': 'application/json' } })
  })

  // Open discretize preview via select option
  const renderSelect = page.locator('label:has-text("Render")').nth(1).locator('select')
  await renderSelect.selectOption('discretize-preview')
  // Modal should appear (wait for the dialog header specifically to avoid selecting the option label)
  await expect(page.locator('h3:has-text("Discretize Preview")')).toBeVisible({ timeout: 5000 })

  // Click Fetch preview
  await page.locator('button:has-text("Fetch preview")').click()

  // Wait for indicator showing 'meep' backend to appear
  await expect(page.locator('text=Preview backend')).toBeVisible()
  await expect(page.locator('text=meep')).toBeVisible()

  // Click refresh and ensure it disappears
  await page.locator('button:has-text("Refresh preview")').click()
  await expect(page.locator('text=Preview backend')).not.toBeVisible()
})
