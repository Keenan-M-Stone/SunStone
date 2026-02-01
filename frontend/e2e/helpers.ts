import { Page } from '@playwright/test'

export function capturePageLogs(page: Page) {
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
  return logs
}

export async function stubHealth(page: Page, ok = true) {
  await page.route('**/health', route => {
    const status = ok ? 200 : 500
    route.fulfill({ status, body: JSON.stringify({ ok }), headers: { 'Content-Type': 'application/json' } })
  })
}

export async function stubBackends(page: Page, capabilities: Record<string, any> = {}) {
  await page.route('**/api/backends/*', route => {
    route.fulfill({ status: 200, body: JSON.stringify({ capabilities }), headers: { 'Content-Type': 'application/json' } })
  })
}

export async function stubExpandGradientBatch(page: Page, responder?: (items: any[]) => any) {
  await page.route('**/materials/expand_gradient_batch', async route => {
    const req = route.request()
    let body = ''
    try {
      body = await req.text()
    } catch (e) {
      body = ''
    }
    let parsed: any = {}
    try { parsed = JSON.parse(body) } catch (e) {}
    const items = parsed.items || []
    const defaultResponder = (its: any[]) => {
      const results: Record<string, any[]> = {}
      for (const it of its) {
        const key = it.key || ((it.geometry && it.geometry.id) ? `${it.geometry.id}:${(it.material && it.material.id) || 'm'}` : 'unknown')
        results[key] = [{ points: [[0,0],[1,0],[0,1]], color: 'rgba(10,20,30,1)' }]
      }
      return { results }
    }
    const payload = (responder ? responder(items) : defaultResponder(items))
    route.fulfill({ status: 200, body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } })
  })
}
