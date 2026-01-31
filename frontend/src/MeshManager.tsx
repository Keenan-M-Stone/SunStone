import { useState } from 'react'

export default function MeshManager({ meshAssets, setMeshAssets }:{ meshAssets:any[]; setMeshAssets: (m:any[])=>void }){
  const [qc, setQc] = useState<any | null>(null)

  async function upload(file: File|null){
    if (!file) return
    const fd = new FormData()
    fd.append('mesh', file)
    const res = await fetch('/api/meshes', { method:'POST', body: fd })
    if (!res.ok) { alert('Upload failed'); return }
    const data = await res.json()
    // Pull QC
    const qcRes = await fetch(`/api/meshes/${encodeURIComponent(data.id)}/qc`)
    if (qcRes.ok){
      const qcjson = await qcRes.json()
      setQc(qcjson.qc)
      // Use current meshAssets prop to append new asset (avoid functional setter typing issues)
      setMeshAssets([...meshAssets, { id: data.id, name: data.filename, size: data.size }])
    } else {
      alert('QC failed')
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h3>Meshes</h3>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <input type='file' accept='.obj,.stl,.msh' onChange={e=>upload(e.target.files?.[0] ?? null)} />
      </div>
      {qc && (
        <div style={{ marginTop:12 }}>
          <div>Format: {qc.format}</div>
          {qc.vertices !== undefined && <div>Vertices: {qc.vertices}</div>}
          {qc.faces !== undefined && <div>Faces: {qc.faces}</div>}
          {qc.triangles !== undefined && <div>Triangles: {qc.triangles}</div>}
        </div>
      )}
      {meshAssets.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong>Uploaded meshes</strong>
          {meshAssets.map(ma => <div key={ma.id} className="muted">{ma.name} ({ma.size} bytes)</div>)}
        </div>
      )}
    </div>
  )
}
