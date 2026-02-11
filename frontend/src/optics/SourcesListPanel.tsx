export default function SourcesListPanel(props: {
  sources: any[]
  isSelected: (id: string, type: any) => boolean
  setSelected: (id: string, type: any) => void
  setSources: (next: any) => void
}) {
  const { sources, isSelected, setSelected, setSources } = props

  return (
    <>
      <h2>Sources</h2>
      {sources.length === 0 && <div className="muted">No sources.</div>}
      {sources.map((s) => (
        <div key={s.id} className={`list-item ${isSelected(s.id, 'source') ? 'active' : ''}`}>
          <div>
            <strong>{s.component}</strong> <span className="mono">{s.id}</span>
          </div>
          <div className="row compact">
            <button onClick={() => setSelected(s.id, 'source')}>Edit</button>
            <button onClick={() => setSources((prev: any[]) => prev.filter((item) => item.id !== s.id))}>Remove</button>
          </div>
        </div>
      ))}
    </>
  )
}
