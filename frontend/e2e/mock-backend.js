const http = require('http')

const port = 8000

const server = http.createServer((req, res) => {
  const url = req.url || '/'
  console.log('mock-backend: incoming', req.method, url)
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method === 'POST' && url === '/materials/expand_gradient_batch') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      console.log('mock-backend: expand_gradient_batch body', body.slice(0, 400))
      let parsed = {}
      try { parsed = JSON.parse(body) } catch (e) {}
      const items = (parsed.items || [])
      const results = {}
      for (const it of items) {
        const key = it.key || ((it.geometry && it.geometry.id) ? `${it.geometry.id}:${(it.material && it.material.id) || 'm'}` : 'unknown')
        results[key] = [{ points: [[0,0],[1,0],[0,1]], color: 'rgba(10,20,30,1)' }]
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results }))
    })
    return
  }
  // simple echo for other POSTs
  if (req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      console.log('mock-backend: POST', url, body.slice(0,400))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    return
  }

  // Serve run artifacts for results e2e tests
  if (req.method === 'GET' && url.startsWith('/runs/') && url.includes('/artifacts')) {
    // list artifacts
    if (/^\/runs\/[^/]+\/artifacts$/.test(url)) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ artifacts: [
        { path: 'outputs/fields/field_snapshot.json', size_bytes: 123, mtime: Date.now() },
        { path: 'outputs/monitors/mon1.csv', size_bytes: 64, mtime: Date.now() }
      ] }))
      return
    }

    // artifact downloads (field snapshot JSON)
    if (url.endsWith('field_snapshot.json')) {
      const w = 8, h = 8
      const data = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/4))
      const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos(i/6))
      const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/6))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ component: 'Ez', width: w, height: h, min: Math.min(...data), max: Math.max(...data), data, Ex, Ey }))
      return
    }

    // Point-grid monitor artifacts: outputs/monitors/mon1_p{n}_field.json
    if (/_p\d+_field.json$/.test(url)) {
      const m = url.match(/([^/]+)_p(\d+)_field.json$/)
      if (m) {
        const idx = Number(m[2])
        const w = 4, h = 4
        const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos((i + idx)/6))
        const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin((i + idx)/6))
        const Ez = new Array(w*h).fill(0).map((_,i)=>Math.sin((i + idx)/4))
        const min = Math.min(...Ez), max = Math.max(...Ez)
        const payload = { width: w, height: h, Ex, Ey, Ez, data: Ez, min, max, dx: 1e-7, dy: 1e-7, origin: [0,0], orientation: 0 }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(payload))
        return
      }
    }

    // Planar monitor artifact (example): outputs/monitors/mon1_plane_field.json
    if (url.endsWith('mon1_plane_field.json')) {
      const w = 8, h = 8
      const Ex = new Array(w*h).fill(0).map((_,i)=>Math.cos(i/6))
      const Ey = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/6))
      const Ez = new Array(w*h).fill(0).map((_,i)=>Math.sin(i/4))
      const min = Math.min(...Ez), max = Math.max(...Ez)
      const payload = { width: w, height: h, Ex, Ey, Ez, data: Ez, min, max, dx: 1e-7, dy: 1e-7, origin: [0,0], orientation: 0 }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
      return
    }

    // CSV monitor downloads
    if (url.endsWith('.csv')) {
      const csv = 't,value\n0,0\n1e-15,1\n2e-15,0.5\n3e-15,0.2\n4e-15,0.1'
      res.writeHead(200, { 'Content-Type': 'text/csv' })
      res.end(csv)
      return
    }
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(port, () => {
  console.log('Mock backend listening on', port)
})

// Graceful shutdown
process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
