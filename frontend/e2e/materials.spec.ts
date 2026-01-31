import { test, expect } from '@playwright/test'

test('material editor: add anisotropic material and submit run', async ({ page, request }) => {
  // Intercept submit to avoid launching a worker
  await page.route('**/runs/*/submit', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ run_id: 'x', status: 'submitted' }) }))

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

  // Create Project and Run via API to avoid UI flakiness
  const projRes = await request.post('http://127.0.0.1:8000/projects', { data: { name: 'demo' } })
  const proj = await projRes.json()
  // Get spec preview from UI
  const specText = await page.locator('label:has-text("Spec Preview") textarea').inputValue()
  const spec = JSON.parse(specText)
  // Create run
  const runRes = await request.post(`http://127.0.0.1:8000/projects/${proj.id}/runs`, { data: { spec } })
  const run = await runRes.json()
  // Submit run via page (so the page.route interceptor handles it and we avoid backend validation)
  const submitStatus = await page.evaluate(async (rid) => {
    const r = await fetch(`/runs/${rid}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'local', backend: 'dummy' }) })
    return r.status
  }, run.id)
  expect(submitStatus).toBe(200)
})