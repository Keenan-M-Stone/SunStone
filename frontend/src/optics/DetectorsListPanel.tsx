export default function DetectorsListPanel(props: {
  monitors: any[]
  isSelected: (id: string, type: any) => boolean
  setSelected: (id: string, type: any) => void
  setMonitors: (next: any) => void
}) {
  const { monitors, isSelected, setSelected, setMonitors } = props

  return (
    <>
      <h2>Detectors</h2>
      {monitors.length === 0 && <div className="muted">No detectors.</div>}
      {monitors.map((m) => (
        <div key={m.id} className={`list-item ${isSelected(m.id, 'monitor') ? 'active' : ''}`}>
          <div>
            <strong>{m.components.join(',')}</strong> <span className="mono">{m.id}</span>
          </div>
          <div className="row compact">
            <button onClick={() => setSelected(m.id, 'monitor')}>Edit</button>
            <button onClick={() => setMonitors((prev: any[]) => prev.filter((item) => item.id !== m.id))}>Remove</button>
          </div>
        </div>
      ))}
    </>
  )
}
