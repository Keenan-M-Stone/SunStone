import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { getRunMetrics, getHostMetrics } from './resourceApi'

interface ResourceMonitorProps {
  runId: string | null
}

const ResourceMonitor: React.FC<ResourceMonitorProps> = ({ runId }) => {
  const [samples, setSamples] = useState<any[]>([])
  const [host, setHost] = useState<any | null>(null)

  useEffect(() => {
    let t: number | null = null
    async function poll() {
      if (!runId) return
      const arr = await getRunMetrics(runId)
      setSamples(arr.slice(-200))
    }
    if (runId) {
      poll()
      t = window.setInterval(poll, 1500)
    }
    return () => { if (t) clearInterval(t) }
  }, [runId])

  useEffect(() => {
    let t: number | null = null
    async function fetchHost() {
      const h = await getHostMetrics()
      setHost(h)
    }
    fetchHost()
    t = window.setInterval(fetchHost, 5000)
    return () => { if (t) clearInterval(t) }
  }, [])

  // derive per-core series if available
  const cpuCoreLines = (() => {
    if (!samples || samples.length === 0) return [] as any[]
    const last = samples[samples.length - 1]
    const per = last.cpu_per_core || last.cpu_per_core_percent || null
    if (!per || !Array.isArray(per)) return [] as any[]
    // Build series per core over samples
    const cores = per.map((_: any, idx: number) => ({ key: `core_${idx}`, idx }))
    const series = cores.map(c => ({ key: c.key, data: samples.map(s => ({ t: s.timestamp, v: (s.cpu_per_core && s.cpu_per_core[c.idx]) || 0 })) }))
    return series
  })()

  return (
    <div className="resource-monitor">
      <h3>Job Metrics</h3>
      {(!samples || samples.length === 0) ? (
        <div className="muted">No metrics available yet for this run.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={samples} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <XAxis dataKey="timestamp" tickFormatter={(t: number) => new Date(t * 1000).toLocaleTimeString()} />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="proc_cpu_percent" stroke="#8884d8" name="Process CPU %" dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="proc_memory_rss" stroke="#82ca9d" name="Process RSS" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={samples} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <XAxis dataKey="timestamp" tickFormatter={(t: number) => new Date(t * 1000).toLocaleTimeString()} />
                <YAxis />
                <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} />
                <Legend />
                <Line dataKey="disk_read_bytes" stroke="#ff7300" name="Disk read" dot={false} />
                <Line dataKey="disk_write_bytes" stroke="#387908" name="Disk write" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ gridColumn: '1 / span 2', width: '100%', height: 220 }}>
            <h4>Per-core CPU (if available)</h4>
            {cpuCoreLines.length === 0 ? (
              <div className="muted">Per-core CPU not available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={samples} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <XAxis dataKey="timestamp" tickFormatter={(t: number) => new Date(t * 1000).toLocaleTimeString()} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  {cpuCoreLines.map((s, i) => (
                    <Line key={s.key} dataKey={(d:any) => (d.cpu_per_core && d.cpu_per_core[i]) || 0} stroke={i % 2 ? '#d88884' : '#8884d8'} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ gridColumn: '1 / span 2' }}>
            <h4>GPU Info</h4>
            {(!samples || !samples[0] || !samples[0].gpus) ? (
              <div className="muted">No GPU info available.</div>
            ) : (
              <BarChart width={600} height={200} data={(samples[samples.length-1].gpus || []).map((g:any) => ({ name: g.name, load: (g.load||0) * 100 }))}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="load" fill="#8884d8" />
              </BarChart>
            )}
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 14 }}>Host Snapshot</h3>
      {host ? (
        <div>
          <div>CPU system: {host.cpu_percent}%</div>
          <div>Memory: {(host.memory_total/1e9).toFixed(2)} GB total, {(host.memory_available/1e9).toFixed(2)} GB available</div>
          <div>GPUs: {host.gpus ? host.gpus.map((g:any) => `${g.name} (load ${(g.load*100).toFixed(0)}%)`).join(', ') : 'None detected'}</div>
        </div>
      ) : (
        <div className="muted">No host snapshot</div>
      )}
    </div>
  )
}

export default ResourceMonitor
