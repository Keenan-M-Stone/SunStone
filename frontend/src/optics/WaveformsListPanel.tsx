export default function WaveformsListPanel(props: {
  waveforms: any[]
  setWaveforms: (next: any) => void
}) {
  const { waveforms, setWaveforms } = props

  return (
    <>
      <h2>Waveforms</h2>
      {waveforms.length === 0 && <div className="muted">No waveforms.</div>}
      {waveforms.map((w) => (
        <div key={w.id} className="list-item">
          <div>
            <strong>{w.kind}</strong> <span className="mono">{w.label}</span>
          </div>
          <div className="row compact">
            <button onClick={() => setWaveforms((prev: any[]) => prev.filter((item) => item.id !== w.id))}>Remove</button>
          </div>
        </div>
      ))}
    </>
  )
}
