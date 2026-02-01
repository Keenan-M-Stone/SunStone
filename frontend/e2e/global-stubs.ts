import { test } from '@playwright/test'

// Global stubs to make E2E tests more deterministic in CI/local envs where the mock backend
// may not be available immediately. Individual tests may override these stubs if needed.

const fieldSnapshot = (() => {
  const w = 8, h = 8
  const data = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/4))
  const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos(i/6))
  const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/6))
  return { component: 'Ez', width: w, height: h, min: Math.min(...data), max: Math.max(...data), data, Ex, Ey }
})()

test.beforeEach(async ({ page }) => {
  // Default health stub (can be overridden per-test)
  await page.route('**/health', route => {
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }), headers: { 'Content-Type': 'application/json' } })
  })

  // Default run artifacts listing
  await page.route('**/runs/*/artifacts', route => {
    const req = route.request()
    const url = req.url()
    // If this looks like an artifact download (contains /artifacts/...), don't match here
    if (url.includes('/artifacts/')) return route.continue()
    if (req.method().toUpperCase() !== 'GET') return route.continue()
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artifacts: [
      { path: 'outputs/fields/field_snapshot.json', size_bytes: 123, mtime: Date.now() },
      { path: 'outputs/monitors/mon1.csv', size_bytes: 64, mtime: Date.now() }
    ] }) })
  })

  // Default artifact content handlers
  await page.route('**/runs/*/artifacts/**/field_snapshot.json', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fieldSnapshot) })
  })

  await page.route('**/runs/*/artifacts/**/mon1.csv', route => {
    const csv = 't,value\n0,0\n1e-15,1\n2e-15,0.5\n3e-15,0.2\n4e-15,0.1'
    route.fulfill({ status: 200, contentType: 'text/csv', body: csv })
  })
})
