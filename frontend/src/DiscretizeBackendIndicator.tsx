export default function DiscretizeBackendIndicator({ backend, onRefresh }:{ backend: string | null; onRefresh: (backend: string) => void }) {
  if (!backend) return null
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
      <div className="muted">Preview backend</div>
      <div style={{ fontFamily: 'monospace' }}>{backend}</div>
      <div style={{ marginLeft: 'auto' }}>
        <button onClick={() => onRefresh(backend)} style={{ marginLeft: 8 }}>Refresh preview</button>
      </div>
    </div>
  )
}
