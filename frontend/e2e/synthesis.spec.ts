import { test, expect } from '@playwright/test'

// This E2E test uses the Playwright APIRequest to check backend endpoints.
// It expects the backend API to be reachable at PLAYWRIGHT_BASE_URL or SUNSTONE_API_BASE env var.

const BACKEND_BASE = process.env.SUNSTONE_API_BASE || 'http://127.0.0.1:8000'

test.describe('Synthesis backend e2e', () => {
  test('synthesis backend registered', async ({ request }) => {
    // use the global request fixture to call the backend directly
    const res = await request.get(`${BACKEND_BASE}/backends`)
    expect(res.ok(), 'GET /backends should respond').toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
    const hasSynth = (data as any[]).some(b => b.name === 'synthesis')
    expect(hasSynth, 'synthesis backend should be listed').toBeTruthy()

    const res2 = await request.get(`${BACKEND_BASE}/backends/synthesis`)
    expect(res2.ok(), 'GET /backends/synthesis should respond 200').toBeTruthy()
    const caps = await res2.json()
    expect(caps.name).toBe('synthesis')
  })
})
