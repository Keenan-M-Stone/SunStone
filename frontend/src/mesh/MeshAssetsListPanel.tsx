export default function MeshAssetsListPanel(props: {
  meshAssets: any[]
  setMeshAssets: (next: any) => void
}) {
  const { meshAssets, setMeshAssets } = props

  return (
    <>
      <h2>Meshes</h2>
      {meshAssets.length === 0 && <div className="muted">No mesh assets.</div>}
      {meshAssets.map((m) => (
        <div key={m.id} className="list-item">
          <div>
            <strong>{m.format}</strong> <span className="mono">{m.name}</span>
          </div>
          <div className="row compact">
            <button onClick={() => setMeshAssets((prev: any[]) => prev.filter((item) => item.id !== m.id))}>Remove</button>
          </div>
        </div>
      ))}
    </>
  )
}
