import { useState } from 'react'

export default function WaveformEditor({ waveforms, setWaveforms, onClose }:
  { waveforms: any[]; setWaveforms: (w: any[]) => void; onClose: () => void }) {
  void waveforms
  const [local, setLocal] = useState(() => waveforms.map(w => ({ ...w })))
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  function addWaveform(kind: string) {
    const id = 'wf-' + Math.random().toString(36).slice(2, 8)
    const base = { id, label: id, kind, data: {} }
    if (kind === 'gaussian') base.data = { center_freq: 1e14, fwidth: 1e13 }
    if (kind === 'toneburst') base.data = { freq: 1e14, cycles: 5 }
    if (kind === 'chirp') base.data = { f0: 1e14, f1: 2e14, duration: 1e-13 }
    setLocal(prev => {
      const idx = prev.length
      const next = [...prev, base]
      setEditingIndex(idx)
      return next
    })
  }

  function update(idx: number, changes: any) { setLocal(prev => prev.map((m,i)=> i===idx?{...m,...changes}:m)) }
  function remove(idx:number){ setLocal(prev=>prev.filter((_,i)=>i!==idx)); setEditingIndex(null)}
  function save(){ setWaveforms(local); onClose() }

  return (
    <div style={{ position:'fixed', left:0,right:0,top:0,bottom:0,zIndex:1200, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:800, maxHeight:'80vh', overflow:'auto', background:'#0b0b10', color:'#e8e8e8', padding:18, borderRadius:8 }}>
        <h3 style={{marginTop:0}}>Waveform Editor</h3>
        <div style={{ display:'flex', gap:12 }}>
          <div style={{ width:300 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div><strong>Waveforms</strong></div>
              <div>
                <button onClick={()=>addWaveform('gaussian')}>Add Gaussian</button>
                <button onClick={()=>addWaveform('toneburst')} style={{ marginLeft:8 }}>Add Toneburst</button>
                <button onClick={()=>addWaveform('chirp')} style={{ marginLeft:8 }}>Add Chirp</button>
              </div>
            </div>
            <div style={{ marginTop:12 }}>
              {local.map((w,i)=> (
                <div key={w.id} style={{ padding:6, borderRadius:6, background: i===editingIndex ? 'rgba(255,255,255,0.02)' : 'transparent', display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ flex:1 }}>
                    <div className="mono">{w.id}</div>
                    <div className="muted">{w.label}</div>
                  </div>
                  <div>
                    <button onClick={()=>setEditingIndex(i)}>Edit</button>
                    <button onClick={()=>remove(i)} style={{ marginLeft:8 }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex:1 }}>
            {editingIndex === null ? <div className='muted'>Select a waveform to edit</div> : (()=>{
              const w = local[editingIndex]
              return (
                <div>
                  <label>ID<input value={w.id} onChange={e=>update(editingIndex,{id:e.target.value})} /></label>
                  <label>Label<input value={w.label || ''} onChange={e=>update(editingIndex,{label:e.target.value})} /></label>
                  <div style={{ marginTop:8 }}>
                    {w.kind === 'gaussian' && (
                      <div style={{ display:'flex', gap:8 }}>
                        <label>center_freq<input type='number' value={w.data.center_freq} onChange={e=>update(editingIndex,{data:{...w.data, center_freq:Number(e.target.value)}})} /></label>
                        <label>fwidth<input type='number' value={w.data.fwidth} onChange={e=>update(editingIndex,{data:{...w.data, fwidth:Number(e.target.value)}})} /></label>
                      </div>
                    )}
                    {w.kind === 'toneburst' && (
                      <div style={{ display:'flex', gap:8 }}>
                        <label>freq<input type='number' value={w.data.freq} onChange={e=>update(editingIndex,{data:{...w.data, freq:Number(e.target.value)}})} /></label>
                        <label>cycles<input type='number' value={w.data.cycles} onChange={e=>update(editingIndex,{data:{...w.data, cycles:Number(e.target.value)}})} /></label>
                      </div>
                    )}
                    {w.kind === 'chirp' && (
                      <div style={{ display:'flex', gap:8 }}>
                        <label>f0<input type='number' value={w.data.f0} onChange={e=>update(editingIndex,{data:{...w.data, f0:Number(e.target.value)}})} /></label>
                        <label>f1<input type='number' value={w.data.f1} onChange={e=>update(editingIndex,{data:{...w.data, f1:Number(e.target.value)}})} /></label>
                        <label>duration<input type='number' value={w.data.duration} onChange={e=>update(editingIndex,{data:{...w.data, duration:Number(e.target.value)}})} /></label>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button onClick={()=>onClose()}>Cancel</button>
          <button className='primary' onClick={save}>Save waveforms</button>
        </div>
      </div>
    </div>
  )
}
