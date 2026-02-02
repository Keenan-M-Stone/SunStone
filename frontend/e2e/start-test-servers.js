import { spawn } from 'child_process'
import path from 'path'
import http from 'http'

function waitForHealth(url, timeout = Number(process.env.PLAYWRIGHT_HEALTH_TIMEOUT) || 30000) {
  const start = Date.now()
  console.log(`[start-test-servers] waiting for ${url} up to ${timeout} ms (started at ${new Date().toISOString()})`)
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          console.log(`[start-test-servers] ${url} responded OK at ${new Date().toISOString()} (elapsed ${Date.now()-start} ms)`)
          return resolve()
        }
        scheduleRetry()
      }).on('error', (err) => { /* log error then retry */ console.log(`[start-test-servers] health check error: ${String(err)}`); scheduleRetry() })
    }
    const scheduleRetry = () => {
      if (Date.now() - start > timeout) {
        console.log(`[start-test-servers] timeout waiting for ${url} after ${Date.now()-start} ms`)
        return reject(new Error('timeout waiting for ' + url))
      }
      setTimeout(tryOnce, 200)
    }
    tryOnce()
  })
}

// Start mock backend first
const mock = spawn(process.execPath, [path.join(process.cwd(), 'e2e', 'mock-backend.cjs')], { stdio: 'inherit' })

;(async () => {
  try {
    await waitForHealth('http://127.0.0.1:8000/health', Number(process.env.PLAYWRIGHT_HEALTH_TIMEOUT) || 20000)
    console.log(`[start-test-servers] Mock backend responsive at ${new Date().toISOString()}; starting dev server`)
  } catch (err) {
    console.error('[start-test-servers] Mock backend did not respond to /health:', err)
    // proceed anyway; dev server might still be helpful for debugging
  }

  // Start frontend dev server (vite)
  console.log(`[start-test-servers] starting frontend dev server at ${new Date().toISOString()}`)
  const dev = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true })

  function cleanup() {
    console.log('[start-test-servers] cleanup: shutting down child processes at', new Date().toISOString())
    try { mock.kill('SIGTERM') } catch (e) {}
    try { dev.kill('SIGTERM') } catch (e) {}
  }

  process.on('exit', cleanup)
  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  // keep process alive
  setInterval(() => {}, 1000)
})()
