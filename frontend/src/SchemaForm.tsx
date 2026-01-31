import { useEffect, useState } from 'react'

export default function SchemaForm({ schemaPath, value, onChange }:{ schemaPath: string; value: any; onChange: (v:any)=>void }){
  const [schema, setSchema] = useState<any | null>(null)
  useEffect(() => {
    async function fetchSchema(){
      try{
        const res = await fetch(`/api/schemas/${encodeURIComponent(schemaPath)}`)
        if (!res.ok) return
        const data = await res.json()
        setSchema(data)
      }catch(e){/* ignore */}
    }
    fetchSchema()
  },[schemaPath])

  if (!schema) return <div className="muted">No schema available</div>
  if (!schema.properties) return <div className="muted">Schema empty</div>

  return (
    <div>
      {Object.entries(schema.properties).map(([k, p]: any) => (
        <div key={k} style={{ marginBottom: 8 }}>
          <label style={{ display:'block' }}>{p.label || k}
            {p.type === 'number' && (
              <input type="number" value={value?.[k] ?? p.default ?? ''} onChange={e => onChange({ ...(value||{}), [k]: Number(e.target.value) })} />
            )}
            {p.type === 'enum' && (
              <select value={value?.[k] ?? p.default ?? ''} onChange={e => onChange({ ...(value||{}), [k]: e.target.value })}>
                {(p.values || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
            {p.type === 'file' && (
              <input type='file' onChange={() => {/* no-op: file upload handled separately */}} />
            )}
          </label>
        </div>
      ))}
    </div>
  )
}
