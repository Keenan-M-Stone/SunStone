import React, { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getResourceUsage } from './resourceApi';

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
  const resourceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!runId) {
      setResourceData([]);
      if (resourceTimer.current) {
        clearInterval(resourceTimer.current);
      }
      return;
    }
    resourceTimer.current = setInterval(async () => {
      const dataArr = await getResourceUsage(runId);
      const data = Array.isArray(dataArr) && dataArr.length > 0 ? dataArr[dataArr.length - 1] : null;
      if (data) setResourceData((prev) => [...prev, data]);
    }, 2000);
    return () => {
      if (resourceTimer.current) {
        clearInterval(resourceTimer.current);
      }
    };
  }, [runId]);

  return (
    <div className="dashboard-panel">
      <h2>Resource Monitor</h2>
      {resourceData.length === 0 ? (
        <div className="muted">No resource data yet.</div>
      ) : (
        <>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={resourceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <XAxis dataKey="timestamp" tickFormatter={t => new Date(t * 1000).toLocaleTimeString()} />
                <YAxis yAxisId="left" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${(v / 1e6).toFixed(0)} MB`} />
                <Tooltip formatter={(v, n) => n && n.toString().includes('memory') ? `${(v as number / 1e6).toFixed(1)} MB` : `${v}%`} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="cpu_percent" stroke="#8884d8" name="CPU %" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="memory_rss" stroke="#82ca9d" name="Memory RSS" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
              {resourceData.slice(-10).map((row, i) => (
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
        </>
      )}
    </div>
  );
};

export default Dashboard;
