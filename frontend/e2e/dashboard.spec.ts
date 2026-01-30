import { test, expect } from '@playwright/test'

// This test checks that the Dashboard shows a healthy backend, then displays the health alert
// when the /health endpoint returns an error.

test('dashboard shows health and responds to backend error', async ({ page }) => {
  // Intercept the /health endpoint: first reply OK, then reply 500 for subsequent requests
  let callCount = 0
  await page.route('**/health', (route) => {
    callCount += 1
    if (callCount === 1) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    } else {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'error' }) })
    }
  })

  await page.goto('/')

  // Ensure Run panel is visible by switching workspace mode to fdtd
  const modeSelect = page.locator('label:has-text("Mode") select')
  await modeSelect.selectOption('fdtd')

  // Wait for the dashboard header and the healthy indicator text within the dashboard panel
  await expect(page.locator('.dashboard-panel h2')).toContainText('Resource Monitor')
  await expect(page.locator('.dashboard-panel strong').filter({ hasText: 'Backend' })).toHaveText(/Backend/)

// Dashboard should show some backend status (OK/Unknown/Error)
  await expect(page.locator('.dashboard-panel')).toContainText('Backend:', { timeout: 8000 })

  // Wait enough time for the second health poll to occur (poll interval is 5s in code)
  // We'll wait up to 8s for the alert to show
  await expect(page.locator('text=Network/Backend error:'), { timeout: 8000 }).toBeVisible()
  
  // Alert should contain backend URL helper text
  await expect(page.locator('text=Is the backend running')).toBeVisible()

  // Alert should contain backend URL helper text
  await expect(page.locator('text=Is the backend running')).toBeVisible()
})
