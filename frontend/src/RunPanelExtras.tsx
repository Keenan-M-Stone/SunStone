import React, { useState, useEffect } from 'react'
import { getRunJobStatus, cancelRunJob } from './sunstoneApi'
import { apiBaseUrl } from './config'

export function PresetButtons({ onSave, onLoad }: { onSave: () => void; onLoad: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <button onClick={() => onSave()}>Save preset</button>
      <button onClick={() => onLoad()}>Load preset</button>
    </div>
  )
}

export function SSHOptions({ sshOptions, setSshOptions }: { sshOptions: Record<string, any> | null; setSshOptions: (o: Record<string, any>) => void }) {
  const [port, setPort] = useState<number | ''>(sshOptions?.port ?? '')
  const [identityFile, setIdentityFile] = useState<string>(sshOptions?.identity_file ?? '')
  const [extra, setExtra] = useState<string>(sshOptions?.extra ?? '')
  const [agentForwarding, setAgentForwarding] = useState<boolean>(sshOptions?.agent_forwarding ?? false)
  const [strictHostKeyChecking, setStrictHostKeyChecking] = useState<boolean | null>(sshOptions?.strict_host_key_checking ?? null)
  const [knownHostsFile, setKnownHostsFile] = useState<string>(sshOptions?.known_hosts_file ?? '')

  useEffect(() => {
    setPort(sshOptions?.port ?? '')
    setIdentityFile(sshOptions?.identity_file ?? '')
    setExtra(sshOptions?.extra ?? '')
    setAgentForwarding(sshOptions?.agent_forwarding ?? false)
    setStrictHostKeyChecking(sshOptions?.strict_host_key_checking ?? null)
    setKnownHostsFile(sshOptions?.known_hosts_file ?? '')
  }, [sshOptions])

  useEffect(() => {
    const obj: Record<string, any> = {}
    if (port !== '') obj.port = Number(port)
    if (identityFile) obj.identity_file = identityFile
    if (extra) obj.extra = extra
    if (agentForwarding) obj.agent_forwarding = true
    // strict_host_key_checking: null means leave default, true/false set explicitly
    if (strictHostKeyChecking !== null) obj.strict_host_key_checking = strictHostKeyChecking
    if (knownHostsFile) obj.known_hosts_file = knownHostsFile
    setSshOptions(obj)
  }, [port, identityFile, extra, agentForwarding, strictHostKeyChecking, knownHostsFile])

  return (
    <div style={{ marginTop: 8, padding: 8, border: '1px solid #333', borderRadius: 6, background: '#0f0f10' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>SSH options</div>
      <label style={{ display: 'block' }}>Port
        <input type="number" value={port as any} onChange={e => setPort(e.target.value === '' ? '' : Number(e.target.value))} placeholder="22" />
      </label>
      <label style={{ display: 'block' }}>Identity file
        <input value={identityFile} onChange={e => setIdentityFile(e.target.value)} placeholder="/home/user/.ssh/id_rsa" />
      </label>
      <label style={{ display: 'block' }}>Extra SSH args
        <input value={extra} onChange={e => setExtra(e.target.value)} placeholder="-o StrictHostKeyChecking=no" />
      </label>
      <label style={{ display: 'block' }}>
        <input type="checkbox" checked={agentForwarding} onChange={e => setAgentForwarding(e.target.checked)} /> Enable agent forwarding (-A)
      </label>
      <label style={{ display: 'block' }}>
        <select value={strictHostKeyChecking === null ? 'default' : strictHostKeyChecking ? 'strict' : 'no'} onChange={e => setStrictHostKeyChecking(e.target.value === 'default' ? null : e.target.value === 'strict')}>
          <option value="default">Use system default host key checking</option>
          <option value="strict">Enforce strict host key checking</option>
          <option value="no">Disable StrictHostKeyChecking (insecure)</option>
        </select>
      </label>
      <label style={{ display: 'block' }}>Known hosts file
        <input value={knownHostsFile} onChange={e => setKnownHostsFile(e.target.value)} placeholder="/home/user/.ssh/known_hosts" />
      </label>
    </div>
  )
}

export function JobControls({ runId }: { runId: string }) {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamData, setStreamData] = useState<any>(null)
  const [es, setEs] = useState<EventSource | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await getRunJobStatus(runId)
      setStatus(data)
    } catch (e) {
      setStatus({ error: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const doCancel = async () => {
    if (!confirm('Cancel job on host?')) return
    setBusy(true)
    try {
      await cancelRunJob(runId)
      await refresh()
      alert('Cancel requested')
    } catch (e) {
      alert('Failed to cancel job: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  const startStream = () => {
    if (es) return
    setStreamError(null)
    const src = new EventSource(`${apiBaseUrl}/runs/${encodeURIComponent(runId)}/job/stream?interval=1`)
    src.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data)
        setStreamData(d)
      } catch (e) {
        // ignore parse errors
      }
    }
    src.onerror = (ev) => {
      // EventSource gives limited info; report general guidance
      const msg = 'Streaming connection error. Check network and that the backend is reachable.'
      setStreamError(msg)
      try { src.close() } catch (e) {}
      setEs(null)
      setStreaming(false)
    }
    setEs(src)
    setStreaming(true)
  }

  const stopStream = () => {
    if (!es) return
    es.close()
    setEs(null)
    setStreaming(false)
    setStreamError(null)
  }

  useEffect(() => { refresh() }, [runId])

  return (
    <div style={{ marginTop: 8, padding: 8, border: '1px solid #333', borderRadius: 6, background: '#0f0f10' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
          Job
          <span style={{ width: 10, height: 10, borderRadius: 6, background: streaming ? '#2ecc71' : (streamError ? '#e74c3c' : '#555') }} title={streaming ? 'Streaming active' : (streamError ? streamError : 'No stream')} />
        </div>
        <button onClick={refresh} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        <button onClick={doCancel} disabled={busy}>{busy ? 'Canceling...' : 'Cancel job'}</button>
        {!streaming ? (
          <button onClick={startStream}>Start stream</button>
        ) : (
          <button onClick={stopStream}>Stop stream</button>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        {streamError && (
          <div style={{ color: '#e57373', marginBottom: 8 }}>
            <strong>Stream error:</strong> {streamError}
          </div>
        )}
        {streamData ? (
          <div>
            <div style={{ fontWeight: 700 }}>Live</div>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(streamData, null, 2)}</pre>
          </div>
        ) : status ? (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(status, null, 2)}</pre>
        ) : (
          <div style={{ color: '#a9a9a9' }}>No job information available</div>
        )}
      </div>
    </div>
  )
}
