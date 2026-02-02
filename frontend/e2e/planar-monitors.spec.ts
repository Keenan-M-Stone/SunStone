import { test, expect } from '@playwright/test'

// Ensure ResultsPanel handles both plane artifacts and expanded point-grid artifacts

test('results panel shows plane artifact and vectors', async ({ page }) => {
  await page.route('**/runs/*/artifacts', (route) => {
    const req = route.request()
    const url = req.url()
    if (url.includes('/artifacts/')) return route.continue()
    if (req.method().toUpperCase() !== 'GET') return route.continue()
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artifacts: [
      { path: 'outputs/monitors/mon1_plane_field.json', size_bytes: 2048, mtime: Date.now() },
      { path: 'outputs/monitors/mon1.csv', size_bytes: 64, mtime: Date.now() }
    ] }) })
  })

  await page.route('**/runs/*/artifacts/**/mon1_plane_field.json', (route) => {
    const w = 8, h = 8
    const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos(i/6))
    const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/6))
    const Ez = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/4))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ width: w, height: h, Ex, Ey, Ez, data: Ez, min: Math.min(...Ez), max: Math.max(...Ez) }) })
  })

  // Basic project/run stubs
  await page.route('**/projects', (route) => { const req = route.request(); if (req.method().toUpperCase() === 'POST') route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'p1', name: 'p' }) }); else route.continue() })
  await page.route('**/projects/*/runs', (route) => { const req = route.request(); if (req.method().toUpperCase() === 'POST') route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'r1', project_id: 'p1', status: 'running' }) }); else route.continue() })
  await page.route('**/runs/*', (route) => { const req = route.request(); if (req.method().toUpperCase() === 'GET') { const url = req.url(); if (url.includes('/artifacts')) return route.continue(); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'r1', project_id: 'p1', status: 'running' }) }) } else route.continue() })

  await page.goto('/')
  await page.locator('label:has-text("Mode") select').selectOption('fdtd')
  await page.locator('label:has-text("Name") input').fill('planar-test')
  await page.locator('section.panel.tools .row button:has-text("Create")').first().click()
  await page.locator('button:has-text("Create Run")').click()

  // Enable Live Preview and refresh
  await page.locator('.results-panel label:has-text("Live Preview") input').check()
  await page.locator('.results-panel button:has-text("Refresh artifacts")').click()

  await page.locator('button:has-text("mon1_plane_field.json")').waitFor({ timeout: 2000 })
  await page.locator('button:has-text("mon1_plane_field.json")').click()
  await page.locator('.results-panel svg rect').first().waitFor({ timeout: 5000 })
  await page.locator('.results-panel label:has-text("Show vectors") input').check()
  await expect(page.locator('.results-panel svg line').first()).toBeVisible()
})


test('results panel shows expanded point-grid artifacts', async ({ page }) => {
  await page.route('**/runs/*/artifacts', (route) => {
    const req = route.request()
    const url = req.url()
    if (url.includes('/artifacts/')) return route.continue()
    if (req.method().toUpperCase() !== 'GET') return route.continue()
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artifacts: [
      { path: 'outputs/monitors/mon1_p0_field.json', size_bytes: 512, mtime: Date.now() },
      { path: 'outputs/monitors/mon1_p1_field.json', size_bytes: 512, mtime: Date.now() },
      { path: 'outputs/monitors/mon1.csv', size_bytes: 64, mtime: Date.now() }
    ] }) })
  })

  await page.route('**/runs/*/artifacts/**/mon1_p0_field.json', (route) => {
    const w = 4, h = 4
    const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos(i/6))
    const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/6))
    const Ez = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/4))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ width: w, height: h, Ex, Ey, Ez, data: Ez, min: Math.min(...Ez), max: Math.max(...Ez) }) })
  })

  await page.route('**/runs/*/artifacts/**/mon1_p1_field.json', (route) => {
    const w = 4, h = 4
    const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos((i+1)/6))
    const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin((i+1)/6))
    const Ez = new Array(w*h).fill(0).map((_,i)=>Math.sin((i+1)/4))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ width: w, height: h, Ex, Ey, Ez, data: Ez, min: Math.min(...Ez), max: Math.max(...Ez) }) })
  })

  // Basic project/run stubs
  await page.route('**/projects', (route) => { const req = route.request(); if (req.method().toUpperCase() === 'POST') route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'p1', name: 'p' }) }); else route.continue() })
  await page.route('**/projects/*/runs', (route) => { const req = route.request(); if (req.method().toUpperCase() === 'POST') route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'r1', project_id: 'p1', status: 'running' }) }); else route.continue() })
  await page.route('**/runs/*', (route) => { const req = route.request(); if (req.method().toUpperCase() === 'GET') { const url = req.url(); if (url.includes('/artifacts')) return route.continue(); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'r1', project_id: 'p1', status: 'running' }) }) } else route.continue() })

  await page.goto('/')
  await page.locator('label:has-text("Mode") select').selectOption('fdtd')
  await page.locator('label:has-text("Name") input').fill('planar-test-points')
  await page.locator('section.panel.tools .row button:has-text("Create")').first().click()
  await page.locator('button:has-text("Create Run")').click()

  await page.locator('.results-panel label:has-text("Live Preview") input').check()
  await page.locator('.results-panel button:has-text("Refresh artifacts")').click()

  await page.locator('button:has-text("mon1_p0_field.json")').waitFor({ timeout: 2000 })
  await page.locator('button:has-text("mon1_p0_field.json")').click()
  await page.locator('.results-panel svg rect').first().waitFor({ timeout: 5000 })
  await page.locator('.results-panel label:has-text("Show vectors") input').check()
  await expect(page.locator('.results-panel svg line').first()).toBeVisible()
})
