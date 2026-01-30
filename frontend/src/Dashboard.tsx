import React, { useEffect, useRef, useState } from 'react';
import { getResourceUsage, getRunMetrics, getHostMetrics } from './resourceApi';
import ResourceMonitor from './ResourceMonitor';

interface ResourceDatum {
  timestamp: number;
  cpu_percent: number;
  memory_rss: number;
  memory_vms: number;
  memory_percent: number;
}

interface DashboardProps {
  runId: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({ runId }) => {
  const [resourceData, setResourceData] = useState<ResourceDatum[]>([]);
  const [view, setView] = useState<'graph' | 'table' | 'host'>('graph');
  const [hostSnapshot, setHostSnapshot] = useState<any | null>(null);
  const resourceTimer = useRef<number | null>(null);

  // Health polling
  const [health, setHealth] = useState<{ ok: boolean } | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const healthTimer = useRef<number | null>(null)
  const [showHealthAlert, setShowHealthAlert] = useState(true)

  useEffect(() => {
    let mounted = true
    async function checkHealth() {
      try {
        const h = await (await import('./sunstoneApi')).getHealth()
        if (!mounted) return
        setHealth(h)
        setHealthError(null)
      } catch (e: any) {
        if (!mounted) return
        setHealth(null)
        setHealthError(e?.message ?? String(e))
      }
    }
    checkHealth()
    healthTimer.current = window.setInterval(checkHealth, 5000)
    return () => { mounted = false; if (healthTimer.current) clearInterval(healthTimer.current) }
  }, [])

  useEffect(() => {
    if (!runId || view === 'host') {
      setResourceData([]);
      if (resourceTimer.current) {
        clearInterval(resourceTimer.current);
      }
      return;
    }
    resourceTimer.current = setInterval(async () => {
      // Prefer metrics API if available
      const dataArr = await getRunMetrics(runId) || await getResourceUsage(runId);
      const data = Array.isArray(dataArr) && dataArr.length > 0 ? dataArr[dataArr.length - 1] : null;
      if (data) {
        // Normalize keys for display
        const norm = {
          timestamp: data.timestamp || data.ts || Date.now()/1000,
          cpu_percent: data.proc_cpu_percent ?? data.cpu_percent ?? data.cpu_system_percent ?? 0,
          memory_rss: data.proc_memory_rss ?? data.memory_rss ?? 0,
          memory_vms: data.memory_vms ?? 0,
          memory_percent: data.memory_percent ?? 0,
        }
        setResourceData((prev) => {
          const last = prev[prev.length - 1];
          const changed = !last || last.cpu_percent !== norm.cpu_percent || last.memory_rss !== norm.memory_rss;
          if (!changed) return prev;
          const next = [...prev, norm];
          const maxPoints = 200;
          if (next.length > maxPoints) return next.slice(next.length - maxPoints);
          return next;
        });
      }
    }, 2000);
    return () => {
      if (resourceTimer.current) {
        clearInterval(resourceTimer.current);
      }
    };
  }, [runId, view]);

  useEffect(() => {
    async function fetchHost() {
      const h = await getHostMetrics();
      setHostSnapshot(h);
    }
    if (view === 'host') fetchHost();
  }, [view]);

  return (
    <div className="dashboard-panel">
      <h2>Resource Monitor</h2>
      {healthError && showHealthAlert && (
        <div style={{ background: '#fee', border: '1px solid #f99', padding: 8, marginBottom: 8 }}>
          <strong>Network/Backend error:</strong> {healthError}. Is the backend running at <code>{(window as any).__SUNSTONE_API_BASE || 'http://127.0.0.1:8000'}</code>? <button onClick={() => setShowHealthAlert(false)} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 6, background: health && health.ok ? '#2ecc71' : (healthError ? '#e74c3c' : '#555'), marginRight: 8 }} title={health && health.ok ? 'Backend healthy' : (healthError ? 'Backend error' : 'Unknown')} />
        <strong>Backend</strong>: {health && health.ok ? 'OK' : (healthError ? 'Error' : 'Unknown')}
      </div>
      {resourceData.length === 0 ? (
        <div className="muted">No resource data yet.</div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <button onClick={() => setView('graph')} disabled={view === 'graph'}>Graph</button>
            <button onClick={() => setView('table')} disabled={view === 'table'} style={{ marginLeft: 8 }}>Table</button>
            <button onClick={() => setView('host')} disabled={view === 'host'} style={{ marginLeft: 8 }}>Host</button>
          </div>
          {view === 'graph' ? (
            <ResourceMonitor runId={runId} />
          ) : view === 'table' ? (
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              <table className="resource-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>CPU %</th>
                    <th>Memory (RSS)</th>
                    <th>Memory (VMS)</th>
                    <th>Memory %</th>
                  </tr>
                </thead>
                <tbody>
                  {resourceData.slice(-200).reverse().map((row, i) => (
                    <tr key={i}>
                      <td>{new Date(row.timestamp * 1000).toLocaleTimeString()}</td>
                      <td>{row.cpu_percent.toFixed(1)}</td>
                      <td>{(row.memory_rss / 1e6).toFixed(1)} MB</td>
                      <td>{(row.memory_vms / 1e6).toFixed(1)} MB</td>
                      <td>{row.memory_percent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <h4>Host snapshot</h4>
              {hostSnapshot ? (
                <div>
                  <div>CPU: {hostSnapshot.cpu_percent}%</div>
                  <div>Memory: {(hostSnapshot.memory_total/1e9).toFixed(2)} GB total, {(hostSnapshot.memory_available/1e9).toFixed(2)} GB available</div>
                  <div>GPUs: {hostSnapshot.gpus ? hostSnapshot.gpus.map((g:any) => `${g.name} (load ${(g.load*100).toFixed(0)}%)`).join(', ') : 'None detected'}</div>
                </div>
              ) : (
                <div className="muted">No host snapshot available</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
