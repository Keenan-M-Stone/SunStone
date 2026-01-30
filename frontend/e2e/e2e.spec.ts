import { test, expect } from '@playwright/test'

const API_BASE = process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:8000'

test.describe('E2E smoke', () => {
  test('shows health alert when backend unreachable', async ({ page }) => {
    // Intercept the health check and return a 500 (match any host)
    await page.route('**/health', route => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'unreachable' }) })
    })

    await page.goto('/')

    // Ensure workspace is set to FDTD so Run panel and Dashboard are visible
    const modeSelect = page.locator('label:has-text("Mode") select')
    await modeSelect.selectOption('fdtd')

    // Dashboard performs health check on mount; wait for alert to appear
    await expect(page.locator('.dashboard-panel')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.dashboard-panel')).toContainText('Resource Monitor')
    await expect(page.locator('.dashboard-panel')).toContainText('Network/Backend error', { timeout: 8000 })
  })

  test('job stream shows error when EventSource fails', async ({ page }) => {
    // Mock EventSource to immediately trigger onerror
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.EventSource = class {
        onmessage: any
        onerror: any
        constructor(url: string) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'))
          }, 50)
        }
        close() {}
      }
    })

    await page.goto('/?e2e_job=1')

    // Ensure workspace mode is FDTD so Run panel is visible
    const modeSelect = page.locator('label:has-text("Mode") select')
    await modeSelect.selectOption('fdtd')

    // Set execution mode to SSH so job controls render in the e2e scenario
    const execSelect = page.locator('label:has-text("Execution Mode") select')
    await execSelect.waitFor({ state: 'visible', timeout: 5000 })
    await execSelect.selectOption('ssh')

    // Ensure run panel is visible and look for job controls inside it
    await page.waitForSelector('.run-panel', { timeout: 5000 })
    const panel = page.locator('.run-panel')

    // Start stream and expect to see a stream error message
    await panel.waitFor({ state: 'visible', timeout: 8000 })
    // Debugging: log location.search and run-panel innerText to help diagnose missing controls
    const locSearch = await page.evaluate(() => window.location.search)
    console.log('LOCATION_SEARCH='+locSearch)
    const rp_text = await page.evaluate(() => document.querySelector('.run-panel')?.innerText || '')
    console.log('RUN_PANEL_TEXT='+rp_text.slice(0,400))

    await panel.locator('text=Start stream').waitFor({ state: 'visible', timeout: 8000 })
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.run-panel button')).find(b => b.textContent?.trim() === 'Start stream')
      if (btn) (btn as HTMLButtonElement).click()
    })
    await expect(page.locator('text=Stream error')).toBeVisible({ timeout: 8000 })
  })
})
