import React, { useState } from 'react'

function nextId(prefix = 'tab') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

export default function CadTabs() {
  const [cadTabs, setCadTabs] = useState(() => [{ id: nextId('tab'), name: 'Tab 1' }])
  const [activeTabId, setActiveTabId] = useState(cadTabs[0].id)

  const addTab = (name = `Tab ${cadTabs.length + 1}`) => {
    const tab = { id: nextId('tab'), name, geometry: [], sources: [], monitors: [] }
    setCadTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }
  const duplicateTab = (id: string) => {
    const src = cadTabs.find((t) => t.id === id)
    if (!src) return
    const copy = { id: nextId('tab'), name: `${src.name} (copy)` }
    setCadTabs((prev) => [...prev, copy])
    setActiveTabId(copy.id)
  }
  const removeTab = (id: string) => {
    if (cadTabs.length === 1) return
    setCadTabs((prev) => prev.filter((t) => t.id !== id))
    if (activeTabId === id) setActiveTabId((prev) => cadTabs.find((t) => t.id !== id)?.id ?? prev)
  }

  return (
    <div className="cad-tabs">
      {cadTabs.map((t) => (
        <div key={t.id} className={`tab ${t.id === activeTabId ? 'active' : ''}`} onClick={() => setActiveTabId(t.id)}>
          {t.name}
        </div>
      ))}
      <div className="tab-actions">
        <button onClick={() => addTab()}>New tab</button>
        <button onClick={() => duplicateTab(activeTabId)}>Duplicate</button>
        <button onClick={() => removeTab(activeTabId)}>Delete</button>
      </div>
    </div>
  )
}
