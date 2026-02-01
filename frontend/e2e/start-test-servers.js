import { spawn } from 'child_process'
import path from 'path'
import http from 'http'

function waitForHealth(url, timeout = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) return resolve()
        scheduleRetry()
      }).on('error', scheduleRetry)
    }
    const scheduleRetry = () => {
      if (Date.now() - start > timeout) return reject(new Error('timeout waiting for ' + url))
      setTimeout(tryOnce, 200)
    }
    tryOnce()
  })
}

// Start mock backend first
const mock = spawn(process.execPath, [path.join(process.cwd(), 'e2e', 'mock-backend.js')], { stdio: 'inherit' })

;(async () => {
  try {
    await waitForHealth('http://127.0.0.1:8000/health', 20000)
    console.log('Mock backend responsive; starting dev server')
  } catch (err) {
    console.error('Mock backend did not respond to /health:', err)
    // proceed anyway; dev server might still be helpful for debugging
  }

  // Start frontend dev server (vite)
  const dev = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true })

  function cleanup() {
    try { mock.kill('SIGTERM') } catch (e) {}
    try { dev.kill('SIGTERM') } catch (e) {}
  }

  process.on('exit', cleanup)
  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  // keep process alive
  setInterval(() => {}, 1000)
})()
