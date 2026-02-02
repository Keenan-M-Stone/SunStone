// @ts-nocheck
import RunPanel from './RunPanel'

import './App.css'
import type { CSSProperties, WheelEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
// static import of gradients util for use in render path
import * as Gradients from './util/gradients'
import * as THREE from 'three'
import { getResourceUsage } from './resourceApi'

import { apiBaseUrl } from './config'
import {
  createProject,
  createRun,
  cancelRun,
  downloadArtifactUrl,
  getArtifacts,
  getLogs,
  getRun,
  submitRun,
} from './sunstoneApi'
import type { ArtifactEntry, ProjectRecord, RunRecord } from './types'

import MaterialEditor from './MaterialEditor'
import DiscretizePreviewModal from './DiscretizePreviewModal'
import MarkerOrientation from './MarkerOrientation'
import WaveformEditor from './WaveformEditor'
import MeshManager from './MeshManager'

// Estimate memory usage for Meep grid (rough, assumes double precision, 8 bytes per grid point per field)
function estimateMeepMemory(cellSize: [number, number, number], resolution: number, dimension: string): number {
  // For 2D: grid = (cell_x * res) * (cell_y * res)
  // For 3D: grid = (cell_x * res) * (cell_y * res) * (cell_z * res)
  const dim = dimension === '3d' ? 3 : 2;
  const nx = Math.max(1, Math.round(cellSize[0] * resolution));
  const ny = Math.max(1, Math.round(cellSize[1] * resolution));
  const nz = dim === 3 ? Math.max(1, Math.round(cellSize[2] * resolution)) : 1;
  const nGrid = nx * ny * nz;
  // Assume 3 fields (Ex, Ey, Ez) for safety
  const nFields = 3;
  // 8 bytes per value
  return nGrid * nFields * 8;
}

// Auto-fix function to reduce memory usage
function autoFixMeepMemory(cellSize: [number, number, number], resolution: number, dimension: string, maxBytes: number = 2e9) {
  // Try reducing resolution first, then cell size
  let res = resolution;
  let cs = [...cellSize];
  let mem = estimateMeepMemory(cs, res, dimension);
  while (mem > maxBytes && res > 8) {
    res = Math.floor(res * 0.8);
    mem = estimateMeepMemory(cs, res, dimension);
  }
  // If still too large, reduce cell size
  while (mem > maxBytes && (cs[0] > 1e-7 || cs[1] > 1e-7 || (dimension === '3d' && cs[2] > 1e-7))) {
    cs = cs.map((v, i) => (i < (dimension === '3d' ? 3 : 2) ? v * 0.9 : v));
    mem = estimateMeepMemory(cs, res, dimension);
  }
  return { cellSize: cs as [number, number, number], resolution: res, estimated: mem };
}

// Utility: log resource polling
function logResource(msg: string, ...args: any[]) {
  // eslint-disable-next-line no-console
  console.log('[ResourceMonitor]', msg, ...args)
}

// Utility: validate cell and geometry sizes for Meep compatibility
function validateMeep2D(cellSize: [number, number, number], geometry: GeometryItem[]): string | null {
  if (cellSize.length < 2 || cellSize[0] <= 0 || cellSize[1] <= 0) {
    return 'Cell size x and y must be > 0 for Meep 2D.';
  }
  for (const g of geometry) {
    if ((g.size && (g.size[0] <= 0 || g.size[1] <= 0)) || (g.shape === 'cylinder' && g.size && g.size[0] <= 0)) {
      return `Geometry item ${g.id} has invalid size for Meep 2D.`;
    }
  }
  return null;
}

type MaterialDef = {
  id: string
  label: string
  eps: number
  color: string
  model?: 'constant' | 'pec' | 'custom'
  payload?: Record<string, unknown>
}
type GeometryShape = 'block' | 'cylinder' | 'polygon' | 'polyline' | 'arc' | 'gradient'

type GeometryItem = {
  id: string
  shape: GeometryShape
  center: [number, number]
  centerZ: number
  size: [number, number]
  sizeZ: number
  materialId: string
  rotation?: number
  points?: Array<[number, number]>
  arc?: { start: [number, number]; end: [number, number]; radius: number; largeArc?: boolean; control?: [number, number] }
  boundaryAction?: 'fill' | 'outline'
  smoothing?: 'none' | 'spline' | 'bspline'
}

type SourceItem = {
  id: string
  position: [number, number]
  z: number
  component: 'Ex' | 'Ey' | 'Ez'
  centerFreq: number
  fwidth: number
  type?: string
  waveformId?: string
  metadata?: Record<string, unknown>
  orientation?: number
}

type MonitorItem = {
  id: string
  position: [number, number]
  z: number
  components: Array<'Ex' | 'Ey' | 'Ez'>
  dt: number
  orientation?: number
  // detector geometry/type
  shape?: 'point' | 'plane'
  // size in world units (meters) for planar detectors: [width, height]
  size?: [number, number]
  // how sampling should be performed for planar detectors (backends may or may not support direct plane sampling)
  sampling?: { mode: 'plane' | 'points'; nx?: number; ny?: number; fallbackToPoints?: boolean }
}

type ActiveTool =
  | 'select'
  | 'shape'
  | 'draw'
  | 'polyline'
  | 'polygon'
  | 'arc'
  | 'edit'
  | 'extrude'
  | 'source'
  | 'monitor'
  | 'measure'
type PanMode = 'middle' | 'space' | 'shift'
type ZoomDirection = 'normal' | 'inverted'
type KeymapConfig = {
  panMode: PanMode
  zoomDirection: ZoomDirection
  undo: string
  redo: string
  copy: string
  paste: string
  duplicate: string
  delete: string
  cancel: string
  nudge: string
  nudgeFast: string
  cycleTool: string
  rasterHold: string
  rasterToggle: string
  viewReset: string
  viewFrame: string
  toolSelect: string
  toolInsert: string
  toolDraw: string
  toolMeasure: string
  toolExtrude: string
  toolSource: string
  toolDetector: string
  drawPolyline: string
  drawPolygon: string
  drawArc: string
}
type ActionLogEntry = {
  id: string
  ts: number
  input: string
  interpreted?: string
}
type EditPointSelection = {
  id: string
  index: number
  kind: 'poly' | 'arc'
}
type SimulationDimension = '2d' | '3d'
type WorkspaceMode = 'cad' | 'fdtd'
type WaveformDef = { id: string; label: string; kind: 'samples' | 'analytic'; data: Record<string, unknown> }
type MeshAsset = { id: string; name: string; format: string; content: string }
type ImportKind = 'bundle' | 'config' | 'materials' | 'sources' | 'geometry' | 'waveforms' | 'mesh'
type DisplayUnit = 'm' | 'um' | 'nm'
type InsertShape = 'rectangle' | 'square' | 'ellipse' | 'circle' | 'source' | 'detector' | 'gradient'
type DrawMode = 'polyline' | 'polygon' | 'arc'

const INITIAL_MATERIALS: MaterialDef[] = [
  { id: 'vac', label: 'Vacuum (eps=1.0)', eps: 1.0, color: '#94a3b8' },
  { id: 'sio2', label: 'SiO2 (eps=2.1)', eps: 2.1, color: '#38bdf8' },
  { id: 'si', label: 'Si (eps=12.0)', eps: 12.0, color: '#f97316' },
  { id: 'al2o3', label: 'Al2O3 (eps=3.1)', eps: 3.1, color: '#a78bfa' },
  { id: 'pec', label: 'PEC (perfect conductor)', eps: 1.0, color: '#e2e8f0', model: 'pec' },
]

const DEFAULT_DOMAIN: [number, number, number] = [2e-6, 2e-6, 1e-6]
const DEFAULT_PML: [number, number, number] = [2e-7, 2e-7, 2e-7]
const DEFAULT_KEYMAP: KeymapConfig = {
  panMode: 'middle',
  zoomDirection: 'normal',
  undo: 'ctrl+z|meta+z',
  redo: 'ctrl+shift+z|meta+shift+z',
  copy: 'ctrl+c|meta+c',
  paste: 'ctrl+v|meta+v',
  duplicate: 'ctrl+d|meta+d',
  delete: 'delete',
  cancel: 'escape',
  nudge: 'arrow',
  nudgeFast: 'shift+arrow',
  cycleTool: 'tab',
  rasterHold: 'f1',
  rasterToggle: 'f2',
  viewReset: '',
  viewFrame: '',
  toolSelect: 'v',
  toolInsert: 'i',
  toolDraw: 'd',
  toolMeasure: 'm',
  toolExtrude: 'x',
  toolSource: 's',
  toolDetector: 't',
  drawPolyline: '1',
  drawPolygon: '2',
  drawArc: '3',
}
const APP_VERSION = '0.0.0'

function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function toFinite(n: number, fallback: number) {
  return Number.isFinite(n) ? n : fallback
}

function finiteOr(prev: number, next: number) {
  return Number.isFinite(next) ? next : prev
}

const SCENE_SCALE = 1e6

function toScene(v: number) {
  return v * SCENE_SCALE
}

function hexToRgba(hex: string, alpha: number) {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return `rgba(148,163,184,${alpha})`
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function closestPointOnSegment(a: [number, number], b: [number, number], p: [number, number]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const denom = dx * dx + dy * dy
  const t = denom > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denom : 0
  const clamped = Math.max(0, Math.min(1, t))
  return [a[0] + dx * clamped, a[1] + dy * clamped, clamped] as [number, number, number]
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function arcFromPoints(p1: [number, number], p2: [number, number], p3: [number, number]) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  const [x3, y3] = p3
  const a = x1 * (y2 - y3) - y1 * (x2 - x3) + x2 * y3 - x3 * y2
  if (Math.abs(a) < 1e-12) return null
  const b = (x1 * x1 + y1 * y1) * (y3 - y2) + (x2 * x2 + y2 * y2) * (y1 - y3) + (x3 * x3 + y3 * y3) * (y2 - y1)
  const c = (x1 * x1 + y1 * y1) * (x2 - x3) + (x2 * x2 + y2 * y2) * (x3 - x1) + (x3 * x3 + y3 * y3) * (x1 - x2)
  const cx = -b / (2 * a)
  const cy = -c / (2 * a)
  const r = Math.hypot(x1 - cx, y1 - cy)
  return { center: [cx, cy] as [number, number], radius: r }
}

function pointInPolygon(point: [number, number], polygon: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    const intersect = yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointSegmentDistance(point: [number, number], a: [number, number], b: [number, number]) {
  const [cx, cy] = closestPointOnSegment(a, b, point)
  return Math.hypot(point[0] - cx, point[1] - cy)
}

function segmentIntersection(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
  eps = 1e-9,
) {
  const r = [b[0] - a[0], b[1] - a[1]] as const
  const s = [d[0] - c[0], d[1] - c[1]] as const
  const denom = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(denom) < eps) return null
  const uNumer = (c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]
  const tNumer = (c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]
  const t = tNumer / denom
  const u = uNumer / denom
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null
  return [a[0] + t * r[0], a[1] + t * r[1]] as [number, number]
}

function paletteColor(name: 'viridis' | 'jet' | 'gray', t: number) {
  const x = clamp01(t)
  if (name === 'gray') {
    const v = Math.round(lerp(0, 255, x))
    return `rgb(${v}, ${v}, ${v})`
  }
  if (name === 'jet') {
    const r = Math.round(255 * clamp01(1.5 - Math.abs(4 * x - 3)))
    const g = Math.round(255 * clamp01(1.5 - Math.abs(4 * x - 2)))
    const b = Math.round(255 * clamp01(1.5 - Math.abs(4 * x - 1)))
    return `rgb(${r}, ${g}, ${b})`
  }
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ]
  const scaled = x * (stops.length - 1)
  const idx = Math.floor(scaled)
  const t0 = scaled - idx
  const c0 = stops[idx]
  const c1 = stops[Math.min(idx + 1, stops.length - 1)]
  const r = Math.round(lerp(c0[0], c1[0], t0))
  const g = Math.round(lerp(c0[1], c1[1], t0))
  const b = Math.round(lerp(c0[2], c1[2], t0))
  return `rgb(${r}, ${g}, ${b})`
}

function formatLength(value: number, unit: DisplayUnit) {
  if (!Number.isFinite(value)) return `— ${unit}`
  const scale = unit === 'um' ? 1e6 : unit === 'nm' ? 1e9 : 1
  const scaled = value * scale
  const suffix = unit === 'um' ? 'µm' : unit
  return `${scaled.toExponential(2)} ${suffix}`
}

function toDisplayLength(value: number, unit: DisplayUnit) {
  const scale = unit === 'um' ? 1e6 : unit === 'nm' ? 1e9 : 1
  return value * scale
}

function fromDisplayLength(value: number, unit: DisplayUnit) {
  const scale = unit === 'um' ? 1e6 : unit === 'nm' ? 1e9 : 1
  return value / scale
}

function normalizeKeymap(raw: Partial<KeymapConfig> | null | undefined): KeymapConfig {
  return {
    ...DEFAULT_KEYMAP,
    ...(raw ?? {}),
  }
}

function matchKeybinding(e: KeyboardEvent, binding: string) {
  const combos = binding
    .split(/[|,]/g)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  const key = e.key.toLowerCase()

  return combos.some((combo) => {
    const parts = combo.split('+').map((p) => p.trim()).filter(Boolean)
    const wantsShift = parts.includes('shift')
    const wantsAlt = parts.includes('alt')
    const wantsCtrl = parts.includes('ctrl')
    const wantsMod = parts.includes('mod')
    const wantsMeta = parts.includes('meta') || parts.includes('cmd')

    if (wantsShift !== e.shiftKey) return false
    if (wantsAlt !== e.altKey) return false
    if (wantsCtrl && !e.ctrlKey) return false
    if (wantsMeta && !e.metaKey) return false
    if (wantsMod && !(e.ctrlKey || e.metaKey)) return false

    const base = parts.find((p) => !['shift', 'alt', 'ctrl', 'mod', 'meta', 'cmd'].includes(p))
    if (!base) return false
    if (base === 'arrow') {
      return ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
    }
    if (base === 'delete') return key === 'delete' || key === 'backspace'
    if (base === 'escape') return key === 'escape'
    return key === base
  })
}

function comboFromEvent(e: KeyboardEvent) {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.metaKey) parts.push('meta')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  const key = e.key.toLowerCase()
  if (key === ' ') return parts.concat(['space']).join('+')
  if (key.startsWith('arrow')) return parts.concat([key]).join('+')
  if (key === 'escape') return parts.concat(['escape']).join('+')
  if (key === 'delete' || key === 'backspace') return parts.concat(['delete']).join('+')
  if (key.length === 1 || key === 'enter' || key === 'tab') return parts.concat([key]).join('+')
  return parts.concat([key]).join('+')
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}


function App() {
    // State for memory warning (moved from top level)
    const [meepMemoryWarning, setMeepMemoryWarning] = useState<string | null>(null);
    const [showMeepMemoryPrompt, setShowMeepMemoryPrompt] = useState(false);
    const [autoFixSuggestion, setAutoFixSuggestion] = useState<{cellSize: [number,number,number], resolution: number, estimated: number} | null>(null);
  const [projectName, setProjectName] = useState('demo')
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('cad')
  const [dimension, setDimension] = useState<SimulationDimension>('2d')
  const [cellSize, setCellSize] = useState<[number, number, number]>(DEFAULT_DOMAIN)
  const [sliceZ, setSliceZ] = useState(0)
  const [show3DPreview, setShow3DPreview] = useState(true)
  const [viewCenter, setViewCenter] = useState<[number, number]>([0, 0])
  const [zoom, setZoom] = useState(1)
  const [cursorPct, setCursorPct] = useState<{ x: number; y: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const [showCenters, setShowCenters] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [drawStart, setDrawStart] = useState<[number, number] | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<[number, number] | null>(null)
  const drawCompletedRef = useRef(false)
  const [selectStart, setSelectStart] = useState<[number, number] | null>(null)
  const [selectCurrent, setSelectCurrent] = useState<[number, number] | null>(null)
  const selectCompletedRef = useRef(false)
  const selectAdditiveRef = useRef(false)
  const [measureStart, setMeasureStart] = useState<[number, number] | null>(null)
  const [measureEnd, setMeasureEnd] = useState<[number, number] | null>(null)
  const [measurePoints, setMeasurePoints] = useState<Array<[number, number]>>([])
  const [sketchPoints, setSketchPoints] = useState<Array<[number, number]>>([])
  const [sketchActive, setSketchActive] = useState(false)
  const [arcPoints, setArcPoints] = useState<Array<[number, number]>>([])
  const moveStartRef = useRef<{
    x: number
    y: number
    geometry: Record<string, GeometryItem>
    sources: Record<string, SourceItem>
    monitors: Record<string, MonitorItem>
  } | null>(null)
  const skipSelectRef = useRef(false)
  const historyRef = useRef<{
    stack: Array<{ geometry: GeometryItem[]; sources: SourceItem[]; monitors: MonitorItem[] }>
    index: number
  }>({ stack: [], index: -1 })
  const clipboardRef = useRef<{ geometry: GeometryItem[]; sources: SourceItem[]; monitors: MonitorItem[] } | null>(null)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpTab, setHelpTab] = useState<'about' | 'keymap' | 'docs'>('about')
  const [keymap, setKeymap] = useState<KeymapConfig>(DEFAULT_KEYMAP)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [displayUnits, setDisplayUnits] = useState<DisplayUnit>('um')
  const [displayFontPt, setDisplayFontPt] = useState(18)
  const [overlayAutoscale, setOverlayAutoscale] = useState(true)
  const [overlayFixedPx, setOverlayFixedPx] = useState(2)
  const [overlayLineScale, setOverlayLineScale] = useState(1)
  const [captureDataUrl, setCaptureDataUrl] = useState<string | null>(null)
  const [captureScale, setCaptureScale] = useState(2)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapDistancePx, setSnapDistancePx] = useState(8)
  const [snapPreview, setSnapPreview] = useState<[number, number] | null>(null)
  const [showResolutionPreview, setShowResolutionPreview] = useState(false)
  const [resolutionPreviewMode, setResolutionPreviewMode] = useState<'off' | 'grid' | 'dots' | 'raster'>('off')
  const [lastResolutionMode, setLastResolutionMode] = useState<'grid' | 'dots' | 'raster'>('raster')
  const [isEditDragging, setIsEditDragging] = useState(false)
  const [renderMode, setRenderMode] = useState<'none'|'cell-centers'|'rasterize'|'gradient-overlay'|'discretize'>('none')
  const [showDiscretizeModal, setShowDiscretizeModal] = useState(false)
  const [discretizeCache, setDiscretizeCache] = useState<Record<string, any[]>>({})
  const [currentDiscretizeBackend, setCurrentDiscretizeBackend] = useState<string | null>(null)

  // expose cache & current backend to window for e2e tests / debugging
  useEffect(() => {
    ;(window as any).__discretizeCache = discretizeCache
    ;(window as any).__currentDiscretizeBackend = currentDiscretizeBackend
    return () => {
      ;(window as any).__discretizeCache = undefined
      ;(window as any).__currentDiscretizeBackend = undefined
    }
  }, [discretizeCache, currentDiscretizeBackend])

  function handleDiscretizeComplete(backend: string, results: Record<string, any[]>) {
    // merge results into cache
    setDiscretizeCache((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(results).map(([k, v]) => [`${backend}:${k.split(':')[0]}:${k.split(':')[1]}`, v])) }))
    setCurrentDiscretizeBackend(backend)
    setRenderMode('discretize')
    setShowDiscretizeModal(false)
  }
  const editDragRef = useRef<
    | {
        id: string
        type: 'poly' | 'arc'
        index: number
        points: Array<[number, number]>
      }
    | null
  >(null)
  const editDragPendingRef = useRef<[number, number] | null>(null)
  const editDragFrameRef = useRef<number | null>(null)
  const extrude2dRef = useRef<
    | {
        id: string
        shape: GeometryShape
        points?: Array<[number, number]>
        center: [number, number]
        size: [number, number]
        materialId: string
      }
    | null
  >(null)
  const [resolution, setResolution] = useState(30)
  const [pml, setPml] = useState<[number, number, number]>(DEFAULT_PML)
  const [boundaryType, setBoundaryType] = useState<'pml'|'pec'|'periodic'|'symmetry'|'impedance'>('pml')
  // Per-face boundary configuration: faces are px,nx,py,ny,pz,nz
  const [boundaryPerFace, setBoundaryPerFace] = useState(false)
  const [boundaryFaces, setBoundaryFaces] = useState<Record<string, { type: string; thickness?: number }>>(() => ({
    px: { type: 'pml', thickness: pml[0] },
    nx: { type: 'pml', thickness: pml[0] },
    py: { type: 'pml', thickness: pml[1] },
    ny: { type: 'pml', thickness: pml[1] },
    pz: { type: 'pml', thickness: pml[2] },
    nz: { type: 'pml', thickness: pml[2] },
  }))
  // Expose a test helper in development to trigger the Meep memory modal
  useEffect(() => {
    try {
      ;(window as any).__sunstoneTest = (window as any).__sunstoneTest || {}
      ;(window as any).__sunstoneTest.triggerMeepMemoryModal = () => {
        const mem = estimateMeepMemory(cellSize, resolution, dimension)
        setMeepMemoryWarning(`Estimated memory usage for this run is ${(mem/1e9).toFixed(2)} GB (test).`)
        setAutoFixSuggestion(autoFixMeepMemory(cellSize, resolution, dimension, 2 * 1024 * 1024 * 1024))
        setShowMeepMemoryPrompt(true)
      }
    } catch (e) {
      // ignore in non-browser contexts
    }
  }, [cellSize, resolution, dimension])
  const [materials, setMaterials] = useState<MaterialDef[]>(INITIAL_MATERIALS)
  const [backgroundColor, setBackgroundColor] = useState('#0b1220')
  const [meepCompatWarning, setMeepCompatWarning] = useState<string | null>(null);
  const [showMeepCompatPrompt, setShowMeepCompatPrompt] = useState(false);
  // Expose dev test hooks to allow automation to trigger modals when running locally
  useEffect(() => {
    try {
      ;(window as any).__sunstoneTest = {
        triggerMeepMemoryModal: () => setShowMeepMemoryPrompt(true),
        triggerMeepCompatModal: () => setShowMeepCompatPrompt(true),
      }
    } catch (e) {
      // ignore
    }
    return () => {
      try {
        ;(window as any).__sunstoneTest = undefined
      } catch (e) {}
    }
  }, [])
  // Handler to auto-fix for Meep 2D
  function autoFixMeep2D() {
    setCellSize(([x, y, z]) => [Math.max(x, 1e-9), Math.max(y, 1e-9), 0]);
    setGeometry((prev) => prev.map(g => ({
      ...g,
      centerZ: 0,
      sizeZ: g.sizeZ > 0 ? g.sizeZ : 1,
    })));
    setMeepCompatWarning(null);
    setShowMeepCompatPrompt(false);
  }
  // Render Meep compatibility warning prompt
  {showMeepCompatPrompt && (
    <div className="meep-compat-modal" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div className="meep-compat-content" style={{background:'#222',padding:24,borderRadius:10,maxWidth:400,color:'#fff',boxShadow:'0 4px 24px #0008'}}>
        <h3 style={{marginTop:0}}>Meep 2D Compatibility Issue</h3>
        <div>{meepCompatWarning}</div>
        <div style={{marginTop: 18, display:'flex',justifyContent:'flex-end',gap:12}}>
          <button onClick={autoFixMeep2D}>Auto-fix and Preview</button>
          <button onClick={() => setShowMeepCompatPrompt(false)}>Cancel</button>
        </div>
      </div>
    </div>
  )}

  const [extrudeOffset, setExtrudeOffset] = useState<[number, number] | null>(null)
  const [nudgeStep, setNudgeStep] = useState(2e-8)
  const [nudgeStepFast, setNudgeStepFast] = useState(1e-7)
  const [actionLogOpen, setActionLogOpen] = useState(false)
  const [actionLogEnabled, setActionLogEnabled] = useState(true)
  const [actionLogEntries, setActionLogEntries] = useState<ActionLogEntry[]>([])
  const [actionLogPos, setActionLogPos] = useState({ x: 24, y: 92, width: 380, height: 320 })
  const actionLogListRef = useRef<HTMLDivElement | null>(null)
  const actionLogDragRef = useRef<{ offsetX: number; offsetY: number; dragging: boolean }>({
    offsetX: 0,
    offsetY: 0,
    dragging: false,
  })
  const [editPointSelection, setEditPointSelection] = useState<EditPointSelection | null>(null)
  const [editPointHover, setEditPointHover] = useState<EditPointSelection | null>(null)
  const editPointSelectionRef = useRef<EditPointSelection | null>(null)
  const [keymapAddGlobalAction, setKeymapAddGlobalAction] = useState<keyof KeymapConfig>('undo')
  const [keymapAddGlobalValue, setKeymapAddGlobalValue] = useState('')
  const [keymapAddToolAction, setKeymapAddToolAction] = useState<keyof KeymapConfig>('toolSelect')
  const [keymapAddToolValue, setKeymapAddToolValue] = useState('')
  const [keymapAddDrawAction, setKeymapAddDrawAction] = useState<keyof KeymapConfig>('drawPolyline')
  const [keymapAddDrawValue, setKeymapAddDrawValue] = useState('')
  const [readmeContent, setReadmeContent] = useState<string | null>(null)
  const [readmeError, setReadmeError] = useState<string | null>(null)
  const specRef = useRef<HTMLTextAreaElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [importKind, setImportKind] = useState<ImportKind>('bundle')
  const [waveforms, setWaveforms] = useState<WaveformDef[]>([])
  const [meshAssets, setMeshAssets] = useState<MeshAsset[]>([])
  const [showMaterialEditor, setShowMaterialEditor] = useState(false)
  const [showWaveformEditor, setShowWaveformEditor] = useState(false)

  const [geometry, setGeometry] = useState<GeometryItem[]>([
    {
      id: nextId('geom'),
      shape: 'block',
      center: [0, 0],
      centerZ: 0,
      size: [6e-7, 2e-7],
      sizeZ: 2e-7,
      materialId: 'si',
    },
  ])
  const [sources, setSources] = useState<SourceItem[]>([
    {
      id: nextId('src'),
      position: [-6e-7, 0],
      z: 0,
      component: 'Ez',
      centerFreq: 3.75e14,
      fwidth: 5e13,
    },
  ])
  const [monitors, setMonitors] = useState<MonitorItem[]>([
    {
      id: nextId('mon'),
      position: [6e-7, 0],
      z: 0,
      components: ['Ez'],
      dt: 1e-16,
      // defaults for detector type: point by default, with sensible planar defaults if user switches
      shape: 'point',
      size: [4e-7, 4e-7],
      sampling: { mode: 'points', nx: 5, ny: 5, fallbackToPoints: true },
    },
  ])

  const [activeTool, setActiveTool] = useState<ActiveTool>('select')
  const [lastPrimaryTool, setLastPrimaryTool] = useState<ActiveTool>('select')
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)
  const [insertShape, setInsertShape] = useState<InsertShape>('rectangle')
  const [drawMode, setDrawMode] = useState<DrawMode>('polyline')
  const [selectedItems, setSelectedItems] = useState<Array<{ id: string; type: 'geometry' | 'source' | 'monitor' }>>(
    [],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'geometry' | 'source' | 'monitor' | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const objectsGroupRef = useRef<SVGGElement | null>(null)
  const threeMountRef = useRef<HTMLDivElement | null>(null)
  const threeRef = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; anim: number; dispose: () => void } | null>(null)
  const [canvasFocused, setCanvasFocused] = useState(false)
  const [scenePixels, setScenePixels] = useState({ width: 1, height: 1 })

  const [run, setRun] = useState<RunRecord | null>(null)
  const [backend, setBackend] = useState('dummy')
  // backend -> options map persisted in the UI while editing runs
  const [backendOptionsMap, setBackendOptionsMap] = useState<Record<string, any>>(() => {
    try {
      const raw = localStorage.getItem('sunstone_backend_options') || '{}'
      return JSON.parse(raw)
    } catch (e) {
      return {}
    }
  })
  const setBackendOptionsFor = (name: string, opts: Record<string, any> | null) => {
    setBackendOptionsMap((m) => {
      const next = { ...m, [name]: opts || {} }
      try { localStorage.setItem('sunstone_backend_options', JSON.stringify(next)) } catch (e) {}
      return next
    })
  }
  const currentBackendOptions = backendOptionsMap[backend] || null

  // Backend capabilities and translation previews
  const [backendCapabilitiesMap, setBackendCapabilitiesMap] = useState<Record<string, any>>({})
  const setBackendCapabilitiesFor = (name: string, caps: Record<string, any>) => {
    setBackendCapabilitiesMap((m) => ({ ...m, [name]: caps }))
  }
  const currentBackendCapabilities = backendCapabilitiesMap[backend] || null

  const [translationPreviews, setTranslationPreviews] = useState<Record<string, string>>({})
  const setTranslationForBackend = (name: string, text: string|null) => {
    setTranslationPreviews((m) => ({ ...m, [name]: text ?? '' }))
  }

  // Warnings discovered while loading specs/bundles
  const [specWarnings, setSpecWarnings] = useState<string[] | null>(null)

  // Fetch backend capabilities when backend selection changes so UI can show dynamic controls
  useEffect(() => {
    let cancelled = false
    async function fetchCaps() {
      try {
        const res = await fetch(`/api/backends/${encodeURIComponent(backend)}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setBackendCapabilitiesFor(backend, data)
      } catch (e) {
        // ignore
      }
    }
    if (backend) fetchCaps()
    return () => { cancelled = true }
  }, [backend])
  const [meepPythonExecutable, setMeepPythonExecutable] = useState('')
  const [executionMode, setExecutionMode] = useState<'local'|'ssh'|'slurm'>('local')
  const [sshTarget, setSshTarget] = useState('')
  const [sshOptions, setSshOptions] = useState<Record<string, any>>({})
  const [remotePythonExecutable, setRemotePythonExecutable] = useState('')
  const [movieDt, setMovieDt] = useState(2e-15)
  const [movieStart, setMovieStart] = useState(0)
  const [movieStop, setMovieStop] = useState(2e-13)
  const [movieStride, setMovieStride] = useState(2)
  const [movieMaxFrames, setMovieMaxFrames] = useState(120)
  const [snapshotEnabled, setSnapshotEnabled] = useState(true)
  const [snapshotStride, setSnapshotStride] = useState(4)
  const [previewComponent, setPreviewComponent] = useState<'Ez' | 'Ex' | 'Ey' | 'Hz' | 'Hx' | 'Hy'>('Ez')
  const [previewPalette, setPreviewPalette] = useState<'viridis' | 'jet' | 'gray' | 'lava'>('viridis')
  const [livePreview, setLivePreview] = useState(false)
  const [hideCad, setHideCad] = useState(() => {
    try {
      const raw = window.localStorage.getItem('sunstone.hideCad')
      return raw === 'true'
    } catch (err) {
      return false
    }
  })

  const [logs, setLogs] = useState('')
  const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [leftWidth] = useState(300)
  const [rightWidth] = useState(360)
  const [showTools, setShowTools] = useState(true)
  const [showProperties, setShowProperties] = useState(true)
  const [showRunPanel, setShowRunPanel] = useState(true)
  const [canvasMaximized, setCanvasMaximized] = useState(false)

  useEffect(() => {
    if (workspaceMode === 'cad') {
      setShowRunPanel(false)
      setHideCad(false)
      return
    }
    // any non-cad workspace mode (e.g., 'fdtd') should hide the CAD canvas and show the Run Panel
    setHideCad(true)
    setShowRunPanel(true)
  }, [workspaceMode])

  useEffect(() => {
    if (hideCad) {
      setShowRunPanel(true)
    }
    try {
      window.localStorage.setItem('sunstone.hideCad', hideCad ? 'true' : 'false')
    } catch (err) {
      // ignore
    }
  }, [hideCad])

  useEffect(() => {
    if (dimension === '2d') {
      setCellSize((prev) => [prev[0], prev[1], 0])
      setGeometry((prev) => prev.map((g) => ({ ...g, centerZ: 0, sizeZ: 0 })))
      setSources((prev) => prev.map((s) => ({ ...s, z: 0 })))
      setMonitors((prev) => prev.map((m) => ({ ...m, z: 0 })))
    }
  }, [dimension])

  useEffect(() => {
    const raw = window.localStorage.getItem('sunstone.keymap')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<KeymapConfig>
      setKeymap(normalizeKeymap(parsed))
    } catch (err) {
      console.warn('Failed to load keymap preferences', err)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sunstone.keymap', JSON.stringify(keymap))
  }, [keymap])

  useEffect(() => {
    const raw = window.localStorage.getItem('sunstone.settings')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<{
        displayUnits: DisplayUnit
        displayFontPt: number
        overlayAutoscale: boolean
        overlayFixedPx: number
        overlayLineScale: number
        snapEnabled: boolean
        snapDistancePx: number
        nudgeStep: number
        nudgeStepFast: number
        meepPythonExecutable: string
      }>
      if (parsed.displayUnits) setDisplayUnits(parsed.displayUnits)
      if (Number.isFinite(parsed.displayFontPt)) setDisplayFontPt(parsed.displayFontPt as number)
      if (typeof parsed.overlayAutoscale === 'boolean') setOverlayAutoscale(parsed.overlayAutoscale)
      if (Number.isFinite(parsed.overlayFixedPx)) setOverlayFixedPx(parsed.overlayFixedPx as number)
      if (Number.isFinite(parsed.overlayLineScale)) setOverlayLineScale(parsed.overlayLineScale as number)
      if (typeof parsed.snapEnabled === 'boolean') setSnapEnabled(parsed.snapEnabled)
      if (Number.isFinite(parsed.snapDistancePx)) setSnapDistancePx(parsed.snapDistancePx as number)
      if (Number.isFinite(parsed.nudgeStep)) setNudgeStep(parsed.nudgeStep as number)
      if (Number.isFinite(parsed.nudgeStepFast)) setNudgeStepFast(parsed.nudgeStepFast as number)
      if (typeof parsed.meepPythonExecutable === 'string') setMeepPythonExecutable(parsed.meepPythonExecutable)
    } catch (err) {
      console.warn('Failed to load settings preferences', err)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(
      'sunstone.settings',
      JSON.stringify({
        displayUnits,
        displayFontPt,
        overlayAutoscale,
        overlayFixedPx,
        overlayLineScale,
        snapEnabled,
        snapDistancePx,
        nudgeStep,
        nudgeStepFast,
        meepPythonExecutable,
      }),
    )
  }, [
    displayUnits,
    displayFontPt,
    overlayAutoscale,
    overlayFixedPx,
    overlayLineScale,
    snapEnabled,
    snapDistancePx,
    nudgeStep,
    nudgeStepFast,
    meepPythonExecutable,
  ])

  function pushHistory(next?: { geometry: GeometryItem[]; sources: SourceItem[]; monitors: MonitorItem[] }) {
    const snapshot = next ?? { geometry, sources, monitors }
    const stack = historyRef.current.stack
    const idx = historyRef.current.index
    const trimmed = stack.slice(0, idx + 1)
    trimmed.push(JSON.parse(JSON.stringify(snapshot)))
    historyRef.current.stack = trimmed
    historyRef.current.index = trimmed.length - 1
  }

  function undo() {
    const { stack, index } = historyRef.current
    if (index <= 0) return
    const nextIndex = index - 1
    const snap = stack[nextIndex]
    historyRef.current.index = nextIndex
    setGeometry(snap.geometry)
    setSources(snap.sources)
    setMonitors(snap.monitors)
  }

  function redo() {
    const { stack, index } = historyRef.current
    if (index >= stack.length - 1) return
    const nextIndex = index + 1
    const snap = stack[nextIndex]
    historyRef.current.index = nextIndex
    setGeometry(snap.geometry)
    setSources(snap.sources)
    setMonitors(snap.monitors)
  }

  useEffect(() => {
    if (historyRef.current.index === -1) {
      pushHistory()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable) return
      const globalAction =
        matchKeybinding(e, keymap.undo) ||
        matchKeybinding(e, keymap.redo) ||
        matchKeybinding(e, keymap.copy) ||
        matchKeybinding(e, keymap.paste) ||
        matchKeybinding(e, keymap.duplicate) ||
        matchKeybinding(e, keymap.delete)
      if (!canvasFocused && !globalAction) return
      if (matchKeybinding(e, keymap.rasterHold)) {
        e.preventDefault()
        setLastResolutionMode('raster')
        setShowResolutionPreview(true)
        logAction(`key ${comboFromEvent(e)}`, 'raster preview hold')
      }
      if (matchKeybinding(e, keymap.rasterToggle)) {
        e.preventDefault()
        setResolutionPreviewMode((prev) => (prev === 'off' ? 'raster' : 'off'))
        setLastResolutionMode('raster')
        logAction(`key ${comboFromEvent(e)}`, 'raster preview toggle')
      }
      if (matchKeybinding(e, keymap.viewReset)) {
        e.preventDefault()
        resetView()
        logAction(`key ${comboFromEvent(e)}`, 'view reset')
      }
      if (matchKeybinding(e, keymap.viewFrame)) {
        e.preventDefault()
        frameObjects()
        logAction(`key ${comboFromEvent(e)}`, 'frame objects')
      }
      if (matchKeybinding(e, keymap.cycleTool)) {
        e.preventDefault()
        if ((activeTool === 'draw' || activeTool === 'shape') && lastCreatedId) {
          setSelected(lastCreatedId, 'geometry')
        }
        const cycle: ActiveTool[] = ['select', 'edit', 'shape', 'draw', 'measure', 'extrude']
        const currentIndex = Math.max(0, cycle.indexOf(activeTool))
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + cycle.length) % cycle.length
          : (currentIndex + 1) % cycle.length
        setActiveTool(cycle[nextIndex])
        logAction(`key ${comboFromEvent(e)}`, `cycle tool -> ${cycle[nextIndex]}`)
        return
      }
      if (activeTool === 'draw' && matchKeybinding(e, keymap.undo)) {
        e.preventDefault()
        popLastDrawPoint()
        logAction(`key ${comboFromEvent(e)}`, 'draw undo point')
        return
      }
      if (matchKeybinding(e, keymap.toolSelect)) {
        e.preventDefault()
        setActiveTool('select')
        logAction(`key ${comboFromEvent(e)}`, 'tool select')
        return
      }
      if (matchKeybinding(e, keymap.toolInsert)) {
        e.preventDefault()
        if (insertShape === 'source') setActiveTool('source')
        else if (insertShape === 'detector') setActiveTool('monitor')
        else setActiveTool('shape')
        logAction(`key ${comboFromEvent(e)}`, 'tool insert')
        return
      }
      if (matchKeybinding(e, keymap.toolDraw)) {
        e.preventDefault()
        setActiveTool('draw')
        logAction(`key ${comboFromEvent(e)}`, `tool draw (${drawMode})`)
        return
      }
      if (matchKeybinding(e, keymap.toolMeasure)) {
        e.preventDefault()
        setActiveTool('measure')
        logAction(`key ${comboFromEvent(e)}`, 'tool measure')
        return
      }
      if (matchKeybinding(e, keymap.toolExtrude)) {
        e.preventDefault()
        setActiveTool('extrude')
        logAction(`key ${comboFromEvent(e)}`, 'tool extrude')
        return
      }
      if (matchKeybinding(e, keymap.toolSource)) {
        e.preventDefault()
        setInsertShape('source')
        setActiveTool('source')
        logAction(`key ${comboFromEvent(e)}`, 'tool source')
        return
      }
      if (matchKeybinding(e, keymap.toolDetector)) {
        e.preventDefault()
        setInsertShape('detector')
        setActiveTool('monitor')
        logAction(`key ${comboFromEvent(e)}`, 'tool detector')
        return
      }
      if (matchKeybinding(e, keymap.drawPolyline)) {
        e.preventDefault()
        applyDrawMode('polyline')
        setActiveTool('draw')
        logAction(`key ${comboFromEvent(e)}`, 'draw mode polyline')
        return
      }
      if (matchKeybinding(e, keymap.drawPolygon)) {
        e.preventDefault()
        applyDrawMode('polygon')
        setActiveTool('draw')
        logAction(`key ${comboFromEvent(e)}`, 'draw mode polygon')
        return
      }
      if (matchKeybinding(e, keymap.drawArc)) {
        e.preventDefault()
        applyDrawMode('arc')
        setActiveTool('draw')
        logAction(`key ${comboFromEvent(e)}`, 'draw mode arc')
        return
      }
      if (matchKeybinding(e, keymap.cancel)) {
        setSketchPoints([])
        setArcPoints([])
        setSketchActive(false)
        logAction(`key ${comboFromEvent(e)}`, 'cancel/escape')
        return
      }
      if (matchKeybinding(e, keymap.undo)) {
        e.preventDefault()
        undo()
        logAction(`key ${comboFromEvent(e)}`, 'undo')
        return
      }
      if (matchKeybinding(e, keymap.redo)) {
        e.preventDefault()
        redo()
        logAction(`key ${comboFromEvent(e)}`, 'redo')
        return
      }
      if (matchKeybinding(e, keymap.copy)) {
        e.preventDefault()
        clipboardRef.current = {
          geometry: geometry.filter((g) => isSelected(g.id, 'geometry')),
          sources: sources.filter((s) => isSelected(s.id, 'source')),
          monitors: monitors.filter((m) => isSelected(m.id, 'monitor')),
        }
        logAction(`key ${comboFromEvent(e)}`, 'copy')
        return
      }
      if (matchKeybinding(e, keymap.paste)) {
        e.preventDefault()
        pasteClipboard()
        logAction(`key ${comboFromEvent(e)}`, 'paste')
        return
      }
      if (matchKeybinding(e, keymap.duplicate)) {
        e.preventDefault()
        duplicateSelection()
        logAction(`key ${comboFromEvent(e)}`, 'duplicate')
        return
      }
      if (matchKeybinding(e, keymap.delete)) {
        e.preventDefault()
        deleteSelection()
        logAction(`key ${comboFromEvent(e)}`, 'delete')
        return
      }
      const isFast = matchKeybinding(e, keymap.nudgeFast)
      const isNudge = matchKeybinding(e, keymap.nudge)
      const activeEditPoint = editPointSelectionRef.current ?? editPointSelection
      if (activeTool === 'edit' && activeEditPoint) {
        const isCycleLeft = e.key === '4' || e.code === 'Numpad4'
        const isCycleRight = e.key === '6' || e.code === 'Numpad6'
        if (isCycleLeft || isCycleRight) {
          e.preventDefault()
          const geom = geometry.find((g) => g.id === activeEditPoint.id)
          if (!geom) return
          const pointsCount =
            activeEditPoint.kind === 'arc'
              ? 3
              : Math.max(geom.points?.length ?? 0, 0)
          if (pointsCount <= 0) return
          const delta = isCycleRight ? 1 : -1
          const nextIndex = (activeEditPoint.index + delta + pointsCount) % pointsCount
          const nextSelection = { ...activeEditPoint, index: nextIndex }
          setEditPointSelection(nextSelection)
          editPointSelectionRef.current = nextSelection
          logAction(`key ${comboFromEvent(e)}`, `edit point select ${nextIndex}`)
          return
        }
        if (isNudge && !e.shiftKey) {
          e.preventDefault()
          const step = nudgeStep
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
          if (dx === 0 && dy === 0) return
          setGeometry((prev) =>
            prev.map((g) => {
              if (g.id !== activeEditPoint.id) return g
              if (activeEditPoint.kind === 'arc' && g.arc) {
                const nextArc = { ...g.arc }
                if (activeEditPoint.index === 0) nextArc.start = [nextArc.start[0] + dx, nextArc.start[1] + dy]
                if (activeEditPoint.index === 1) {
                  const control = nextArc.control ?? nextArc.start
                  nextArc.control = [control[0] + dx, control[1] + dy]
                }
                if (activeEditPoint.index === 2) nextArc.end = [nextArc.end[0] + dx, nextArc.end[1] + dy]
                return { ...g, arc: nextArc }
              }
              if (!g.points || g.points.length === 0) return g
              const pts = g.points.map((p, idx) =>
                idx === activeEditPoint.index ? ([p[0] + dx, p[1] + dy] as [number, number]) : p,
              )
              const isClosed =
                g.shape === 'polyline' &&
                g.points.length > 2 &&
                Math.hypot(g.points[0][0] - g.points[g.points.length - 1][0], g.points[0][1] - g.points[g.points.length - 1][1]) <=
                  snapDistanceWorld
              if (isClosed) {
                if (activeEditPoint.index === 0) pts[pts.length - 1] = pts[0]
                if (activeEditPoint.index === pts.length - 1) pts[0] = pts[pts.length - 1]
              }
              const nextCenter: [number, number] = [
                pts.reduce((acc, p) => acc + p[0], 0) / pts.length,
                pts.reduce((acc, p) => acc + p[1], 0) / pts.length,
              ]
              return { ...g, points: pts, center: nextCenter }
            }),
          )
          logAction(`key ${comboFromEvent(e)}`, `edit point nudge dx=${dx} dy=${dy}`)
          return
        }
      }
      if (isFast || isNudge) {
        e.preventDefault()
        const nudge = isFast ? nudgeStepFast : nudgeStep
        const dx = e.key === 'ArrowLeft' ? -nudge : e.key === 'ArrowRight' ? nudge : 0
        const dy = e.key === 'ArrowUp' ? -nudge : e.key === 'ArrowDown' ? nudge : 0
        nudgeSelection(dx, dy)
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (!canvasFocused) return
      if (matchKeybinding(e, keymap.rasterHold)) {
        setShowResolutionPreview(false)
        logAction(`key ${comboFromEvent(e)}`, 'raster preview release')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [
    geometry,
    sources,
    monitors,
    selectedItems,
    keymap,
    canvasFocused,
    nudgeStep,
    nudgeStepFast,
    insertShape,
    drawMode,
    activeTool,
    lastCreatedId,
    lastResolutionMode,
    actionLogEnabled,
  ])

  useEffect(() => {
    const onFocus = () => logAction('focus window', 'window focus')
    const onBlur = () => logAction('blur window', 'window blur')
    const onVisibility = () => logAction(`visibility ${document.visibilityState}`, 'visibility change')
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [actionLogEnabled])

  useEffect(() => {
    if (!actionLogOpen) return
    const list = actionLogListRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [actionLogOpen, actionLogEntries.length])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!actionLogDragRef.current.dragging) return
      setActionLogPos((prev) => ({
        ...prev,
        x: Math.max(8, e.clientX - actionLogDragRef.current.offsetX),
        y: Math.max(8, e.clientY - actionLogDragRef.current.offsetY),
      }))
    }
    function onUp() {
      if (!actionLogDragRef.current.dragging) return
      actionLogDragRef.current.dragging = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    if (activeTool !== 'select' && activeTool !== 'edit') {
      setLastPrimaryTool(activeTool)
    }
  }, [activeTool])

  useEffect(() => {
    if (activeTool !== 'edit') {
      setEditPointSelection(null)
      setEditPointHover(null)
      return
    }
    if (selectedType !== 'geometry' || !selectedId) {
      setEditPointSelection(null)
      return
    }
    const geom = geometry.find((g) => g.id === selectedId)
    if (!geom) {
      setEditPointSelection(null)
      return
    }
    if (geom.shape === 'arc' && geom.arc) {
      setEditPointSelection((prev) =>
        prev?.id === geom.id && prev.kind === 'arc'
          ? prev
          : { id: geom.id, index: 2, kind: 'arc' },
      )
      return
    }
    if (!geom.points || geom.points.length === 0) {
      setEditPointSelection(null)
      return
    }
    setEditPointSelection((prev) => {
      if (prev?.id === geom.id && prev.kind === 'poly' && prev.index < geom.points.length) return prev
      return { id: geom.id, index: geom.points.length - 1, kind: 'poly' }
    })
  }, [activeTool, selectedId, selectedType, geometry])

  useEffect(() => {
    editPointSelectionRef.current = editPointSelection
  }, [editPointSelection])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!(e.target instanceof HTMLElement)) return
      if (e.target.closest('.file-menu')) return
      setFileMenuOpen(false)
    }

    if (fileMenuOpen) {
      window.addEventListener('click', onDocClick)
    }
    return () => window.removeEventListener('click', onDocClick)
  }, [fileMenuOpen])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!(e.target instanceof HTMLElement)) return
      if (e.target.closest('.settings-menu')) return
      setSettingsOpen(false)
    }

    if (settingsOpen) {
      window.addEventListener('click', onDocClick)
    }
    return () => window.removeEventListener('click', onDocClick)
  }, [settingsOpen])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const rect = svg.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setScenePixels({ width: rect.width, height: rect.height })
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])



  useEffect(() => {
    if (!show3DPreview || dimension !== '3d') return
    const mount = threeMountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(backgroundColor)
    const camera = new THREE.PerspectiveCamera(45, 1, 1e-9, 1e-2)
    camera.position.set(0, 0, 4e-6)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    mount.appendChild(renderer.domElement)

    const controls = {
      rotX: 0,
      rotY: 0,
      isDragging: false,
      lastX: 0,
      lastY: 0,
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      controls.isDragging = true
      controls.lastX = e.clientX
      controls.lastY = e.clientY
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!controls.isDragging) return
      const dx = e.clientX - controls.lastX
      const dy = e.clientY - controls.lastY
      controls.lastX = e.clientX
      controls.lastY = e.clientY
      controls.rotY += dx * 0.005
      controls.rotX += dy * 0.005
    }
    const onMouseUp = () => {
      controls.isDragging = false
    }

    renderer.domElement.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      renderer.setSize(rect.width, rect.height)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(mount)

    const ambient = new THREE.AmbientLight(0xffffff, 0.75)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 0.6)
    dir.position.set(2, 2, 2)
    scene.add(dir)
    const grid = new THREE.GridHelper(4e-6, 10, 0x334155, 0x1f2937)
    grid.rotateX(Math.PI / 2)
    scene.add(grid)
    const axes = new THREE.AxesHelper(2e-6)
    scene.add(axes)

    const animate = () => {
      scene.rotation.x = controls.rotX
      scene.rotation.y = controls.rotY
      renderer.render(scene, camera)
      threeRef.current!.anim = requestAnimationFrame(animate)
    }

    const dispose = () => {
      cancelAnimationFrame(threeRef.current?.anim ?? 0)
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      resizeObserver.disconnect()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }

    threeRef.current = { renderer, scene, camera, anim: 0, dispose }
    animate()

    return () => {
      dispose()
      threeRef.current = null
    }
  }, [show3DPreview, dimension, backgroundColor])

  useEffect(() => {
    const ctx = threeRef.current
    if (!ctx || dimension !== '3d') return
    const scene = ctx.scene
    const scale = Math.max(Math.abs(cellSize[0] ?? 0), Math.abs(cellSize[1] ?? 0), Math.abs(cellSize[2] ?? 0), 1e-6)
    ctx.camera.position.set(0, 0, scale * 2.2)

    const toColor = (hex: string) => new THREE.Color(hex)
    const mats = materials.reduce<Record<string, THREE.Material>>((acc, m) => {
      acc[m.id] = new THREE.MeshStandardMaterial({ color: toColor(m.color), transparent: true, opacity: 0.6 })
      return acc
    }, {})

    const toRemove: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj.userData?.sunstone) toRemove.push(obj)
    })
    toRemove.forEach((obj) => scene.remove(obj))

    geometry.forEach((g) => {
      if (g.shape === 'block') {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(g.size[0], g.size[1], Math.max(g.sizeZ || 0, 1e-9)),
          mats[g.materialId] ?? new THREE.MeshStandardMaterial({ color: 0x94a3b8 }),
        )
        mesh.position.set(g.center[0], g.center[1], g.centerZ || 0)
        mesh.rotation.z = g.rotation ?? 0
        mesh.userData.sunstone = true
        scene.add(mesh)
      } else if (g.shape === 'cylinder') {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(Math.abs(g.size[0]) * 0.5, Math.abs(g.size[0]) * 0.5, Math.max(g.sizeZ || 0, 1e-9), 24),
          mats[g.materialId] ?? new THREE.MeshStandardMaterial({ color: 0x94a3b8 }),
        )
        mesh.position.set(g.center[0], g.center[1], g.centerZ || 0)
        mesh.userData.sunstone = true
        scene.add(mesh)
      } else if (g.points && (g.shape === 'polyline' || g.shape === 'polygon')) {
        const points = g.points.map((p) => new THREE.Vector3(p[0], p[1], g.centerZ || 0))
        if (g.shape === 'polygon') points.push(points[0])
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x93c5fd }))
        line.userData.sunstone = true
        scene.add(line)
      } else if (g.shape === 'arc' && g.arc) {
        const curve = new THREE.EllipseCurve(
          g.center[0],
          g.center[1],
          g.arc.radius,
          g.arc.radius,
          0,
          Math.PI * 2,
          false,
          0,
        )
        const points = curve.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, g.centerZ || 0))
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x93c5fd }))
        line.userData.sunstone = true
        scene.add(line)
      }
    })

    sources.forEach((s) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1e-6, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf59e0b }))
      mesh.position.set(s.position[0], s.position[1], s.z)
      mesh.userData.sunstone = true
      scene.add(mesh)
    })

    monitors.forEach((m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12e-6, 0.12e-6, 0.12e-6), new THREE.MeshStandardMaterial({ color: 0x22d3ee }))
      mesh.position.set(m.position[0], m.position[1], m.z)
      mesh.userData.sunstone = true
      scene.add(mesh)
    })
  }, [dimension, geometry, sources, monitors, materials, cellSize])

  // Preview polling moved to `ResultsPanel` (no canvas overlay polling in App.tsx).

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!canvasFocused) return
      if (e.code !== 'Space' || isEditableTarget(e.target)) return
      setIsSpacePressed(true)
      e.preventDefault()
    }

    function onKeyUp(e: KeyboardEvent) {
      if (!canvasFocused) return
      if (e.code !== 'Space') return
      setIsSpacePressed(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [canvasFocused])

  const materialsMap = useMemo(() => {
    return materials.reduce<Record<string, { model: string; eps: number; payload?: Record<string, unknown> }>>(
      (acc, m) => {
        acc[m.id] = { model: m.model ?? 'constant', eps: m.eps, payload: m.payload }
        return acc
      },
      {},
    )
  }, [materials])

  const materialColor = useMemo(() => {
    return materials.reduce<Record<string, string>>((acc, m) => {
      acc[m.id] = m.color
      return acc
    }, {})
  }, [materials])

  const safeCellSize = useMemo<[number, number, number]>(() => {
    return [
      Math.max(Math.abs(toFinite(cellSize[0], DEFAULT_DOMAIN[0])), 1e-12),
      Math.max(Math.abs(toFinite(cellSize[1], DEFAULT_DOMAIN[1])), 1e-12),
      Math.max(Math.abs(toFinite(cellSize[2], DEFAULT_DOMAIN[2])), 1e-12),
    ]
  }, [cellSize])

  const specCellSize = useMemo<[number, number, number]>(() => {
    return dimension === '2d'
      ? [safeCellSize[0], safeCellSize[1], 0]
      : [safeCellSize[0], safeCellSize[1], safeCellSize[2]]
  }, [dimension, safeCellSize])

  const safeZoom = useMemo(() => {
    return clampRange(toFinite(zoom, 1), 0.1, 64)
  }, [zoom])

  const viewSize = useMemo(() => {
    return [safeCellSize[0] / safeZoom, safeCellSize[1] / safeZoom] as [number, number]
  }, [safeCellSize, safeZoom])

  const safeViewBox = useMemo(() => {
    const w = safeCellSize[0] / safeZoom
    const h = safeCellSize[1] / safeZoom
    const x = viewCenter[0] - w / 2
    const y = viewCenter[1] - h / 2
    if (![w, h, x, y].every((v) => Number.isFinite(v))) {
      return `${toScene(-DEFAULT_DOMAIN[0] / 2)} ${toScene(-DEFAULT_DOMAIN[1] / 2)} ${toScene(
        DEFAULT_DOMAIN[0],
      )} ${toScene(DEFAULT_DOMAIN[1])}`
    }
    return `${toScene(x)} ${toScene(y)} ${toScene(w)} ${toScene(h)}`
  }, [safeCellSize, safeZoom, viewCenter])

  const safeCellSizeScene = useMemo<[number, number, number]>(() => {
    return [toScene(safeCellSize[0]), toScene(safeCellSize[1]), toScene(safeCellSize[2])]
  }, [safeCellSize])

  const viewCenterScene = useMemo<[number, number]>(() => {
    return [toScene(viewCenter[0]), toScene(viewCenter[1])]
  }, [viewCenter])

  const viewSizeScene = useMemo<[number, number]>(() => {
    return [toScene(viewSize[0]), toScene(viewSize[1])]
  }, [viewSize])

  useEffect(() => {
    if (!isEditDragging) return
    function onMove(e: MouseEvent) {
      const point = getWorldPointFromClient(e.clientX, e.clientY)
      if (!point || !editDragRef.current) return
      editDragPendingRef.current = point
      if (editDragFrameRef.current === null) {
        editDragFrameRef.current = window.requestAnimationFrame(() => {
          const pending = editDragPendingRef.current
          const drag = editDragRef.current
          editDragFrameRef.current = null
          if (!pending || !drag) return
          if (drag.type === 'poly') {
            setGeometry((prev) =>
              prev.map((g) => {
                if (g.id !== drag.id || !g.points) return g
                const nextPoints = g.points.map((p, idx) => (idx === drag.index ? pending : p))
                const nextCenter: [number, number] = [
                  nextPoints.reduce((acc, p) => acc + p[0], 0) / nextPoints.length,
                  nextPoints.reduce((acc, p) => acc + p[1], 0) / nextPoints.length,
                ]
                return { ...g, points: nextPoints, center: nextCenter }
              }),
            )
          } else if (drag.type === 'arc') {
            setGeometry((prev) =>
              prev.map((g) => {
                if (g.id !== drag.id || !g.arc) return g
                const nextArc = { ...g.arc }
                if (drag.index === 0) nextArc.start = pending
                if (drag.index === 1) nextArc.control = pending
                if (drag.index === 2) nextArc.end = pending
                return { ...g, arc: nextArc }
              }),
            )
          } else if (drag.type === 'gradient') {
            setGeometry((prev) =>
              prev.map((g) => {
                if (g.id !== drag.id) return g
                if (!g.start || !g.end) return g
                const next = { ...g }
                if (drag.index === 0) next.start = pending
                if (drag.index === 1) next.end = pending
                const cx = (next.start[0] + next.end[0]) / 2
                const cy = (next.start[1] + next.end[1]) / 2
                next.center = [cx, cy]
                return next
              }),
            )
          } else {
            // no-op fallback
          }
        })
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [isEditDragging, safeCellSize, safeZoom, viewCenter])

  // Track most recently created/edited gradient geometry for Parameterize import
  useEffect(() => {
    try {
      const grads = geometry.filter(g => g.shape === 'gradient')
      if (grads.length > 0) (window as any).__last_drawn_gradient = grads[grads.length - 1]
      else (window as any).__last_drawn_gradient = null
    } catch (e) {
      ;(window as any).__last_drawn_gradient = null
    }
  }, [geometry])

  // Expose current geometry and a helper to apply gradient to geometry so MaterialEditor can update CAD.
  useEffect(() => {
    ;(window as any).__geometry = geometry
    ;(window as any).__applyGradientToGeometry = (materialId: string, gradient: any) => {
      setGeometry((prev) => {
        // find existing geometry that uses this material
        const idx = prev.findIndex((gg) => gg.materialId === materialId)
        if (idx >= 0) {
          const g = prev[idx]
          if (g.shape === 'gradient') {
            const start = gradient.start ? [gradient.start[0], gradient.start[1]] : (g.start || g.center)
            const end = gradient.end ? [gradient.end[0], gradient.end[1]] : (g.end || g.center)
            const next = { ...g, start, end }
            const out = [...prev]
            out[idx] = next
            return out
          } else {
            // convert an existing geometry into a gradient arrow overlay
            const center = g.center || [(g.points?.[0]?.[0] ?? 0), (g.points?.[0]?.[1] ?? 0)]
            const start = gradient.start ? [gradient.start[0], gradient.start[1]] : [center[0] - (g.size?.[0] ?? 1) / 2, center[1]]
            const end = gradient.end ? [gradient.end[0], gradient.end[1]] : [center[0] + (g.size?.[0] ?? 1) / 2, center[1]]
            const arrow = { id: nextId('geom'), shape: 'gradient', center, centerZ: 0, start, end, size: [Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]), 0], materialId }
            return [...prev, arrow]
          }
        }
        // if no geometry uses the material, create a small arrow near origin
        const start = gradient.start ? [gradient.start[0], gradient.start[1]] : [-0.5, 0]
        const end = gradient.end ? [gradient.end[0], gradient.end[1]] : [0.5, 0]
        const arrow = { id: nextId('geom'), shape: 'gradient', center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], centerZ: 0, start, end, size: [Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]), 0], materialId }
        return [...prev, arrow]
      })
    }
    return () => {
      ;(window as any).__applyGradientToGeometry = undefined
      ;(window as any).__geometry = undefined
    }
  }, [geometry, setGeometry])

  // signal to e2e tests that the app has completed initial mount
  useEffect(() => {
    try {
      ;(window as any).__appReady = true
    } catch (e) {}
    return () => { try { (window as any).__appReady = false } catch (e) {} }
  }, [])


  const markerSize = useMemo(() => {
    const viewWidth = safeCellSize[0] / safeZoom
    return Math.max(viewWidth * 0.08, safeCellSize[0] * 0.01)
  }, [safeCellSize, safeZoom])

  const markerScene = useMemo(() => {
    return toScene(markerSize)
  }, [markerSize])

  const displayScale = useMemo(() => {
    return displayUnits === 'um' ? 1e6 : displayUnits === 'nm' ? 1e9 : 1
  }, [displayUnits])

  const sceneUnitsPerPx = useMemo(() => {
    const w = Math.max(scenePixels.width, 1)
    return viewSizeScene[0] / w
  }, [viewSizeScene, scenePixels])

  const overlayStrokeWidth = useMemo(() => {
    const px = Math.max(0.75, overlayFixedPx * overlayLineScale)
    if (!overlayAutoscale) {
      return Math.max(sceneUnitsPerPx * px, 0.25)
    }
    const auto = markerScene * 0.06 * overlayLineScale
    const maxPx = sceneUnitsPerPx * 6 * overlayLineScale
    return Math.max(Math.min(auto, maxPx), sceneUnitsPerPx * 1.2)
  }, [overlayAutoscale, markerScene, sceneUnitsPerPx, overlayFixedPx, overlayLineScale])

  const overlayHandleRadius = useMemo(() => {
    const basePx = Math.max(4, overlayFixedPx * 2)
    return Math.max(sceneUnitsPerPx * basePx, overlayStrokeWidth * 1.4)
  }, [sceneUnitsPerPx, overlayFixedPx, overlayStrokeWidth])

  const selectionStrokeWidth = useMemo(() => {
    const px = Math.max(1.2, overlayFixedPx * 0.9)
    return sceneUnitsPerPx * px
  }, [sceneUnitsPerPx, overlayFixedPx])

  const selectionHandleRadius = useMemo(() => {
    const px = Math.max(4, overlayFixedPx * 2)
    return sceneUnitsPerPx * px
  }, [sceneUnitsPerPx, overlayFixedPx])

  const editSelectRadius = useMemo(() => {
    const px = Math.max(10, overlayFixedPx * 4)
    return sceneUnitsPerPx * px
  }, [sceneUnitsPerPx, overlayFixedPx])

  const overlayFontSize = useMemo(() => {
    const scale = displayFontPt / 18
    if (overlayAutoscale) {
      return markerScene * 0.22 * scale
    }
    return Math.max(sceneUnitsPerPx * displayFontPt, 6)
  }, [overlayAutoscale, markerScene, displayFontPt, sceneUnitsPerPx])


  const snapDistanceWorld = useMemo(() => {
    if (!snapEnabled) return 0
    const w = viewSize[0]
    return (snapDistancePx / Math.max(scenePixels.width, 1)) * w
  }, [snapEnabled, snapDistancePx, viewSize, scenePixels])

  const spec = useMemo(() => {
    return {
      version: '0.1',
      units: { length: 'm', time: 's', frequency: 'Hz' },
      domain: { cell_size: specCellSize, resolution, symmetry: [], dimension },
      boundary_conditions: (boundaryPerFace) ? Object.values(boundaryFaces).map((f, idx) => {
        // map faces in order [px,nx,py,ny,pz,nz] with explicit face labels
        const faces = ['px','nx','py','ny','pz','nz']
        const face = faces[idx]
        return { face, type: f.type, params: f.type === 'pml' ? { pml_thickness: f.thickness ?? 0 } : (f as any).params ?? {} }
      }) : { type: 'pml', pml_thickness: pml },
      materials: materialsMap,
      geometry: geometry.filter((g) => g.shape === 'block' || g.shape === 'cylinder').map((g) => {
        if (g.shape === 'block') {
          return {
            type: 'block',
            size: [g.size[0], g.size[1], dimension === '3d' ? g.sizeZ : 0],
            center: [g.center[0], g.center[1], dimension === '3d' ? g.centerZ : 0],
            material: g.materialId,
          }
        }
        return {
          type: 'cylinder',
          radius: g.size[0] * 0.5,
          height: dimension === '3d' ? g.sizeZ : 0,
          center: [g.center[0], g.center[1], dimension === '3d' ? g.centerZ : 0],
          axis: [0, 0, 1],
          material: g.materialId,
        }
      }),
      sources: sources.map((s) => ({
        type: s.type ?? 'gaussian_pulse',
        center_freq: s.centerFreq,
        fwidth: s.fwidth,
        component: s.component,
        position: [s.position[0], s.position[1], dimension === '3d' ? s.z : 0],
        size: [0, 0, 0],
        waveform_id: s.waveformId ?? undefined,
        metadata: s.metadata,
      })),
      monitors: monitors.map((m) => {
        const base = {
          id: m.id,
          position: [m.position[0], m.position[1], dimension === '3d' ? m.z : 0],
          components: m.components,
          dt: m.dt,
        } as any
        if (m.shape === 'plane') {
          return {
            ...base,
            type: 'plane',
            size: [m.size?.[0] ?? 0, m.size?.[1] ?? 0],
            orientation: m.orientation ?? 0,
            sampling: m.sampling ?? undefined,
          }
        }
        return { ...base, type: 'point' }
      }),
      run_control: { until: 'time', max_time: 2e-12 },
      resources: { mode: 'local' },
      waveforms: waveforms.length > 0 ? waveforms : undefined,
      outputs: {
        field_movie: {
          components: [previewComponent],
          dt: movieDt,
          start_time: movieStart,
          stop_time: movieStop,
          center: [0, 0, 0],
          size: [specCellSize[0], specCellSize[1], 0],
          stride: movieStride,
          max_frames: movieMaxFrames,
        },
        field_snapshot: snapshotEnabled
          ? {
              components: [previewComponent],
              center: [0, 0, 0],
              size: [specCellSize[0], specCellSize[1], 0],
              stride: snapshotStride,
            }
          : undefined,
        field_snapshot_json: snapshotEnabled
          ? {
              component: previewComponent,
              center: [0, 0, 0],
              size: [specCellSize[0], specCellSize[1], 0],
              stride: snapshotStride,
              max_size: 80,
            }
          : undefined,
      },
    }
  }, [
    specCellSize,
    resolution,
    pml,
    materialsMap,
    geometry,
    sources,
    monitors,
    dimension,
    waveforms,
    previewComponent,
    movieDt,
    movieStart,
    movieStop,
    movieStride,
    movieMaxFrames,
    snapshotEnabled,
    snapshotStride,
  ])

  const specText = useMemo(() => JSON.stringify(spec, null, 2), [spec])

  // Resource polling error overlay
  const [resourceError, setResourceError] = useState<string | null>(null)

  useEffect(() => {
    if (!run) return
    const t = window.setInterval(async () => {
      try {
        const r = await getRun(run.id)
        setRun(r)
        // Try resource polling
        const usage = await getResourceUsage(run.id)
        logResource('Polled resource usage:', usage)
        setResourceError(null)
      } catch (e: any) {
        logResource('Resource polling error:', e)
        setResourceError(e?.message || String(e))
      }
    }, 800)
    return () => window.clearInterval(t)
  }, [run?.id])

  useEffect(() => {
    if (project?.name) setProjectName(project.name)
  }, [project?.id])


  async function onCreateProject() {
    setError(null)
    if (!projectName.trim()) {
      setError('Project name is required.')
      return
    }
    setBusy('Creating project…')
    try {
      const p = await createProject(projectName)
      setProject(p)
      setRun(null)
      setArtifacts([])
      setLogs('')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onCreateRun() {
    setError(null)
    if (!project) {
      setError('Create a project first.')
      return
    }
    setBusy('Creating run…')
    try {
      const r = await createRun(project.id, spec)
      setRun(r)
      setArtifacts([])
      setLogs('')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onSubmitRun() {
    setError(null);
    if (!run) {
      setError('Create a run first.');
      return;
    }
    // If Meep, validate cell and geometry sizes before submitting
    if (backend === 'meep') {
      const compatMsg = validateMeep2D(cellSize, geometry);
      if (compatMsg) {
        setMeepCompatWarning(compatMsg);
        // Emit a test-only signal so automation can observe the pre-submit branch
        try {
          ;(window as any).__sunstoneTest = (window as any).__sunstoneTest || {}
          ;(window as any).__sunstoneTest.lastPreSubmit = { kind: 'meep-compat', message: compatMsg }
          if (typeof (window as any).__sunstoneTest.onPreSubmit === 'function') {
            (window as any).__sunstoneTest.onPreSubmit({ kind: 'meep-compat', message: compatMsg })
          }
        } catch (e) {
          // ignore in non-browser contexts
        }
        // DEV LOG
        try { console.debug('[DEV] onSubmitRun pre-submit: meep-compat', { compatMsg, cellSize, resolution, dimension }) } catch(e) {}
        setShowMeepCompatPrompt(true);
        return;
      }
      // Memory estimation (2GB default threshold)
      const memBytes = estimateMeepMemory(cellSize, resolution, dimension);
      const maxBytes = 2 * 1024 * 1024 * 1024; // 2GB
      if (memBytes > maxBytes) {
        setMeepMemoryWarning(`Estimated memory usage for this run is ${(memBytes/1e9).toFixed(2)} GB, which may exceed your system's RAM and cause the run to fail. Reduce resolution or cell size.`);
        setAutoFixSuggestion(autoFixMeepMemory(cellSize, resolution, dimension, maxBytes));
        // Emit a test-only signal so automation can observe the pre-submit memory branch
        try {
          ;(window as any).__sunstoneTest = (window as any).__sunstoneTest || {}
          ;(window as any).__sunstoneTest.lastPreSubmit = { kind: 'meep-memory', memBytes, maxBytes, cellSize, resolution, dimension }
          if (typeof (window as any).__sunstoneTest.onPreSubmit === 'function') {
            (window as any).__sunstoneTest.onPreSubmit({ kind: 'meep-memory', memBytes, maxBytes, cellSize, resolution, dimension })
          }
        } catch (e) {}
        // DEV LOG
        try { console.debug('[DEV] onSubmitRun pre-submit: meep-memory', { memBytes, maxBytes, cellSize, resolution, dimension }) } catch(e) {}
        setShowMeepMemoryPrompt(true);
        return;
      }
    }
    setBusy('Submitting run…');
    try {
      const pythonExec = executionMode === 'ssh' || executionMode === 'slurm' ? (remotePythonExecutable || undefined) : (backend === 'meep' && meepPythonExecutable ? meepPythonExecutable : undefined)

      // If the selected backend does not support plane monitors, prepare an expanded spec override
      let specOverride: any = undefined
      try {
        if (currentBackendCapabilities && currentBackendCapabilities.supports_plane_monitors === false) {
          // import helper translator to expand plane monitors into point grids
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const tr = require('./translators')
          specOverride = tr.prepareSpecForBackend(spec, false)
          try { console.debug('[DEV] submitting with spec_override (expanded plane monitors)', specOverride) } catch (e) {}
        }
      } catch (err) {
        // ignore translation errors here and proceed with original spec
        console.warn('Failed to prepare spec override, continuing with original spec', err)
      }

      await submitRun(run.id, backend, pythonExec, currentBackendOptions || undefined, executionMode, sshTarget || undefined, sshOptions || undefined, specOverride);
      const r = await getRun(run.id);
      setRun(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }
  // Handler to auto-fix for Meep memory
  function autoFixMeepMemoryApply() {
    if (autoFixSuggestion) {
      setCellSize(autoFixSuggestion.cellSize);
      setResolution(autoFixSuggestion.resolution);
      setMeepMemoryWarning(null);
      setShowMeepMemoryPrompt(false);
    }
  }
  {/* Render Meep memory warning prompt */}
  {showMeepMemoryPrompt && (
    <div className="meep-compat-modal" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div className="meep-compat-content" style={{background:'#222',padding:24,borderRadius:10,maxWidth:400,color:'#fff',boxShadow:'0 4px 24px #0008'}}>
        <h3 style={{marginTop:0}}>Meep Memory Warning</h3>
        <div>{meepMemoryWarning}</div>
        {autoFixSuggestion && (
          <div style={{ marginTop: 12, fontSize: 15 }}>
            <div>Suggested fix: resolution → <b>{autoFixSuggestion.resolution}</b>, cell size → <b>{autoFixSuggestion.cellSize.map(v => formatLength(v, displayUnits)).join(', ')}</b></div>
            <div>Estimated new memory: {(autoFixSuggestion.estimated/1e9).toFixed(2)} GB</div>
          </div>
        )}
        <div style={{marginTop: 18, display:'flex',justifyContent:'flex-end',gap:12}}>
          {autoFixSuggestion && <button onClick={autoFixMeepMemoryApply}>Auto-fix and Preview</button>}
          <button onClick={() => setShowMeepMemoryPrompt(false)}>Cancel</button>
        </div>
      </div>
    </div>
  )}

  async function onCancelRun() {
    setError(null)
    if (!run) {
      setError('Create a run first.')
      return
    }
    setBusy('Canceling run…')
    try {
      await cancelRun(run.id)
      const refreshed = await getRun(run.id)
      setRun(refreshed)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRefreshArtifacts() {
    setError(null)
    if (!run) return
    setBusy('Loading artifacts…')
    try {
      const list = await getArtifacts(run.id)
      setArtifacts(list)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRefreshLogs() {
    setError(null)
    if (!run) return
    setBusy('Loading logs…')
    try {
      const txt = await getLogs(run.id, 'stdout')
      setLogs(txt)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  function clearSelection() {
    setSelectedItems([])
    setSelectedId(null)
    setSelectedType(null)
  }

  function getSnapPoints() {
    const points: Array<[number, number]> = []
    const segments: Array<[[number, number], [number, number]]> = []
    geometry.forEach((g) => {
      if (g.points?.length) {
        g.points.forEach((p) => points.push([p[0], p[1]]))
        const segs = g.points.slice(0, -1).map((p, idx) => [p, g.points![idx + 1]] as const)
        if (g.shape === 'polygon' && g.points.length >= 3) {
          segs.push([g.points[g.points.length - 1], g.points[0]] as const)
        }
        segs.forEach(([a, b]) => points.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))
        segs.forEach(([a, b]) => segments.push([a, b]))
      }
      if (g.arc) {
        points.push([g.arc.start[0], g.arc.start[1]])
        points.push([g.arc.end[0], g.arc.end[1]])
        points.push([(g.arc.start[0] + g.arc.end[0]) / 2, (g.arc.start[1] + g.arc.end[1]) / 2])
      }
      if (g.shape === 'block') {
        const halfX = Math.abs(g.size[0] ?? 0) / 2
        const halfY = Math.abs(g.size[1] ?? g.size[0] ?? 0) / 2
        const cx = g.center[0]
        const cy = g.center[1]
        const rect = [
          [cx - halfX, cy - halfY],
          [cx + halfX, cy - halfY],
          [cx + halfX, cy + halfY],
          [cx - halfX, cy + halfY],
        ] as [number, number][]
        rect.forEach((p) => points.push([p[0], p[1]]))
        segments.push([rect[0], rect[1]], [rect[1], rect[2]], [rect[2], rect[3]], [rect[3], rect[0]])
      }
      const halfX = Math.abs(g.size[0] ?? 0) / 2
      const halfY = Math.abs(g.size[1] ?? g.size[0] ?? 0) / 2
      points.push([g.center[0] - halfX, g.center[1] - halfY])
      points.push([g.center[0] + halfX, g.center[1] + halfY])
    })
    sources.forEach((s) => points.push([s.position[0], s.position[1]]))
    monitors.forEach((m) => points.push([m.position[0], m.position[1]]))
    if (segments.length <= 250) {
      for (let i = 0; i < segments.length; i += 1) {
        for (let j = i + 1; j < segments.length; j += 1) {
          const inter = segmentIntersection(segments[i][0], segments[i][1], segments[j][0], segments[j][1])
          if (inter) points.push(inter)
        }
      }
    }
    return points
  }

  function snapPoint(point: [number, number], disable = false) {
    if (disable) return point
    if (!snapEnabled || snapDistanceWorld <= 0) return point
    let best = point
    let bestDist = snapDistanceWorld
    const candidates = getSnapPoints()
    const isDrawPolyline = activeTool === 'draw' && (drawMode === 'polyline' || drawMode === 'polygon')
    const isDrawArc = activeTool === 'draw' && drawMode === 'arc'
    const extra = isDrawPolyline ? sketchPoints : []
    const arcExtra = isDrawArc ? arcPoints : []
    const sketchMidpoints: Array<[number, number]> = []
    if (extra.length >= 2) {
      extra.slice(0, -1).forEach((p, idx) => {
        const next = extra[idx + 1]
        sketchMidpoints.push([(p[0] + next[0]) / 2, (p[1] + next[1]) / 2])
      })
      if (drawMode === 'polygon' && extra.length >= 3) {
        const last = extra[extra.length - 1]
        const first = extra[0]
        sketchMidpoints.push([(last[0] + first[0]) / 2, (last[1] + first[1]) / 2])
      }
    }
    if (arcExtra.length >= 2) {
      const start = arcExtra[0]
      const end = arcExtra[arcExtra.length - 1]
      sketchMidpoints.push([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2])
    }
    const all = candidates.concat(extra).concat(arcExtra).concat(sketchMidpoints)
    all.forEach((p) => {
      const d = Math.hypot(point[0] - p[0], point[1] - p[1])
      if (d <= bestDist) {
        bestDist = d
        best = [p[0], p[1]]
      }
    })
    return best
  }

  function isSelected(itemId: string, type: 'geometry' | 'source' | 'monitor') {
    return selectedItems.some((item) => item.id === itemId && item.type === type)
  }

  function setSelected(itemId: string, type: 'geometry' | 'source' | 'monitor', additive = false) {
    setSelectedId(itemId)
    setSelectedType(type)
    setSelectedItems((prev) => {
      if (!additive) return [{ id: itemId, type }]
      const exists = prev.some((item) => item.id === itemId && item.type === type)
      if (exists) {
        return prev.filter((item) => !(item.id === itemId && item.type === type))
      }
      return [...prev, { id: itemId, type }]
    })
  }

  function deleteSelection() {
    if (selectedItems.length === 0) return
    setGeometry((prev) => prev.filter((g) => !isSelected(g.id, 'geometry')))
    setSources((prev) => prev.filter((s) => !isSelected(s.id, 'source')))
    setMonitors((prev) => prev.filter((m) => !isSelected(m.id, 'monitor')))
    clearSelection()
    pushHistory()
  }

  function nudgeSelection(dx: number, dy: number) {
    if (selectedItems.length === 0) return
    setGeometry((prev) =>
      prev.map((g) =>
        isSelected(g.id, 'geometry')
          ? {
              ...g,
              center: [g.center[0] + dx, g.center[1] + dy],
              points: g.points?.map((p) => [p[0] + dx, p[1] + dy] as [number, number]),
              arc: g.arc
                ? {
                    ...g.arc,
                    start: [g.arc.start[0] + dx, g.arc.start[1] + dy],
                    end: [g.arc.end[0] + dx, g.arc.end[1] + dy],
                  }
                : g.arc,
            }
          : g,
      ),
    )
    setSources((prev) =>
      prev.map((s) => (isSelected(s.id, 'source') ? { ...s, position: [s.position[0] + dx, s.position[1] + dy] } : s)),
    )
    setMonitors((prev) =>
      prev.map((m) => (isSelected(m.id, 'monitor') ? { ...m, position: [m.position[0] + dx, m.position[1] + dy] } : m)),
    )
  }

  function duplicateSelection() {
    if (selectedItems.length === 0) return
    clipboardRef.current = {
      geometry: geometry.filter((g) => isSelected(g.id, 'geometry')),
      sources: sources.filter((s) => isSelected(s.id, 'source')),
      monitors: monitors.filter((m) => isSelected(m.id, 'monitor')),
    }
    pasteClipboard()
  }

  function pasteClipboard() {
    const clip = clipboardRef.current
    if (!clip) return
    const dx = safeCellSize[0] * 0.02
    const dy = safeCellSize[1] * 0.02
    const newGeom = clip.geometry.map((g) => ({
      ...g,
      id: nextId('geom'),
      center: [g.center[0] + dx, g.center[1] + dy],
      points: g.points?.map((p) => [p[0] + dx, p[1] + dy] as [number, number]),
      arc: g.arc
        ? {
            ...g.arc,
            start: [g.arc.start[0] + dx, g.arc.start[1] + dy],
            end: [g.arc.end[0] + dx, g.arc.end[1] + dy],
          }
        : g.arc,
    }))
    const newSources = clip.sources.map((s) => ({
      ...s,
      id: nextId('src'),
      position: [s.position[0] + dx, s.position[1] + dy],
    }))
    const newMonitors = clip.monitors.map((m) => ({
      ...m,
      id: nextId('mon'),
      position: [m.position[0] + dx, m.position[1] + dy],
    }))

    setGeometry((prev) => [...prev, ...newGeom])
    setSources((prev) => [...prev, ...newSources])
    setMonitors((prev) => [...prev, ...newMonitors])
    setSelectedItems([
      ...newGeom.map((g) => ({ id: g.id, type: 'geometry' as const })),
      ...newSources.map((s) => ({ id: s.id, type: 'source' as const })),
      ...newMonitors.map((m) => ({ id: m.id, type: 'monitor' as const })),
    ])
    pushHistory()
  }

  function rotateSelected(angleDeg: number) {
    if (selectedItems.length === 0) return
    const angle = (angleDeg * Math.PI) / 180
    setGeometry((prev) =>
      prev.map((g) => {
        if (!isSelected(g.id, 'geometry')) return g
        if (g.shape === 'block') {
          return { ...g, rotation: (g.rotation ?? 0) + angle }
        }
        if (g.points) {
          const cx = g.center[0]
          const cy = g.center[1]
          const pts = g.points.map((p) => {
            const dx = p[0] - cx
            const dy = p[1] - cy
            return [cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + dx * Math.sin(angle) + dy * Math.cos(angle)] as [
              number,
              number,
            ]
          })
          return { ...g, points: pts }
        }
        return g
      }),
    )
    pushHistory()
  }

  function reflectSelected(axis: 'x' | 'y') {
    if (selectedItems.length === 0) return
    const centers = geometry
      .filter((g) => isSelected(g.id, 'geometry'))
      .map((g) => g.center)
      .concat(sources.filter((s) => isSelected(s.id, 'source')).map((s) => s.position))
      .concat(monitors.filter((m) => isSelected(m.id, 'monitor')).map((m) => m.position))
    const cx = centers.reduce((acc, c) => acc + c[0], 0) / Math.max(centers.length, 1)
    const cy = centers.reduce((acc, c) => acc + c[1], 0) / Math.max(centers.length, 1)

    const flip = (p: [number, number]) =>
      axis === 'x' ? ([p[0], cy - (p[1] - cy)] as [number, number]) : ([cx - (p[0] - cx), p[1]] as [number, number])

    setGeometry((prev) =>
      prev.map((g) =>
        isSelected(g.id, 'geometry')
          ? {
              ...g,
              center: flip(g.center),
              points: g.points?.map((p) => flip(p)),
              arc: g.arc
                ? {
                    ...g.arc,
                    start: flip(g.arc.start),
                    end: flip(g.arc.end),
                  }
                : g.arc,
            }
          : g,
      ),
    )
    setSources((prev) =>
      prev.map((s) => (isSelected(s.id, 'source') ? { ...s, position: flip(s.position) } : s)),
    )
    setMonitors((prev) =>
      prev.map((m) => (isSelected(m.id, 'monitor') ? { ...m, position: flip(m.position) } : m)),
    )
    pushHistory()
  }

  function getWorldPointFromClient(clientX: number, clientY: number) {
    if (!svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width <= 1 || rect.height <= 1) return null
    const w = safeCellSize[0]
    const h = safeCellSize[1]
    const x = ((clientX - rect.left) / rect.width) * w - w / 2
    const y = ((clientY - rect.top) / rect.height) * h - h / 2
    const worldX = x / safeZoom + viewCenter[0]
    const worldY = y / safeZoom + viewCenter[1]
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null
    return [worldX, worldY] as [number, number]
  }

  function getWorldPoint(e: MouseEvent<SVGSVGElement>) {
    return getWorldPointFromClient(e.clientX, e.clientY)
  }

  function applyDrawMode(next: DrawMode) {
    if (next === drawMode) return
    if (next === 'arc') {
      if (sketchPoints.length >= 2) {
        const control = sketchPoints[Math.floor(sketchPoints.length / 2)]
        const nextArc = [sketchPoints[0], control, sketchPoints[sketchPoints.length - 1]]
        setArcPoints(nextArc)
        setSketchPoints([])
        setSketchActive(true)
      }
    } else if (arcPoints.length > 0) {
      setSketchPoints(arcPoints)
      setArcPoints([])
      setSketchActive(true)
    }
    setDrawMode(next)
  }

  function popLastDrawPoint() {
    if (drawMode === 'polyline' || drawMode === 'polygon') {
      setSketchPoints((prev) => {
        const next = prev.slice(0, -1)
        if (next.length === 0) setSketchActive(false)
        return next
      })
      return
    }
    if (drawMode === 'arc') {
      setArcPoints((prev) => {
        const next = prev.slice(0, -1)
        if (next.length === 0) setSketchActive(false)
        return next
      })
    }
  }

  function commitSketchToGeometry() {
    if (activeTool !== 'draw') return
    if (drawMode === 'polyline' || drawMode === 'polygon') {
      if (sketchPoints.length < (drawMode === 'polygon' ? 3 : 2)) return
      const item: GeometryItem = {
        id: nextId('geom'),
        shape: drawMode === 'polygon' ? 'polygon' : 'polyline',
        center: [
          sketchPoints.reduce((acc, p) => acc + p[0], 0) / sketchPoints.length,
          sketchPoints.reduce((acc, p) => acc + p[1], 0) / sketchPoints.length,
        ],
        centerZ: 0,
        size: [0, 0],
        sizeZ: 0,
        materialId: 'sio2',
        points: [...sketchPoints],
        boundaryAction: drawMode === 'polygon' ? 'fill' : 'outline',
        smoothing: 'spline',
      }
      setGeometry((prev) => [...prev, item])
      setLastCreatedId(item.id)
      setSelected(item.id, 'geometry')
      setSketchPoints([])
      setSketchActive(false)
      pushHistory()
      return
    }
    if (drawMode === 'arc' && arcPoints.length === 3) {
      const arc = arcFromPoints(arcPoints[0], arcPoints[1], arcPoints[2])
      if (!arc) return
      const item: GeometryItem = {
        id: nextId('geom'),
        shape: 'arc',
        center: arc.center,
        centerZ: 0,
        size: [0, 0],
        sizeZ: 0,
        materialId: 'sio2',
        arc: { start: arcPoints[0], end: arcPoints[2], radius: arc.radius, control: arcPoints[1] },
        boundaryAction: 'outline',
        smoothing: 'spline',
      }
      setGeometry((prev) => [...prev, item])
      setLastCreatedId(item.id)
      setSelected(item.id, 'geometry')
      setArcPoints([])
      setSketchActive(false)
      pushHistory()
    }
  }

  function handleCanvasClick(e: MouseEvent<SVGSVGElement>) {
    if (drawCompletedRef.current || selectCompletedRef.current) {
      drawCompletedRef.current = false
      selectCompletedRef.current = false
      return
    }
    if (activeTool === 'edit') {
      return
    }
    if (activeTool === 'select') {
      if (!e.shiftKey) {
        clearSelection()
      }
      return
    }
    if (activeTool === 'draw') {
      if (drawMode === 'polyline' || drawMode === 'polygon') {
        const point = getWorldPoint(e)
        if (!point) return
        const snapped = snapPoint(point, e.ctrlKey)
        setSketchActive(true)
        setSketchPoints((prev) => [...prev, snapped])
        setSnapPreview(snapped)
        return
      }
      if (drawMode === 'arc') {
        const point = getWorldPoint(e)
        if (!point) return
        const snapped = snapPoint(point, e.ctrlKey)
        setArcPoints((prev) => [...prev, snapped].slice(0, 3))
        setSnapPreview(snapped)
        return
      }
    }
    if (activeTool === 'measure') {
      const point = getWorldPoint(e)
      if (!point) return
      if (e.shiftKey) {
        if (measurePoints.length === 0) {
          setMeasurePoints([point])
          setMeasureStart(point)
          setMeasureEnd(point)
        } else {
          const nextPoints = [...measurePoints, point]
          setMeasurePoints(nextPoints)
          setMeasureStart(nextPoints[0])
          setMeasureEnd(point)
        }
      } else {
        setMeasurePoints([point])
        setMeasureStart(point)
        setMeasureEnd(point)
      }
      return
    }

    if (activeTool === 'polyline' || activeTool === 'polygon') {
      const point = getWorldPoint(e)
      if (!point) return
      const snapped = snapPoint(point, e.ctrlKey)
      setSketchActive(true)
      setSketchPoints((prev) => [...prev, snapped])
      return
    }

    if (activeTool === 'arc') {
      const point = getWorldPoint(e)
      if (!point) return
      const snapped = snapPoint(point, e.ctrlKey)
      setArcPoints((prev) => [...prev, snapped].slice(0, 3))
      return
    }
    if (activeTool === 'extrude') {
      return
    }
    const point = getWorldPoint(e)
    if (!point) return
    const [worldX, worldY] = point

    if (activeTool === 'shape') {
      const shape: GeometryShape = insertShape === 'ellipse' || insertShape === 'circle' ? 'cylinder' : 'block'
      const size = insertShape === 'circle' || insertShape === 'square' ? [4e-7, 4e-7] : [4e-7, 2e-7]
      const item: GeometryItem = {
        id: nextId('geom'),
        shape,
        center: [worldX, worldY],
        centerZ: 0,
        size,
        sizeZ: 2e-7,
        materialId: 'sio2',
      }
      setGeometry((prev) => [...prev, item])
      setLastCreatedId(item.id)
      setSelected(item.id, 'geometry')
      return
    }

    if (activeTool === 'source') {
      const item: SourceItem = {
        id: nextId('src'),
        position: [worldX, worldY],
        z: 0,
        component: 'Ez',
        centerFreq: 3.75e14,
        fwidth: 5e13,
      }
      setSources((prev) => [...prev, item])
      setSelected(item.id, 'source')
      return
    }

    const item: MonitorItem = {
      id: nextId('mon'),
      position: [worldX, worldY],
      z: 0,
      components: ['Ez'],
      dt: 1e-16,
    }
    setMonitors((prev) => [...prev, item])
    setSelected(item.id, 'monitor')
  }

  function handleCanvasMove(e: MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width <= 1 || rect.height <= 1) return
    if (isPanning && e.buttons === 0) {
      handlePanEnd()
      return
    }
    if (editDragRef.current) {
      return
    }
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    setCursorPct({ x: clamp01(px), y: clamp01(py) })

    if (drawStart && activeTool === 'shape') {
      const point = getWorldPoint(e)
      if (point) setDrawCurrent(point)
      return
    }

    if (activeTool === 'edit') {
      if (selectedType !== 'geometry' || !selectedId) {
        setEditPointHover(null)
      } else {
        const point = getWorldPoint(e)
        const geom = geometry.find((g) => g.id === selectedId)
        if (!point || !geom) {
          setEditPointHover(null)
        } else if (geom.shape === 'arc' && geom.arc) {
          const arcPoints: Array<[number, number]> = [
            geom.arc.start,
            geom.arc.control ?? geom.arc.start,
            geom.arc.end,
          ]
          let bestIndex = -1
          let bestDist = editSelectRadius
          arcPoints.forEach((p, idx) => {
            const d = Math.hypot(point[0] - p[0], point[1] - p[1])
            if (d < bestDist) {
              bestDist = d
              bestIndex = idx
            }
          })
          setEditPointHover(bestIndex >= 0 ? { id: geom.id, index: bestIndex, kind: 'arc' } : null)
        } else if (geom.points?.length) {
          let bestIndex = -1
          let bestDist = editSelectRadius
          geom.points.forEach((p, idx) => {
            const d = Math.hypot(point[0] - p[0], point[1] - p[1])
            if (d < bestDist) {
              bestDist = d
              bestIndex = idx
            }
          })
          setEditPointHover(bestIndex >= 0 ? { id: geom.id, index: bestIndex, kind: 'poly' } : null)
        } else {
          setEditPointHover(null)
        }
      }
    }

    handleSelectMove(e)

    if (activeTool === 'measure' && measureStart) {
      const point = getWorldPoint(e)
      if (point) setMeasureEnd(point)
    }

    if (activeTool === 'extrude' && drawStart) {
      handleExtrudeMove(e)
    }

    if (activeTool === 'draw' && sketchActive && (drawMode === 'polyline' || drawMode === 'polygon')) {
      const point = getWorldPoint(e)
      if (point) {
        const snapped = snapPoint(point, e.ctrlKey)
        setSelectCurrent(snapped)
        setSnapPreview(snapped)
      }
    }

    if (activeTool === 'draw' && drawMode === 'arc' && arcPoints.length > 0) {
      const point = getWorldPoint(e)
      if (point) {
        const snapped = snapPoint(point, e.ctrlKey)
        setSelectCurrent(snapped)
        setSnapPreview(snapped)
      }
    }

    if (activeTool === 'extrude' && dimension === '2d' && drawStart) {
      const point = getWorldPoint(e)
      if (!point) return
      setExtrudeOffset([point[0] - drawStart[0], point[1] - drawStart[1]])
    }

    if (isPanning && panStartRef.current) {
      const dx = (e.clientX - panStartRef.current.x) / rect.width
      const dy = (e.clientY - panStartRef.current.y) / rect.height
      const w = safeCellSize[0] / safeZoom
      const h = safeCellSize[1] / safeZoom
      const nextX = panStartRef.current.cx - dx * w
      const nextY = panStartRef.current.cy - dy * h
      setViewCenter([nextX, nextY])
    }

    if (activeTool === 'select' && moveStartRef.current) {
      const point = getWorldPoint(e)
      if (!point) return
      const dx = point[0] - moveStartRef.current.x
      const dy = point[1] - moveStartRef.current.y
      setGeometry((prev) =>
        prev.map((g) => {
          if (!isSelected(g.id, 'geometry')) return g
          const start = moveStartRef.current?.geometry[g.id]
          return {
            ...g,
            center: [start.center[0] + dx, start.center[1] + dy],
            points: g.points?.map((p, idx) => [
              (start.points?.[idx]?.[0] ?? p[0]) + dx,
              (start.points?.[idx]?.[1] ?? p[1]) + dy,
            ] as [number, number]),
            arc: g.arc
              ? {
                  ...g.arc,
                  start: [start.arc?.start[0] + dx, start.arc?.start[1] + dy],
                  end: [start.arc?.end[0] + dx, start.arc?.end[1] + dy],
                }
              : g.arc,
          }
        }),
      )
      setSources((prev) =>
        prev.map((s) => {
          if (!isSelected(s.id, 'source')) return s
          const start = moveStartRef.current?.sources[s.id]
          return { ...s, position: [start.position[0] + dx, start.position[1] + dy] }
        }),
      )
      setMonitors((prev) =>
        prev.map((m) => {
          if (!isSelected(m.id, 'monitor')) return m
          const start = moveStartRef.current?.monitors[m.id]
          return { ...m, position: [start.position[0] + dx, start.position[1] + dy] }
        }),
      )
    }
  }

  function logAction(input: string, interpreted?: string) {
    if (!actionLogEnabled) return
    const entry: ActionLogEntry = {
      id: nextId('log'),
      ts: Date.now(),
      input,
      interpreted,
    }
    setActionLogEntries((prev) => [...prev, entry].slice(-400))
  }

  function formatActionTimestamp(ts: number) {
    const date = new Date(ts)
    const time = date.toLocaleTimeString('en-US', { hour12: false })
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${time}.${ms}`
  }

  function formatMousePosition(e: MouseEvent<SVGSVGElement>) {
    const point = getWorldPoint(e)
    if (!point) return `screen(${Math.round(e.clientX)},${Math.round(e.clientY)}) world(—)`
    return `screen(${Math.round(e.clientX)},${Math.round(e.clientY)}) world(${point[0].toExponential(3)},${point[1].toExponential(3)})`
  }

  function actionLogText() {
    return actionLogEntries
      .map((entry) => `${formatActionTimestamp(entry.ts)}\t${entry.input}\t${entry.interpreted ?? ''}`)
      .join('\n')
  }

  async function copyActionLog() {
    const text = actionLogText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      logAction('copy action log', 'clipboard write')
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      logAction('copy action log', 'clipboard fallback')
    }
  }

  function updateKeymapField(field: keyof KeymapConfig, value: string) {
    setKeymap((prev) => ({ ...prev, [field]: value }))
  }

  function handleCanvasLeave() {
    setCursorPct(null)
    setSnapPreview(null)
    handlePanEnd()
    logAction('mouseLeave canvas')
  }

  function handleCanvasWheel(e: WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = e.deltaX
    const dy = e.deltaY
    const dominantY = Math.abs(dy) >= Math.abs(dx)
    if (dominantY && Math.abs(dy) > 0.1) {
      const direction = keymap.zoomDirection === 'inverted' ? -1 : 1
      const delta = Math.sign(dy) * direction
      const next = clampRange(safeZoom * (delta > 0 ? 0.92 : 1.08), 0.1, 64)
      setZoom(next)
      return
    }

    if (Math.abs(dx) > 0.1) {
      const w = safeCellSize[0] / safeZoom
      const panX = (dx / rect.width) * w
      setViewCenter([viewCenter[0] + panX, viewCenter[1]])
    }
  }

  async function captureScene() {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 1 || rect.height <= 1) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', `${rect.width}`)
    clone.setAttribute('height', `${rect.height}`)
    clone.style.background = backgroundColor
    const serializer = new XMLSerializer()
    const svgText = serializer.serializeToString(clone)
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(rect.width * captureScale))
      canvas.height = Math.max(1, Math.round(rect.height * captureScale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        return
      }
      ctx.scale(captureScale, captureScale)
      ctx.drawImage(img, 0, 0)
      const dataUrl = canvas.toDataURL('image/png')
      setCaptureDataUrl(dataUrl)
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  async function saveCaptureToFile() {
    if (!captureDataUrl) return
    const picker = (window as any).showSaveFilePicker as
      | ((options?: any) => Promise<any>)
      | undefined
    if (!picker) return
    const res = await fetch(captureDataUrl)
    const blob = await res.blob()
    const handle = await picker({
      suggestedName: 'sunstone-canvas.png',
      types: [
        {
          description: 'PNG Image',
          accept: { 'image/png': ['.png'] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  }

  function handleDrawStart(e: MouseEvent<SVGSVGElement>) {
    if (isPanGesture(e)) return
    if (activeTool !== 'shape') return
    const point = getWorldPoint(e)
    if (!point) return
    setDrawStart(point)
    setDrawCurrent(point)
  }

  function handleExtrudeStart(e: MouseEvent<SVGSVGElement>) {
    if (dimension === '2d') {
      if (activeTool !== 'extrude' || selectedItems.length === 0 || isPanGesture(e)) return
      const point = getWorldPoint(e)
      if (!point) return
      const target = geometry.find((g) => isSelected(g.id, 'geometry'))
      if (!target) return
      extrude2dRef.current = {
        id: target.id,
        shape: target.shape,
        points: target.points ? target.points.map((p) => [p[0], p[1]]) : undefined,
        center: [target.center[0], target.center[1]],
        size: [target.size[0], target.size[1]],
        materialId: target.materialId,
      }
      setDrawStart(point)
      setDrawCurrent(point)
      setExtrudeOffset([0, 0])
      return
    }
    if (activeTool !== 'extrude' || selectedItems.length === 0 || isPanGesture(e)) return
    const point = getWorldPoint(e)
    if (!point) return
    setDrawStart(point)
    setDrawCurrent(point)
  }

  function handleExtrudeMove(e: MouseEvent<SVGSVGElement>) {
    if (activeTool !== 'extrude' || !drawStart) return
    if (dimension === '2d') return
    const point = getWorldPoint(e)
    if (!point) return
    setDrawCurrent(point)
    const dz = Math.abs(point[1] - drawStart[1])
    setGeometry((prev) =>
      prev.map((g) => (isSelected(g.id, 'geometry') ? { ...g, sizeZ: dz } : g)),
    )
  }

  function handleExtrudeEnd() {
    if (activeTool !== 'extrude') return
    if (dimension === '2d') {
      const base = extrude2dRef.current
      const offset = extrudeOffset
      if (base && offset) {
        const dx = offset[0]
        const dy = offset[1]
        const dup: GeometryItem = {
          id: nextId('geom'),
          shape: base.shape,
          center: [base.center[0] + dx, base.center[1] + dy],
          centerZ: 0,
          size: [base.size[0], base.size[1]],
          sizeZ: 0,
          materialId: base.materialId,
          points: base.points ? base.points.map((p) => [p[0] + dx, p[1] + dy]) : undefined,
          boundaryAction: base.shape === 'polygon' ? 'fill' : 'outline',
          smoothing: 'spline',
        }
        const additions: GeometryItem[] = [dup]
        if (base.points && base.points.length >= 2) {
          const loft: GeometryItem = {
            id: nextId('geom'),
            shape: 'polygon',
            center: [base.center[0] + dx * 0.5, base.center[1] + dy * 0.5],
            centerZ: 0,
            size: [0, 0],
            sizeZ: 0,
            materialId: base.materialId,
            points: [...base.points, ...base.points.slice().reverse().map((p) => [p[0] + dx, p[1] + dy])],
            boundaryAction: 'fill',
            smoothing: 'spline',
          }
          additions.push(loft)
        }
        setGeometry((prev) => [...prev, ...additions])
        pushHistory()
      }
      extrude2dRef.current = null
      setExtrudeOffset(null)
      setDrawStart(null)
      setDrawCurrent(null)
      return
    }
    setDrawStart(null)
    setDrawCurrent(null)
    pushHistory()
  }

  function handleDrawEnd() {
    try {
      if (activeTool !== 'shape') return
      if (!drawStart || !drawCurrent) {
        setDrawStart(null)
        setDrawCurrent(null)
        return
      }
      const dx = drawCurrent[0] - drawStart[0]
      const dy = drawCurrent[1] - drawStart[1]
      const rawX = Math.abs(dx)
      const rawY = Math.abs(dy)
      const isSquare = insertShape === 'square' || insertShape === 'circle'
      const sizeX = isSquare ? Math.max(rawX, rawY) : rawX
      const sizeY = isSquare ? Math.max(rawX, rawY) : rawY
      const minSize = Math.min(safeCellSize[0], safeCellSize[1]) * 0.01
      if (!Number.isFinite(sizeX) || !Number.isFinite(sizeY)) {
        setDrawStart(null)
        setDrawCurrent(null)
        return
      }
      if (sizeX < minSize && sizeY < minSize) {
        setDrawStart(null)
        setDrawCurrent(null)
        return
      }
      const center: [number, number] = [
        (drawStart[0] + drawCurrent[0]) / 2,
        (drawStart[1] + drawCurrent[1]) / 2,
      ]

      if (insertShape === 'gradient') {
        const item: GeometryItem = {
          id: nextId('geom'),
          shape: 'gradient',
          center,
          centerZ: 0,
          // store start/end in scene coords
          start: drawStart,
          end: drawCurrent,
          size: [Math.abs(dx), Math.abs(dy), 0.0],
        } as any
        setGeometry((prev) => [...prev, item])
        setDrawStart(null)
        setDrawCurrent(null)
        pushHistory()
        return
      }

      const item: GeometryItem = {
        id: nextId('geom'),
        shape: insertShape === 'ellipse' || insertShape === 'circle' ? 'cylinder' : 'block',
        center,
        centerZ: 0,
        size: [sizeX > minSize ? sizeX : 4e-7, sizeY > minSize ? sizeY : 2e-7],
        sizeZ: 2e-7,
        materialId: 'sio2',
      }

      setGeometry((prev) => [...prev, item])
      setLastCreatedId(item.id)
      setSelected(item.id, 'geometry')
      setDrawStart(null)
      setDrawCurrent(null)
      drawCompletedRef.current = true
    } catch (err) {
      console.error('Draw error', err)
      setError(err instanceof Error ? err.message : String(err))
      setDrawStart(null)
      setDrawCurrent(null)
    }
  }

  function handlePanStart(e: MouseEvent<SVGSVGElement>) {
    if (!isPanGesture(e)) return
    e.preventDefault()
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY, cx: viewCenter[0], cy: viewCenter[1] }
  }

  function handlePanEnd() {
    setIsPanning(false)
    panStartRef.current = null
  }

  function handleMoveStart(e: MouseEvent<SVGSVGElement>) {
    if (activeTool !== 'select' || e.button !== 0 || isPanGesture(e)) return
    const point = getWorldPoint(e)
    if (!point) return
    moveStartRef.current = {
      x: point[0],
      y: point[1],
      geometry: geometry.reduce<Record<string, GeometryItem>>((acc, g) => {
        acc[g.id] = JSON.parse(JSON.stringify(g))
        return acc
      }, {}),
      sources: sources.reduce<Record<string, SourceItem>>((acc, s) => {
        acc[s.id] = { ...s }
        return acc
      }, {}),
      monitors: monitors.reduce<Record<string, MonitorItem>>((acc, m) => {
        acc[m.id] = { ...m }
        return acc
      }, {}),
    }
  }

  function handleMoveEnd() {
    if (moveStartRef.current) {
      moveStartRef.current = null
      pushHistory()
    }
  }

  function handleSelectStart(e: MouseEvent<SVGSVGElement>) {
    if (activeTool !== 'select' || e.button !== 0 || isPanGesture(e)) return
    if (skipSelectRef.current) {
      skipSelectRef.current = false
      return
    }
    const point = getWorldPoint(e)
    if (!point) return
    setSelectStart(point)
    setSelectCurrent(point)
    selectAdditiveRef.current = e.shiftKey
  }

  function handleSelectMove(e: MouseEvent<SVGSVGElement>) {
    if (!selectStart) return
    const point = getWorldPoint(e)
    if (point) setSelectCurrent(point)
  }

  function handleSelectEnd() {
    if (!selectStart || !selectCurrent) {
      setSelectStart(null)
      setSelectCurrent(null)
      return
    }
    const dx = Math.abs(selectCurrent[0] - selectStart[0])
    const dy = Math.abs(selectCurrent[1] - selectStart[1])
    const threshold = Math.min(safeCellSize[0], safeCellSize[1]) * 0.002
    if (dx < threshold && dy < threshold) {
      setSelectStart(null)
      setSelectCurrent(null)
      return
    }
    const minX = Math.min(selectStart[0], selectCurrent[0])
    const maxX = Math.max(selectStart[0], selectCurrent[0])
    const minY = Math.min(selectStart[1], selectCurrent[1])
    const maxY = Math.max(selectStart[1], selectCurrent[1])

    const hits: Array<{ id: string; type: 'geometry' | 'source' | 'monitor' }> = []
    geometry.forEach((g) => {
      if (g.center[0] >= minX && g.center[0] <= maxX && g.center[1] >= minY && g.center[1] <= maxY) {
        hits.push({ id: g.id, type: 'geometry' })
      }
    })
    sources.forEach((s) => {
      if (s.position[0] >= minX && s.position[0] <= maxX && s.position[1] >= minY && s.position[1] <= maxY) {
        hits.push({ id: s.id, type: 'source' })
      }
    })
    monitors.forEach((m) => {
      if (m.position[0] >= minX && m.position[0] <= maxX && m.position[1] >= minY && m.position[1] <= maxY) {
        hits.push({ id: m.id, type: 'monitor' })
      }
    })

    setSelectedItems((prev) => (selectAdditiveRef.current ? [...prev, ...hits] : hits))
    const primary = hits[0]
    if (primary) {
      setSelectedId(primary.id)
      setSelectedType(primary.type)
    }
    setSelectStart(null)
    setSelectCurrent(null)
    selectCompletedRef.current = true
  }

  function clamp01(n: number) {
    return Math.max(0, Math.min(1, n))
  }

  function clampRange(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
  }

  function isPanGesture(e: MouseEvent<SVGSVGElement>) {
    if (e.button === 2) return true
    if (keymap.panMode === 'middle') return e.button === 1
    if (keymap.panMode === 'space') return isSpacePressed && e.button === 0
    return e.shiftKey && e.button === 0
  }

  async function loadReadme(path: string) {
    setReadmeError(null)
    setReadmeContent(null)
    try {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`Unable to load ${path} (${res.status})`)
      const text = await res.text()
      setReadmeContent(text)
      setHelpTab('docs')
    } catch (err) {
      setReadmeError(err instanceof Error ? err.message : String(err))
    }
  }

  function exportBundle() {
    const manifest = {
      format: 'sunstone.bundle',
      version: '0.1',
      name: projectName || 'sunstone-project',
      mode: workspaceMode,
      dimension,
      created_at: new Date().toISOString(),
      cad_path: 'cad.json',
      spec_path: 'spec.json',
      extra: {},
    }

    const cad = {
      materials: materials.map((m) => ({
        id: m.id,
        label: m.label,
        eps: m.eps,
        color: m.color,
        model: m.model ?? 'constant',
      })),
      geometry,
      sources,
      monitors,
      waveforms,
      meshes: meshAssets,
      domain: {
        cell_size: cellSize,
        resolution,
        pml,
      },
      view: {
        center: viewCenter,
        zoom,
        background: backgroundColor,
      },
    }

    downloadJson({ manifest, cad, spec }, `${manifest.name}.sunstone.json`)
  }

  function saveConfigBundle() {
    const payload = {
      format: 'sunstone.config',
      version: '0.1',
      project_name: projectName || 'sunstone-project',
      display: {
        units: displayUnits,
        font_pt: displayFontPt,
        overlay_autoscale: overlayAutoscale,
        overlay_fixed_px: overlayFixedPx,
        overlay_line_scale: overlayLineScale,
        background: backgroundColor,
      },
      view: {
        center: viewCenter,
        zoom,
        slice_z: sliceZ,
      },
      snapping: {
        enabled: snapEnabled,
        distance_px: snapDistancePx,
      },
      nudging: {
        step: nudgeStep,
        step_fast: nudgeStepFast,
      },
      keymap,
      run: {
        backend,
        meep_python_executable: meepPythonExecutable || null,
      },
    }
    downloadJson(payload, `${payload.project_name}.sunstone.config.json`)
  }

  function applyConfigBundle(payload: any) {
    if (!payload || payload.format !== 'sunstone.config') {
      throw new Error('Invalid config file format.')
    }

    if (payload.project_name) setProjectName(String(payload.project_name))

    const display = payload.display ?? {}
    if (display.units) setDisplayUnits(display.units as DisplayUnit)
    if (Number.isFinite(display.font_pt)) setDisplayFontPt(Number(display.font_pt))
    if (typeof display.overlay_autoscale === 'boolean') setOverlayAutoscale(display.overlay_autoscale)
    if (Number.isFinite(display.overlay_fixed_px)) setOverlayFixedPx(Number(display.overlay_fixed_px))
    if (Number.isFinite(display.overlay_line_scale)) setOverlayLineScale(Number(display.overlay_line_scale))
    if (display.background) setBackgroundColor(String(display.background))

    const view = payload.view ?? {}
    if (Array.isArray(view.center) && view.center.length >= 2) {
      setViewCenter([Number(view.center[0] ?? 0), Number(view.center[1] ?? 0)])
    }
    if (Number.isFinite(view.zoom)) setZoom(Number(view.zoom))
    if (Number.isFinite(view.slice_z)) setSliceZ(Number(view.slice_z))

    const snapping = payload.snapping ?? {}
    if (typeof snapping.enabled === 'boolean') setSnapEnabled(snapping.enabled)
    if (Number.isFinite(snapping.distance_px)) setSnapDistancePx(Number(snapping.distance_px))

    const nudging = payload.nudging ?? {}
    if (Number.isFinite(nudging.step)) setNudgeStep(Number(nudging.step))
    if (Number.isFinite(nudging.step_fast)) setNudgeStepFast(Number(nudging.step_fast))

    if (payload.keymap) setKeymap(normalizeKeymap(payload.keymap))

    const run = payload.run ?? {}
    if (run.backend) setBackend(String(run.backend))
    if (typeof run.meep_python_executable === 'string') setMeepPythonExecutable(run.meep_python_executable)
  }

  function exportMaterials() {
    downloadJson({ materials }, 'materials.json')
  }

  // Expose import/export helpers on window for quick actions in other components
  // Previously exposed import/export helpers on window for quick actions in other components.
  // These are intentionally not exposed now — materials are managed from the Properties panel.


  function exportSources() {
    downloadJson({ sources }, 'sources.json')
  }

  function exportGeometry(selectedOnly: boolean) {
    if (selectedOnly && selectedType === 'geometry' && selectedId) {
      downloadJson({ geometry: geometry.filter((g) => g.id === selectedId) }, 'geometry-selected.json')
      return
    }
    downloadJson({ geometry }, 'geometry.json')
  }

  function exportWaveforms() {
    downloadJson({ waveforms }, 'waveforms.json')
  }

  function exportMeshes() {
    downloadJson({ meshes: meshAssets }, 'meshes.json')
  }

  function toStlSolid(name: string, triangles: Array<[[number, number, number], [number, number, number], [number, number, number]]>) {
    const lines = [`solid ${name}`]
    triangles.forEach((tri) => {
      lines.push('  facet normal 0 0 0')
      lines.push('    outer loop')
      tri.forEach((v) => lines.push(`      vertex ${v[0]} ${v[1]} ${v[2]}`))
      lines.push('    endloop')
      lines.push('  endfacet')
    })
    lines.push(`endsolid ${name}`)
    return lines.join('\n')
  }

  function boxTriangles(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    const hx = sx / 2
    const hy = sy / 2
    const hz = sz / 2
    const x0 = cx - hx
    const x1 = cx + hx
    const y0 = cy - hy
    const y1 = cy + hy
    const z0 = cz - hz
    const z1 = cz + hz
    const v = {
      p000: [x0, y0, z0],
      p001: [x0, y0, z1],
      p010: [x0, y1, z0],
      p011: [x0, y1, z1],
      p100: [x1, y0, z0],
      p101: [x1, y0, z1],
      p110: [x1, y1, z0],
      p111: [x1, y1, z1],
    } as const
    return [
      [v.p000, v.p010, v.p110],
      [v.p000, v.p110, v.p100],
      [v.p001, v.p101, v.p111],
      [v.p001, v.p111, v.p011],
      [v.p000, v.p100, v.p101],
      [v.p000, v.p101, v.p001],
      [v.p010, v.p011, v.p111],
      [v.p010, v.p111, v.p110],
      [v.p000, v.p001, v.p011],
      [v.p000, v.p011, v.p010],
      [v.p100, v.p110, v.p111],
      [v.p100, v.p111, v.p101],
    ] as Array<[[number, number, number], [number, number, number], [number, number, number]]>
  }

  function cylinderTriangles(cx: number, cy: number, cz: number, radius: number, height: number, segments = 24) {
    const hz = height / 2
    const z0 = cz - hz
    const z1 = cz + hz
    const tris: Array<[[number, number, number], [number, number, number], [number, number, number]]> = []
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2
      const a1 = ((i + 1) / segments) * Math.PI * 2
      const x0 = cx + Math.cos(a0) * radius
      const y0 = cy + Math.sin(a0) * radius
      const x1 = cx + Math.cos(a1) * radius
      const y1 = cy + Math.sin(a1) * radius
      tris.push([[x0, y0, z0], [x1, y1, z0], [x1, y1, z1]])
      tris.push([[x0, y0, z0], [x1, y1, z1], [x0, y0, z1]])
      tris.push([[cx, cy, z0], [x1, y1, z0], [x0, y0, z0]])
      tris.push([[cx, cy, z1], [x0, y0, z1], [x1, y1, z1]])
    }
    return tris
  }

  function exportStl(selectedOnly: boolean) {
    const list = selectedOnly && selectedType === 'geometry' && selectedId
      ? geometry.filter((g) => g.id === selectedId)
      : geometry
    if (list.length === 0) return
    const defaultThickness = Math.min(cellSize[0], cellSize[1]) * 0.02
    const triangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = []
    list.forEach((g) => {
      const sz = Math.abs(g.sizeZ) > 0 ? Math.abs(g.sizeZ) : defaultThickness
      if (g.shape === 'block') {
        triangles.push(...boxTriangles(g.center[0], g.center[1], g.centerZ ?? 0, g.size[0], g.size[1], sz))
      } else {
        const radius = Math.abs(g.size[0]) * 0.5
        triangles.push(...cylinderTriangles(g.center[0], g.center[1], g.centerZ ?? 0, radius, sz))
      }
    })
    const stl = toStlSolid('sunstone-geometry', triangles)
    const blob = new Blob([stl], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedOnly ? 'geometry-selected.stl' : 'geometry.stl'
    a.click()
    URL.revokeObjectURL(url)
  }

  function normalizeGeometry(items: GeometryItem[] | undefined) {
    if (!items) return []
    return items.map((g) => ({
      ...g,
      centerZ: Number.isFinite(g.centerZ) ? g.centerZ : 0,
      sizeZ: Number.isFinite(g.sizeZ) ? g.sizeZ : 0,
    }))
  }

  function normalizeSources(items: SourceItem[] | undefined) {
    if (!items) return []
    return items.map((s) => ({ ...s, z: Number.isFinite(s.z) ? s.z : 0, orientation: Number.isFinite((s as any).orientation) ? (s as any).orientation : 0 }))
  }

  function normalizeMonitors(items: MonitorItem[] | undefined) {
    if (!items) return []
    return items.map((m) => ({ ...m, z: Number.isFinite(m.z) ? m.z : 0, orientation: Number.isFinite((m as any).orientation) ? (m as any).orientation : 0 }))
  }

  function applyBundle(payload: any) {
    const manifest = payload?.manifest ?? {}
    const cad = payload?.cad ?? payload?.model ?? {}

    const nextMode = manifest?.mode === 'fdtd' ? 'fdtd' : 'cad'
    const nextDim = manifest?.dimension === '3d' ? '3d' : '2d'

    setWorkspaceMode(nextMode)
    setDimension(nextDim)

    if (manifest?.name) setProjectName(String(manifest.name))

    if (cad?.domain?.cell_size) {
      const size = cad.domain.cell_size as [number, number, number]
      setCellSize([
        Number(size[0] ?? cellSize[0]),
        Number(size[1] ?? cellSize[1]),
        Number(size[2] ?? cellSize[2]),
      ])
    }
    if (cad?.domain?.resolution) {
      setResolution(Number(cad.domain.resolution))
    }
    if (cad?.domain?.pml) {
      const p = cad.domain.pml as [number, number, number]
      setPml([Number(p[0] ?? pml[0]), Number(p[1] ?? pml[1]), Number(p[2] ?? pml[2])])
    }

    if (cad?.materials) {
      const mats = (cad.materials as MaterialDef[]).map((m) => ({
        id: m.id,
        label: m.label ?? m.id,
        eps: Number.isFinite(m.eps) ? m.eps : 1.0,
        color: m.color ?? '#94a3b8',
        model: m.model ?? 'constant',
        payload: m.payload,
      }))
      setMaterials(mats)
    }

    if (cad?.geometry) setGeometry(normalizeGeometry(cad.geometry as GeometryItem[]))
    if (cad?.sources) setSources(normalizeSources(cad.sources as SourceItem[]))
    if (cad?.monitors) setMonitors(normalizeMonitors(cad.monitors as MonitorItem[]))
    if (cad?.waveforms) setWaveforms(cad.waveforms as WaveformDef[])
    if (cad?.meshes) setMeshAssets(cad.meshes as MeshAsset[])

    if (cad?.view?.center) {
      const c = cad.view.center as [number, number]
      setViewCenter([Number(c[0] ?? 0), Number(c[1] ?? 0)])
    }
    if (cad?.view?.zoom) setZoom(Number(cad.view.zoom))
    if (cad?.view?.background) setBackgroundColor(String(cad.view.background))

    // If bundle specifies per-face boundary conditions, mirror them into UI state and warn if backend doesn't support it
    const bcs = payload?.boundary_conditions || spec?.boundary_conditions || cad?.boundary_conditions
    if (Array.isArray(bcs) && bcs.some(b => b && typeof b === 'object' && 'face' in b)) {
      setBoundaryPerFace(true)
      const faceOrder = ['px','nx','py','ny','pz','nz']
      const next: Record<string, any> = { ...boundaryFaces }
      bcs.forEach((bc:any) => {
        if (bc && bc.face && faceOrder.includes(bc.face)) {
          next[bc.face] = { type: bc.type, thickness: bc.params?.pml_thickness ?? next[bc.face]?.thickness }
        }
      })
      setBoundaryFaces(next)
      // show a warning if current backend doesn't support per-face boundaries
      const caps = currentBackendCapabilities || {}
      if (!caps?.per_face_boundary) {
        try { setSpecWarnings((w) => ([...(w||[]), 'Per-face boundary settings present in spec; backend may not honor per-face differences'])) } catch (e) {}
      }
    }
  }

  function openImport(kind: ImportKind) {
    setImportKind(kind)
    importInputRef.current?.click()
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text()
      if (importKind === 'mesh') {
        setMeshAssets((prev) => [
          ...prev,
          { id: nextId('mesh'), name: file.name, format: file.name.split('.').pop() ?? 'mesh', content: text },
        ])
        setFileMenuOpen(false)
        return
      }

      const payload = JSON.parse(text)
      if (importKind === 'bundle') {
        applyBundle(payload)
        setFileMenuOpen(false)
        return
      }
      if (importKind === 'config') {
        applyConfigBundle(payload)
        setFileMenuOpen(false)
        return
      }
      if (importKind === 'materials') {
        const mats = (payload.materials ?? payload) as MaterialDef[]
        setMaterials(
          mats.map((m) => ({
            id: m.id,
            label: m.label ?? m.id,
            eps: Number.isFinite(m.eps) ? m.eps : 1.0,
            color: m.color ?? '#94a3b8',
            model: m.model ?? 'constant',
            payload: m.payload,
          })),
        )
        setFileMenuOpen(false)
        return
      }
      if (importKind === 'sources') {
        const list = (payload.sources ?? payload) as SourceItem[]
        setSources(normalizeSources(list))
        setFileMenuOpen(false)
        return
      }
      if (importKind === 'geometry') {
        const list = (payload.geometry ?? payload) as GeometryItem[]
        setGeometry(normalizeGeometry(list))
        setFileMenuOpen(false)
        return
      }
      if (importKind === 'waveforms') {
        const list = (payload.waveforms ?? payload) as WaveformDef[]
        setWaveforms(list)
        setFileMenuOpen(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function frameObjects() {
    const points: Array<[number, number]> = []
    const pushPoint = (p: [number, number] | undefined) => {
      if (!p) return
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return
      points.push(p)
    }
    const padding = Math.max(safeCellSize[0], safeCellSize[1]) * 0.02

    geometry.forEach((g) => {
      if (g.shape === 'block') {
        const halfX = Math.abs(g.size[0] ?? 0) / 2
        const halfY = Math.abs(g.size[1] ?? 0) / 2
        pushPoint([g.center[0] - halfX - padding, g.center[1] - halfY - padding])
        pushPoint([g.center[0] + halfX + padding, g.center[1] + halfY + padding])
        return
      }
      if (g.shape === 'cylinder') {
        const halfX = Math.abs(g.size[0] ?? 0) / 2
        const halfY = Math.abs(g.size[1] ?? g.size[0] ?? 0) / 2
        pushPoint([g.center[0] - halfX - padding, g.center[1] - halfY - padding])
        pushPoint([g.center[0] + halfX + padding, g.center[1] + halfY + padding])
        return
      }
      if (g.points && (g.shape === 'polyline' || g.shape === 'polygon')) {
        g.points.forEach((p) => pushPoint([p[0], p[1]]))
        return
      }
      if (g.shape === 'arc' && g.arc) {
        const r = Math.abs(g.arc.radius ?? 0)
        pushPoint([g.arc.start[0] - padding, g.arc.start[1] - padding])
        pushPoint([g.arc.end[0] + padding, g.arc.end[1] + padding])
        pushPoint([g.center[0] - r - padding, g.center[1] - r - padding])
        pushPoint([g.center[0] + r + padding, g.center[1] + r + padding])
        return
      }
      pushPoint([g.center[0] - padding, g.center[1] - padding])
      pushPoint([g.center[0] + padding, g.center[1] + padding])
    })

    const sourcePad = safeCellSize[0] * 0.05
    sources.forEach((s) => {
      pushPoint([s.position[0] - sourcePad, s.position[1] - sourcePad])
      pushPoint([s.position[0] + sourcePad, s.position[1] + sourcePad])
    })

    const monitorPad = safeCellSize[0] * 0.04
    monitors.forEach((m) => {
      pushPoint([m.position[0] - monitorPad, m.position[1] - monitorPad])
      pushPoint([m.position[0] + monitorPad, m.position[1] + monitorPad])
    })

    if (points.length === 0) return

    const xs = points.map((p) => p[0]).filter((v) => Number.isFinite(v))
    const ys = points.map((p) => p[1]).filter((v) => Number.isFinite(v))
    if (xs.length === 0 || ys.length === 0) return

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const width = Math.max(maxX - minX, safeCellSize[0] * 0.02)
    const height = Math.max(maxY - minY, safeCellSize[1] * 0.02)
    const margin = 1.25
    const targetW = width * margin
    const targetH = height * margin

    const zX = safeCellSize[0] / targetW
    const zY = safeCellSize[1] / targetH
    const nextZoom = Math.min(zX, zY)
    const boundedZoom = clampRange(nextZoom, 0.1, 64)

    setViewCenter([(minX + maxX) / 2, (minY + maxY) / 2])
    if (Number.isFinite(boundedZoom)) {
      setZoom(boundedZoom)
    }
    setIsPanning(false)
    panStartRef.current = null
  }

  function resetView() {
    setZoom(1)
    setViewCenter([0, 0])
    setSliceZ(0)
    setIsPanning(false)
    panStartRef.current = null
  }




  function updateGeometry(id: string, patch: Partial<GeometryItem>) {
    setGeometry((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g
        const nextCenter = patch.center
          ? ([finiteOr(g.center[0], patch.center[0]), finiteOr(g.center[1], patch.center[1])] as [
              number,
              number,
            ])
          : g.center
        const nextSize = patch.size
          ? ([finiteOr(g.size[0], patch.size[0]), finiteOr(g.size[1], patch.size[1])] as [number, number])
          : g.size
        return { ...g, ...patch, center: nextCenter, size: nextSize }
      }),
    )
  }

  function updateSource(id: string, patch: Partial<SourceItem>) {
    setSources((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const nextPos = patch.position
          ? ([finiteOr(s.position[0], patch.position[0]), finiteOr(s.position[1], patch.position[1])] as [
              number,
              number,
            ])
          : s.position
        return { ...s, ...patch, position: nextPos }
      }),
    )
  }

  function updateMonitor(id: string, patch: Partial<MonitorItem>) {
    setMonitors((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        const nextPos = patch.position
          ? ([finiteOr(m.position[0], patch.position[0]), finiteOr(m.position[1], patch.position[1])] as [
              number,
              number,
            ])
          : m.position
        return { ...m, ...patch, position: nextPos }
      }),
    )
  }

  const projectNameMatchesActive =
    !!project && project.name.trim().toLowerCase() === projectName.trim().toLowerCase()

  return (
    <div className={`app ${hideCad ? 'hide-cad' : ''}`}> 
      {resourceError && (
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:2000,background:'#b00',color:'#fff',padding:12}}>
          <b>Resource Monitor Error:</b> {resourceError}
        </div>
      )}
      <header className="header">
        <div>
          <div className="title">SunStone</div>
          <div className="subtitle">Local control plane demo (API: {apiBaseUrl})</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setHideCad((v) => !v)} className={hideCad ? 'primary' : ''}>{hideCad ? 'Show CAD' : 'Hide CAD'}</button>
          <div className="muted">{hideCad ? 'CAD hidden' : 'CAD visible'}</div>
        </div>

      {captureDataUrl && (
        <div className="help-overlay" onClick={() => setCaptureDataUrl(null)}>
          <div className="help-panel" onClick={(e) => e.stopPropagation()}>
            <div className="help-header">
              <div>
                <div className="help-title">Canvas capture</div>
                <div className="muted">PNG export</div>
              </div>
              <button onClick={() => setCaptureDataUrl(null)}>Close</button>
            </div>
            <div className="help-body">
              <img
                src={captureDataUrl}
                alt="Canvas capture"
                style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
              <div className="row" style={{ marginTop: 12 }}>
                <button onClick={saveCaptureToFile}>Save As…</button>
                <a className="button" href={captureDataUrl} download="sunstone-canvas.png">
                  Download PNG
                </a>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                Save As works in browsers that support the File System Access API.
              </div>
            </div>
          </div>
        </div>
      )}
        <div className="right"></div>
      </header>

      <div className="layout-bar">
        <div className="file-menu">
          <button onClick={() => setFileMenuOpen((v) => !v)}>File ▾</button>
          {fileMenuOpen && (
            <div className="file-menu-panel">
              <details className="file-menu-group" open>
                <summary>Save</summary>
                <div className="file-menu-group-body">
                  <button onClick={saveConfigBundle}>Save config</button>
                  <button onClick={exportBundle}>Save bundle</button>
                </div>
              </details>
              <details className="file-menu-group" open>
                <summary>Import</summary>
                <div className="file-menu-group-body">
                  <button onClick={() => openImport('bundle')}>Bundle</button>
                  <button onClick={() => openImport('config')}>Config</button>
                  <button onClick={() => openImport('mesh')}>Shape (STL/OBJ/PLY)</button>
                  <button onClick={() => openImport('materials')}>Material</button>
                  <button onClick={() => openImport('waveforms')}>Waveform</button>
                  <button onClick={() => openImport('sources')}>Sources</button>
                  <button onClick={() => openImport('geometry')}>Geometry (JSON)</button>
                </div>
              </details>
              <details className="file-menu-group" open>
                <summary>Export (all)</summary>
                <div className="file-menu-group-body">
                  <button onClick={exportBundle}>Bundle</button>
                  <button onClick={() => exportGeometry(false)}>Geometry (JSON)</button>
                  <button onClick={() => exportStl(false)}>Shape (STL)</button>
                  <button onClick={exportMaterials}>Material</button>
                  <button onClick={exportWaveforms}>Waveform</button>
                  <button onClick={exportSources}>Sources</button>
                  <button onClick={exportMeshes}>Meshes</button>
                </div>
              </details>
              <details className="file-menu-group" open>
                <summary>Export (selected)</summary>
                <div className="file-menu-group-body">
                  <button onClick={() => exportGeometry(true)}>Geometry (JSON)</button>
                  <button onClick={() => exportStl(true)}>Shape (STL)</button>
                </div>
              </details>
              <input
                ref={importInputRef}
                className="file-menu-hidden-input"
                type="file"
                accept=".json,.sunstone.json,.sunstone.config.json,.stl,.obj,.ply"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  if (file) handleImportFile(file)
                  e.currentTarget.value = ''
                }}
              />
            </div>
          )}
        </div>
        <div className="settings-menu" style={{ position: 'relative' }}>
          <button onClick={() => setSettingsOpen((v) => !v)}>Settings ▾</button>
          {settingsOpen && (
            <div className="settings-panel" style={{ left: 0, right: 'auto' }}>
              {/* ...settings panel content... */}
              <div className="settings-title">Display</div>
              <label>
                Units
                <select value={displayUnits} onChange={(e) => setDisplayUnits(e.target.value as DisplayUnit)}>
                  <option value="m">meters (m)</option>
                  <option value="um">microns (µm)</option>
                  <option value="nm">nanometers (nm)</option>
                </select>
              </label>
              <label>
                Display font size (pt)
                <input
                  type="number"
                  min={10}
                  max={36}
                  step={1}
                  value={displayFontPt}
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    setDisplayFontPt(Number.isFinite(v) ? v : 18)
                  }}
                />
              </label>
              <label>
                Line thickness scale
                <input
                  type="number"
                  min={0.2}
                  max={4}
                  step={0.1}
                  value={overlayLineScale}
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    setOverlayLineScale(Number.isFinite(v) ? v : 1)
                  }}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={overlayAutoscale}
                  onChange={(e) => setOverlayAutoscale(e.target.checked)}
                />
                Autoscale tool overlays with zoom
              </label>
              {!overlayAutoscale && (
                <label>
                  Fixed overlay size (px)
                  <input
                    type="number"
                    min={1}
                    max={12}
                    step={0.5}
                    value={overlayFixedPx}
                    onChange={(e) => {
                      const v = e.currentTarget.valueAsNumber
                      setOverlayFixedPx(Number.isFinite(v) ? v : 2)
                    }}
                  />
                </label>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={snapEnabled}
                  onChange={(e) => setSnapEnabled(e.target.checked)}
                />
                Snap to points
              </label>
              <label>
                Snap distance (px)
                <input
                  type="number"
                  min={2}
                  max={40}
                  step={1}
                  value={snapDistancePx}
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    setSnapDistancePx(Number.isFinite(v) ? v : 8)
                  }}
                />
              </label>
              <label>
                Nudge step (m)
                <input
                  type="number"
                  step="1e-9"
                  value={nudgeStep}
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    setNudgeStep(Number.isFinite(v) ? v : nudgeStep)
                  }}
                />
              </label>
              <label>
                Nudge step fast (m)
                <input
                  type="number"
                  step="1e-8"
                  value={nudgeStepFast}
                  onChange={(e) => {
                    const v = e.currentTarget.valueAsNumber
                    setNudgeStepFast(Number.isFinite(v) ? v : nudgeStepFast)
                  }}
                />
              </label>
              <label className="check">
                <input type="checkbox" checked={showCenters} onChange={(e) => setShowCenters(e.target.checked)} />
                Show centers
              </label>
              <label className="check">
                <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
                Show markers
              </label>
              <div className="field">
                <label>Background</label>
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <button onClick={() => setHelpOpen(true)}>Help</button>
        <button onClick={() => setShowTools((v) => !v)}>{showTools ? 'Hide' : 'Show'} Tools</button>
        <button onClick={() => setShowProperties((v) => !v)}>{showProperties ? 'Hide' : 'Show'} Properties</button>
        <button onClick={() => setShowRunPanel((v) => !v)}>{showRunPanel ? 'Hide' : 'Show'} Run</button>
        <button onClick={() => setActionLogOpen((v) => !v)}>{actionLogOpen ? 'Hide' : 'Show'} Action Log</button>
        <button onClick={() => setCanvasMaximized((v) => !v)}>
          {canvasMaximized ? 'Restore layout' : 'Maximize canvas'}
        </button>
        <button
          onClick={() => {
            setShowTools(true)
            setShowProperties(true)
            setShowRunPanel(true)
            setCanvasMaximized(false)
          }}
        >
          Reset layout
        </button>
      </div>

      <main
        className="workspace"
        style={{
          ['--left' as string]: canvasMaximized || !showTools ? '0px' : `${leftWidth}px`,
          ['--right' as string]: canvasMaximized || !showProperties ? '0px' : `${rightWidth}px`,
          ['--rows' as string]: showRunPanel && !canvasMaximized ? 'auto minmax(220px, 1fr)' : 'auto',
        }}
      >
        {showTools && !canvasMaximized && (
          <section className="panel tools">
          <h2>Project</h2>
          <div className="row">
            <label>
              Name
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </label>
            <button onClick={onCreateProject} disabled={!!busy}>
              Create
            </button>
          </div>
          <div className="kv">
            <div className="k">Active</div>
            <div className="v mono">{project ? `${project.name} (${project.id})` : '—'}</div>
          </div>
          {/* dev-only: Meep memory modal trigger removed from Tools panel to declutter UI */}
          {(busy || error) && (
            <div className="field">
              {busy && <div className="muted">{busy}</div>}
              {error && <div className="error">{error}</div>}
            </div>
          )}

          <h2>Workspace</h2>
          <label>
            Mode
            <select value={workspaceMode} onChange={(e) => setWorkspaceMode(e.target.value as WorkspaceMode)}>
              <option value="cad">CAD</option>
              <option value="fdtd">EM</option>
            </select>
          </label>
          <label>
            Dimension
            <select value={dimension} onChange={(e) => setDimension(e.target.value as SimulationDimension)}>
              <option value="2d">2D</option>
              <option value="3d">3D</option>
            </select>
          </label>

          <h2>CAD Tools</h2>

          <h2>View</h2>
          <label>
            Render
            <select value={renderMode} onChange={(e) => setRenderMode(e.target.value as any)}>
              <option value="none">None</option>
              <option value="cell-centers">Cell Centers</option>
              <option value="rasterize">Rasterize</option>
              <option value="gradient-overlay">Gradient overlay</option>
            </select>
          </label>
          <div className="tool-section">
            <div className="row compact">
            <button
              className={activeTool === 'shape' ? 'primary' : ''}
              onClick={() => setActiveTool(insertShape === 'source' || insertShape === 'detector' ? (insertShape === 'source' ? 'source' : 'monitor') : 'shape')}
            >
              Insert
            </button>
            <select
              value={insertShape}
              onChange={(e) => {
                const next = e.target.value as InsertShape
                setInsertShape(next)
                if (next === 'source') setActiveTool('source')
                else if (next === 'detector') setActiveTool('monitor')
                else setActiveTool('shape')
              }}
            >
              <option value="rectangle">Rectangle</option>
              <option value="square">Square</option>
              <option value="ellipse">Ellipse</option>
              <option value="circle">Circle</option>
              <option value="source">Source</option>
              <option value="detector">Detector</option>
              <option value="gradient">Gradient arrow</option>
            </select>
            </div>

            <h2>View</h2>
            <label>
              Render
              <select value={renderMode} onChange={(e) => {
                const v = e.target.value as any
                if (v === 'discretize-preview') {
                  setShowDiscretizeModal(true)
                  // don't change renderMode until user fetches and selects a backend
                  return
                }
                setRenderMode(v)
              }}>
                <option value="none">None</option>
                <option value="cell-centers">Cell Centers</option>
                <option value="rasterize">Rasterize</option>
                <option value="gradient-overlay">Gradient overlay</option>
                <option value="discretize-preview">Discretize preview…</option>
              </select>
            </label>

            {/* Active discretize backend indicator + refresh */}
            <div style={{ marginTop: 8 }}>
              {currentDiscretizeBackend ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="muted">Preview backend</div>
                  <div style={{ fontFamily: 'monospace' }}>{currentDiscretizeBackend}</div>
                  <div style={{ marginLeft: 'auto' }}>
                    <button onClick={() => {
                      // clear cache entries for this backend and reset render
                      setDiscretizeCache((prev) => {
                        const out: Record<string, any[]> = {}
                        for (const k of Object.keys(prev)) {
                          if (!k.startsWith(`${currentDiscretizeBackend}:`)) out[k] = prev[k]
                        }
                        return out
                      })
                      setCurrentDiscretizeBackend(null)
                      setRenderMode('none')
                    }}>Refresh preview</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="tool-section draw-section">
            <div className="row compact">
            <button
              className={activeTool === 'draw' ? 'primary' : ''}
              onClick={() => setActiveTool('draw')}
            >
              Draw
            </button>
            <select value={drawMode} onChange={(e) => applyDrawMode(e.target.value as DrawMode)}>
              <option value="polyline">Polyline</option>
              <option value="polygon">Polygon</option>
              <option value="arc">Arc</option>
            </select>
            <button
              onClick={commitSketchToGeometry}
              title="Commit sketch to geometry"
              disabled={activeTool !== 'draw'}
            >
              Commit
            </button>
            <button
              onClick={() => {
                setSketchPoints([])
                setArcPoints([])
                setSketchActive(false)
              }}
              title="Clear active sketch"
              disabled={activeTool !== 'draw'}
            >
              Clear
            </button>
            </div>
          </div>
          <div className="tool-grid">
            {([
              { id: 'select', label: 'Select' },
              { id: 'edit', label: 'Edit' },
              { id: 'measure', label: 'Measure' },
              { id: 'extrude', label: 'Extrude' },
            ] as const).map((t) => (
              <button
                key={t.id}
                className={activeTool === t.id ? 'primary' : ''}
                onClick={() => setActiveTool(t.id)}
                title={t.id === 'extrude' && dimension === '2d' ? 'Extrude duplicates/lofts in 2D' : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

          <h2>View</h2>
          <div className="row compact">
            <button onClick={() => setZoom((z) => clampRange(z * 1.1, 0.1, 64))}>Zoom in</button>
            <button onClick={() => setZoom((z) => clampRange(z / 1.1, 0.1, 64))}>Zoom out</button>
          </div>
          <div className="field view-spacing">
            <label>Resolution preview (F1 = hold, F2 = toggle)</label>
            <select
              value={resolutionPreviewMode}
              onChange={(e) => {
                const next = e.target.value as 'off' | 'grid' | 'dots' | 'raster' | 'translated'
                setResolutionPreviewMode(next)
                if (next !== 'off') setLastResolutionMode(next)
              }}
            >
              <option value="off">Off</option>
              <option value="dots">Cell centers</option>
              <option value="raster">Rasterized (grid)</option>
              {currentBackendCapabilities?.supports_translation && (
                <option value="translated">Translated preview ({backend})</option>
              )}
            </select>
          </div>
          <div className="kv">
            <div className="k">View center</div>
            <div className="v mono">
              {formatLength(viewCenter[0], displayUnits)}, {formatLength(viewCenter[1], displayUnits)}
            </div>
            <div className="k">Zoom</div>
            <div className="v mono">{safeZoom.toFixed(2)}</div>
            {dimension === '3d' && (
              <>
                <div className="k">Slice Z</div>
                <div className="v mono">{formatLength(sliceZ, displayUnits)}</div>
              </>
            )}
          </div>
          {dimension === '3d' && (
            <div className="field">
              <label>Slice Z ({displayUnits === 'um' ? 'µm' : displayUnits})</label>
              <input
                type="number"
                value={toDisplayLength(sliceZ, displayUnits)}
                step={1e-8 * displayScale}
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber
                  setSliceZ(Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : sliceZ)
                }}
              />
            </div>
          )}
          {dimension === '3d' && (
            <label className="check">
              <input type="checkbox" checked={show3DPreview} onChange={(e) => setShow3DPreview(e.target.checked)} />
              Show 3D viewport
            </label>
          )}

          <h2>Domain</h2>
          <div className="field">
            <label>Cell size (x, y, z) ({displayUnits === 'um' ? 'µm' : displayUnits})</label>
            <div className="row">
              <input
                type="number"
                value={toDisplayLength(cellSize[0], displayUnits)}
                step={1e-7 * displayScale}
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber
                  setCellSize([
                    Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : cellSize[0],
                    cellSize[1],
                    cellSize[2],
                  ])
                }}
              />
              <input
                type="number"
                value={toDisplayLength(cellSize[1], displayUnits)}
                step={1e-7 * displayScale}
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber
                  setCellSize([
                    cellSize[0],
                    Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : cellSize[1],
                    cellSize[2],
                  ])
                }}
              />
              <input
                type="number"
                value={toDisplayLength(cellSize[2], displayUnits)}
                step={1e-7 * displayScale}
                disabled={dimension === '2d'}
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber
                  setCellSize([
                    cellSize[0],
                    cellSize[1],
                    Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : cellSize[2],
                  ])
                }}
              />
            </div>
          </div>
          <div className="field">
            <label>Resolution</label>
            <input
              type="number"
              value={resolution}
              step="1"
              min={8}
              max={200}
              onChange={(e) => {
                const v = e.currentTarget.valueAsNumber
                setResolution(Number.isFinite(v) ? v : resolution)
              }}
            />
          </div>
          {/* PML thickness is backend-dependent and hidden from Tools to reduce clutter. */}
          </section>
        )}

        <section className="panel canvas">
          <div className="canvas-toolbar">
            <div>
              Active tool:{' '}
              <span className="mono">
                {activeTool === 'shape'
                  ? `insert:${insertShape}`
                  : activeTool === 'draw'
                    ? `draw:${drawMode}`
                    : activeTool}
              </span>
              <span className="muted"> · {workspaceMode.toUpperCase()} · {dimension.toUpperCase()}</span>
            </div>
            <div className="muted">
              Click to place. Drag to size insert shapes. Select to edit.{' '}
              {keymap.panMode === 'middle'
                ? 'Middle mouse drag to pan.'
                : keymap.panMode === 'space'
                  ? 'Space+drag to pan.'
                  : 'Shift+drag to pan.'}{' '}
              Right-drag to pan. Shift+click to multi-select. Drag in Select for box selection. Measure tool: click two points.
            </div>
          </div>
          <div className="canvas-wrap">
            <svg
              ref={svgRef}
              className="scene"
              viewBox={safeViewBox}
              tabIndex={0}
              onFocus={() => {
                setCanvasFocused(true)
                logAction('focus canvas', 'canvas focus')
              }}
              onBlur={() => {
                setCanvasFocused(false)
                setIsSpacePressed(false)
                logAction('blur canvas', 'canvas blur')
              }}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMove}
              onMouseLeave={handleCanvasLeave}
              onWheel={handleCanvasWheel}
              onMouseDown={(e) => {
                svgRef.current?.focus()
                logAction(
                  `mouseDown b=${e.button} shift=${e.shiftKey} ctrl=${e.ctrlKey} alt=${e.altKey} ${formatMousePosition(e)}`,
                  `tool ${activeTool}`,
                )
                handlePanStart(e)
                handleDrawStart(e)
                handleSelectStart(e)
                handleMoveStart(e)
                handleExtrudeStart(e)
              }}
              onMouseUp={(e) => {
                logAction(`mouseUp b=${e.button} ${formatMousePosition(e)}`, `tool ${activeTool}`)
                if (editDragRef.current) {
                  logAction(`mouseUp b=${e.button}`, 'edit drag end')
                  const drag = editDragRef.current
                  if (drag.type === 'poly') {
                    setGeometry((prev) =>
                      prev.map((g) => {
                        if (g.id !== drag.id || !g.points || drag.index >= g.points.length) return g
                        let nearestIndex = -1
                        let bestDist = snapDistanceWorld
                        g.points.forEach((p, idx) => {
                          if (idx === drag.index) return
                          const d = Math.hypot(p[0] - g.points[drag.index][0], p[1] - g.points[drag.index][1])
                          if (d < bestDist) {
                            bestDist = d
                            nearestIndex = idx
                          }
                        })
                        if (nearestIndex < 0) return g
                        const target = g.points[nearestIndex]
                        const nextPoints = g.points.map((p, idx) => (idx === drag.index ? target : p))
                        const isClosed =
                          g.shape === 'polyline' &&
                          g.points.length > 2 &&
                          Math.hypot(g.points[0][0] - g.points[g.points.length - 1][0], g.points[0][1] - g.points[g.points.length - 1][1]) <=
                            snapDistanceWorld
                        const isEndpointMerge =
                          isClosed &&
                          ((drag.index === 0 && nearestIndex === g.points.length - 1) ||
                            (drag.index === g.points.length - 1 && nearestIndex === 0))
                        const merged =
                          bestDist <= snapDistanceWorld * 0.5 && !isEndpointMerge
                            ? nextPoints.filter((_, idx) => idx !== drag.index)
                            : nextPoints
                        if (isEndpointMerge) {
                          merged[0] = target
                          merged[merged.length - 1] = target
                        }
                        const nextCenter: [number, number] = [
                          merged.reduce((acc, p) => acc + p[0], 0) / merged.length,
                          merged.reduce((acc, p) => acc + p[1], 0) / merged.length,
                        ]
                        return { ...g, points: merged, center: nextCenter }
                      }),
                    )
                  }
                  editDragRef.current = null
                  editDragPendingRef.current = null
                  if (editDragFrameRef.current !== null) {
                    window.cancelAnimationFrame(editDragFrameRef.current)
                    editDragFrameRef.current = null
                  }
                  setIsEditDragging(false)
                  pushHistory()
                }
                handlePanEnd()
                handleDrawEnd()
                handleSelectEnd()
                handleMoveEnd()
                handleExtrudeEnd()
              }}
              onDoubleClick={() => {
                if (activeTool === 'draw' && (drawMode === 'polyline' || drawMode === 'polygon') && sketchPoints.length >= 2) {
                  const isClosed =
                    sketchPoints.length >= 3 &&
                    Math.hypot(
                      sketchPoints[0][0] - sketchPoints[sketchPoints.length - 1][0],
                      sketchPoints[0][1] - sketchPoints[sketchPoints.length - 1][1],
                    ) <= snapDistanceWorld
                  const shape = drawMode === 'polygon' || isClosed ? 'polygon' : 'polyline'
                  const points = isClosed ? sketchPoints.slice(0, -1) : sketchPoints
                  const item: GeometryItem = {
                    id: nextId('geom'),
                    shape,
                    center: [
                      points.reduce((acc, p) => acc + p[0], 0) / points.length,
                      points.reduce((acc, p) => acc + p[1], 0) / points.length,
                    ],
                    centerZ: 0,
                    size: [0, 0],
                    sizeZ: 0,
                    materialId: 'sio2',
                    points: [...points],
                    boundaryAction: shape === 'polygon' ? 'fill' : 'outline',
                    smoothing: 'none',
                  }
                  setGeometry((prev) => [...prev, item])
                  setSketchPoints([])
                  setSketchActive(false)
                  pushHistory()
                }
                if (activeTool === 'draw' && drawMode === 'arc' && arcPoints.length === 3) {
                  const arc = arcFromPoints(arcPoints[0], arcPoints[1], arcPoints[2])
                  if (arc) {
                    const item: GeometryItem = {
                      id: nextId('geom'),
                      shape: 'arc',
                      center: arc.center,
                      centerZ: 0,
                      size: [0, 0],
                      sizeZ: 0,
                      materialId: 'sio2',
                      arc: { start: arcPoints[0], end: arcPoints[2], radius: arc.radius, control: arcPoints[1] },
                      boundaryAction: 'outline',
                      smoothing: 'none',
                    }
                    setGeometry((prev) => [...prev, item])
                    setArcPoints([])
                    pushHistory()
                  }
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                logAction(`contextMenu shift=${e.shiftKey} ${formatMousePosition(e)}`, `tool ${activeTool}`)
                if (activeTool === 'draw') {
                  if (e.detail >= 2) {
                    popLastDrawPoint()
                    return
                  }
                  if (drawMode === 'arc') {
                    if (arcPoints.length === 3) {
                      commitSketchToGeometry()
                    } else {
                      setArcPoints([])
                      setSketchActive(false)
                    }
                    return
                  }
                  if (drawMode === 'polyline' || drawMode === 'polygon') {
                    if (sketchPoints.length >= (drawMode === 'polygon' ? 3 : 2)) {
                      commitSketchToGeometry()
                    } else {
                      setSketchPoints([])
                      setSketchActive(false)
                    }
                    return
                  }
                }
                if (activeTool === 'measure') {
                  setMeasureStart(null)
                  setMeasureEnd(null)
                  setMeasurePoints([])
                }
              }}
              style={{ '--scene-bg': backgroundColor } as CSSProperties}
            >
              <defs>
                <pattern
                  id="grid"
                  width={safeCellSizeScene[0] / 20}
                  height={safeCellSizeScene[1] / 20}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${safeCellSizeScene[0] / 20} 0 L 0 0 0 ${safeCellSizeScene[1] / 20}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </pattern>
              </defs>
              <rect
                x={-safeCellSizeScene[0] / 2}
                y={-safeCellSizeScene[1] / 2}
                width={safeCellSizeScene[0]}
                height={safeCellSizeScene[1]}
                fill="url(#grid)"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />

              {selectStart && selectCurrent && (
                <rect
                  x={toScene(Math.min(selectStart[0], selectCurrent[0]))}
                  y={toScene(Math.min(selectStart[1], selectCurrent[1]))}
                  width={toScene(Math.abs(selectCurrent[0] - selectStart[0]))}
                  height={toScene(Math.abs(selectCurrent[1] - selectStart[1]))}
                  fill="rgba(37,99,235,0.15)"
                  stroke="rgba(37,99,235,0.7)"
                  strokeWidth={1}
                />
              )}

              {(showResolutionPreview || resolutionPreviewMode !== 'off') && (() => {
                const mode = showResolutionPreview ? lastResolutionMode : resolutionPreviewMode
                const step = resolution > 0 ? 1 / (resolution * displayScale) : 0
                if (!Number.isFinite(step) || step <= 0) return null
                const maxCells = 140
                const nx = Math.floor(safeCellSize[0] / step)
                const ny = Math.floor(safeCellSize[1] / step)
                if (nx > maxCells || ny > maxCells) return null
                const halfW = safeCellSize[0] / 2
                const halfH = safeCellSize[1] / 2
                if (mode === 'translated') {
                  const txt = translationPreviews[backend]
                  if (!txt) {
                    return (
                      <g>
                        <text x={-halfW + 8} y={-halfH + 18} fontSize={12} fill="#ffcc66">Translated preview not available for this backend. Click "Translate" in the Run panel.</text>
                      </g>
                    )
                  }
                  return (
                    <foreignObject x={-halfW} y={-halfH} width={safeCellSizeScene[0]} height={safeCellSizeScene[1]}>
                      <div xmlns="http://www.w3.org/1999/xhtml" style={{ background: 'rgba(10,12,16,0.86)', color: '#e8e8e8', padding: 8, overflow: 'auto', maxHeight: '100%', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Translated preview ({backend})</div>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12, margin: 0 }}>{txt}</pre>
                      </div>
                    </foreignObject>
                  )
                }
                if (mode === 'raster') {
                  const cells: JSX.Element[] = []
                  const cellRadius = step * 0.5
                  for (let i = 0; i < nx; i += 1) {
                    for (let j = 0; j < ny; j += 1) {
                      const cx = -halfW + (i + 0.5) * step
                      const cy = -halfH + (j + 0.5) * step
                      let fillColor: string | null = null
                      for (const g of geometry) {
                        if (g.shape === 'polygon' && g.points?.length) {
                          if (pointInPolygon([cx, cy], g.points)) {
                            fillColor = materialColor[g.materialId] ?? '#94a3b8'
                            break
                          }
                        }
                        if (g.shape === 'polyline' && g.points?.length) {
                          const segments = g.points.slice(0, -1).map((p, idx) => [p, g.points![idx + 1]] as const)
                          if (segments.some(([a, b]) => pointSegmentDistance([cx, cy], a, b) <= cellRadius)) {
                            fillColor = materialColor[g.materialId] ?? '#94a3b8'
                            break
                          }
                        }
                        if (g.shape === 'arc' && g.arc) {
                          const d = Math.abs(Math.hypot(cx - g.arc.center[0], cy - g.arc.center[1]) - g.arc.radius)
                          if (d <= cellRadius) {
                            fillColor = materialColor[g.materialId] ?? '#94a3b8'
                            break
                          }
                        }
                        if (g.shape === 'block') {
                          const halfX = Math.abs(g.size[0] ?? 0) / 2
                          const halfY = Math.abs(g.size[1] ?? g.size[0] ?? 0) / 2
                          if (Math.abs(cx - g.center[0]) <= halfX && Math.abs(cy - g.center[1]) <= halfY) {
                            fillColor = materialColor[g.materialId] ?? '#94a3b8'
                            break
                          }
                        }
                        if (g.shape === 'cylinder') {
                          const rx = Math.abs(g.size[0] ?? 0) / 2
                          const ry = Math.abs(g.size[1] ?? g.size[0] ?? 0) / 2
                          if (rx > 0 && ry > 0) {
                            const dx = (cx - g.center[0]) / rx
                            const dy = (cy - g.center[1]) / ry
                            if (dx * dx + dy * dy <= 1) {
                              fillColor = materialColor[g.materialId] ?? '#94a3b8'
                              break
                            }
                          }
                        }
                      }
                      if (fillColor) {
                        cells.push(
                          <rect
                            key={`rc-${i}-${j}`}
                            x={toScene(cx - step * 0.5)}
                            y={toScene(cy - step * 0.5)}
                            width={toScene(step)}
                            height={toScene(step)}
                            fill={fillColor}
                            fillOpacity={0.5}
                            stroke={hexToRgba(fillColor, 0.6)}
                            strokeWidth={sceneUnitsPerPx * 0.6}
                            vectorEffect="non-scaling-stroke"
                          />,
                        )
                      }
                    }
                  }
                  return <g>{cells}</g>
                }
                if (mode === 'dots') {
                  const dots: JSX.Element[] = []
                  for (let i = 0; i <= nx; i += 1) {
                    for (let j = 0; j <= ny; j += 1) {
                      const x = -halfW + i * step
                      const y = -halfH + j * step
                      dots.push(
                        <circle
                          key={`rd-${i}-${j}`}
                          cx={toScene(x)}
                          cy={toScene(y)}
                          r={sceneUnitsPerPx * 1.2}
                          fill="rgba(56,189,248,0.25)"
                          vectorEffect="non-scaling-stroke"
                        />,
                      )
                    }
                  }
                  return <g>{dots}</g>
                }
                const lines: JSX.Element[] = []
                for (let i = 0; i <= nx; i += 1) {
                  const x = -halfW + i * step
                  lines.push(
                    <line
                      key={`rx-${i}`}
                      x1={toScene(x)}
                      y1={toScene(-halfH)}
                      x2={toScene(x)}
                      y2={toScene(halfH)}
                      stroke="rgba(56,189,248,0.15)"
                      strokeWidth={sceneUnitsPerPx}
                      vectorEffect="non-scaling-stroke"
                    />,
                  )
                }
                for (let j = 0; j <= ny; j += 1) {
                  const y = -halfH + j * step
                  lines.push(
                    <line
                      key={`ry-${j}`}
                      x1={toScene(-halfW)}
                      y1={toScene(y)}
                      x2={toScene(halfW)}
                      y2={toScene(y)}
                      stroke="rgba(56,189,248,0.15)"
                      strokeWidth={sceneUnitsPerPx}
                      vectorEffect="non-scaling-stroke"
                    />,
                  )
                }
                return <g>{lines}</g>
              })()}

              {snapEnabled && snapPreview && activeTool === 'draw' && (
                <circle
                  cx={toScene(snapPreview[0])}
                  cy={toScene(snapPreview[1])}
                  r={overlayHandleRadius * 0.9}
                  fill="rgba(255,255,255,0.9)"
                  stroke="rgba(37,99,235,0.9)"
                  strokeWidth={overlayStrokeWidth}
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
              )}

              {activeTool === 'extrude' && dimension === '2d' && extrudeOffset && selectedId && (
                (() => {
                  const g = geometry.find((item) => item.id === selectedId)
                  if (!g || !g.points?.length) return null
                  const dx = extrudeOffset[0]
                  const dy = extrudeOffset[1]
                  return (
                    <polyline
                      points={g.points.map((p) => `${toScene(p[0] + dx)},${toScene(p[1] + dy)}`).join(' ')}
                      fill="none"
                      stroke="rgba(99,102,241,0.7)"
                      strokeWidth={overlayStrokeWidth}
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="6 4"
                    />
                  )
                })()
              )}

              {activeTool === 'draw' && (drawMode === 'polyline' || drawMode === 'polygon') && sketchPoints.length > 0 && (
                <polyline
                  points={[
                    ...sketchPoints,
                    ...(sketchActive && selectCurrent ? [selectCurrent] : []),
                  ]
                    .filter((p, idx, arr) => idx === 0 || p[0] !== arr[idx - 1][0] || p[1] !== arr[idx - 1][1])
                    .map((p) => `${toScene(p[0])},${toScene(p[1])}`)
                    .join(' ')}
                  fill={drawMode === 'polygon' ? 'rgba(37,99,235,0.15)' : 'none'}
                  stroke="rgba(37,99,235,0.9)"
                  strokeWidth={overlayStrokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
              )}
              {activeTool === 'draw' && (drawMode === 'polyline' || drawMode === 'polygon') && sketchPoints.length > 1 && (
                <g>
                  {(() => {
                    const points = [
                      ...sketchPoints,
                      ...(sketchActive && selectCurrent ? [selectCurrent] : []),
                    ]
                    const segments = points.length >= 2 ? points.slice(0, -1).map((p, idx) => [p, points[idx + 1]]) : []
                    if (drawMode === 'polygon' && points.length >= 3 && !selectCurrent) {
                      segments.push([points[points.length - 1], points[0]])
                    }
                    return segments.map(([a, b], idx) => {
                      const mx = (a[0] + b[0]) / 2
                      const my = (a[1] + b[1]) / 2
                      return (
                        <circle
                          key={`mid-${idx}`}
                          cx={toScene(mx)}
                          cy={toScene(my)}
                          r={overlayHandleRadius * 0.75}
                          fill="rgba(148,163,184,0.9)"
                          vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        />
                      )
                    })
                  })()}
                </g>
              )}

              {activeTool === 'draw' && drawMode === 'arc' && arcPoints.length > 0 && (
                <polyline
                  points={[...arcPoints, ...(selectCurrent ? [selectCurrent] : [])]
                    .map((p) => `${toScene(p[0])},${toScene(p[1])}`)
                    .join(' ')}
                  fill="none"
                  stroke="rgba(37,99,235,0.9)"
                  strokeWidth={overlayStrokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
              )}
              {activeTool === 'draw' && drawMode === 'arc' && (() => {
                const points = [...arcPoints, ...(selectCurrent ? [selectCurrent] : [])]
                if (points.length !== 3) return null
                const arc = arcFromPoints(points[0], points[1], points[2])
                if (!arc) return null
                const path = `M ${toScene(points[0][0])} ${toScene(points[0][1])} A ${toScene(
                  arc.radius,
                )} ${toScene(arc.radius)} 0 0 1 ${toScene(points[2][0])} ${toScene(points[2][1])}`
                const ax = points[0][0]
                const ay = points[0][1]
                const bx = points[2][0]
                const by = points[2][1]
                const cx = points[1][0]
                const cy = points[1][1]
                const dx = bx - ax
                const dy = by - ay
                const t = dx * dx + dy * dy > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy) : 0
                const px = ax + dx * t
                const py = ay + dy * t
                return (
                  <path
                    d={path}
                    fill="none"
                    stroke="rgba(37,99,235,0.9)"
                    strokeWidth={overlayStrokeWidth}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                  />
                )
              })()}
              {activeTool === 'draw' && drawMode === 'arc' && arcPoints.length >= 2 && (
                <line
                  x1={toScene(arcPoints[0][0])}
                  y1={toScene(arcPoints[0][1])}
                  x2={toScene(arcPoints[arcPoints.length - 1][0])}
                  y2={toScene(arcPoints[arcPoints.length - 1][1])}
                  stroke="rgba(148,163,184,0.7)"
                  strokeDasharray="6 4"
                  strokeWidth={overlayStrokeWidth}
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
              )}
              {activeTool === 'draw' && drawMode === 'arc' && (() => {
                const points = [...arcPoints, ...(selectCurrent ? [selectCurrent] : [])]
                if (points.length !== 3) return null
                const [a, c, b] = points
                const dx = b[0] - a[0]
                const dy = b[1] - a[1]
                const denom = dx * dx + dy * dy
                const t = denom > 0 ? ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / denom : 0
                const px = a[0] + dx * t
                const py = a[1] + dy * t
                return (
                  <g>
                    <line
                      x1={toScene(c[0])}
                      y1={toScene(c[1])}
                      x2={toScene(px)}
                      y2={toScene(py)}
                      stroke="rgba(148,163,184,0.7)"
                      strokeDasharray="4 4"
                      strokeWidth={overlayStrokeWidth}
                      vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                    />
                    <circle
                      cx={toScene(px)}
                      cy={toScene(py)}
                      r={Math.max(overlayStrokeWidth * 1.1, markerScene * 0.05)}
                      fill="rgba(148,163,184,0.9)"
                      vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                    />
                  </g>
                )
              })()}

              {/* Preview overlay removed; use the ResultsPanel for live detector views. */}

              {measureStart && measureEnd && Number.isFinite(measureStart[0]) && Number.isFinite(measureStart[1]) && Number.isFinite(measureEnd[0]) && Number.isFinite(measureEnd[1]) && (
                <g>
                  {(() => {
                    const points = measurePoints.length > 0 ? measurePoints : [measureStart]
                    const lastPoint = points[points.length - 1]
                    const liveEnd = measureEnd
                    const pathPoints = [...points, liveEnd]
                    const linePoints = pathPoints.map((p) => `${toScene(p[0])},${toScene(p[1])}`).join(' ')

                    const segments: number[] = []
                    for (let i = 0; i < pathPoints.length - 1; i += 1) {
                      const a = pathPoints[i]
                      const b = pathPoints[i + 1]
                      segments.push(Math.hypot(b[0] - a[0], b[1] - a[1]))
                    }
                    const total = segments.reduce((acc, v) => acc + v, 0)
                    const avg = segments.length > 0 ? total / segments.length : 0
                    const variance =
                      segments.length > 0
                        ? segments.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / segments.length
                        : 0
                    const std = Math.sqrt(variance)
                    const displacement = Math.hypot(liveEnd[0] - points[0][0], liveEnd[1] - points[0][1])

                    const midX = (lastPoint[0] + liveEnd[0]) / 2
                    const midY = (lastPoint[1] + liveEnd[1]) / 2
                    const fontSize = overlayFontSize
                    const labelWidth = Math.max(fontSize * 6, fontSize * 3.5)
                    const pointRadius = Math.max(overlayStrokeWidth * 1.4, markerScene * 0.08)
                    return (
                      <>
                        <polyline
                          points={linePoints}
                          fill="none"
                          stroke="rgba(34,197,94,0.9)"
                          strokeWidth={overlayStrokeWidth}
                          vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        />
                        <circle
                          cx={toScene(measureStart[0])}
                          cy={toScene(measureStart[1])}
                          r={pointRadius}
                          fill="rgba(34,197,94,0.9)"
                          vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        />
                        <circle
                          cx={toScene(measureEnd[0])}
                          cy={toScene(measureEnd[1])}
                          r={pointRadius}
                          fill="rgba(34,197,94,0.9)"
                          vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        />
                        <text
                          x={toScene(midX)}
                          y={toScene(midY)}
                          fill="rgba(34,197,94,0.95)"
                          fontSize={fontSize}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          paintOrder="stroke"
                          stroke="rgba(2,6,23,0.75)"
                          strokeWidth={fontSize * 0.25}
                        >
                          <tspan
                            x={toScene(midX)}
                            dy={-fontSize * 0.9}
                            textLength={labelWidth}
                            lengthAdjust="spacingAndGlyphs"
                          >
                            {`Σ ${formatLength(total, displayUnits)}`}
                          </tspan>
                          <tspan
                            x={toScene(midX)}
                            dy={fontSize * 1.1}
                            textLength={labelWidth}
                            lengthAdjust="spacingAndGlyphs"
                          >
                            {`Δ ${formatLength(displacement, displayUnits)}`}
                          </tspan>
                          <tspan
                            x={toScene(midX)}
                            dy={fontSize * 1.1}
                            textLength={labelWidth}
                            lengthAdjust="spacingAndGlyphs"
                          >
                            {`μ ${formatLength(avg, displayUnits)} ± ${formatLength(std, displayUnits)}`}
                          </tspan>
                        </text>
                      </>
                    )
                  })()}
                </g>
              )}


              {showCenters && (
                <g>
                  <line
                    x1={-safeCellSizeScene[0] * 0.02}
                    y1={0}
                    x2={safeCellSizeScene[0] * 0.02}
                    y2={0}
                    stroke="rgba(99,102,241,0.9)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={0}
                    y1={-safeCellSizeScene[1] * 0.02}
                    x2={0}
                    y2={safeCellSizeScene[1] * 0.02}
                    stroke="rgba(99,102,241,0.9)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}

            <g ref={objectsGroupRef}>
            {geometry.map((g) => (
              <g
                key={g.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(g.id, 'geometry', e.shiftKey)
                }}
                onMouseDown={(e) => {
                  skipSelectRef.current = true
                  handleMoveStart(e)
                }}
                className={
                  isSelected(g.id, 'geometry') && (g.shape === 'block' || g.shape === 'cylinder') ? 'selected' : ''
                }
              >
                {activeTool === 'edit' && isSelected(g.id, 'geometry') && g.points?.length && (
                  <g>
                    {g.points.map((p, idx) => (
                        <circle
                          key={`edit-${g.id}-${idx}`}
                          cx={toScene(p[0])}
                          cy={toScene(p[1])}
                          r={
                            editPointSelection?.id === g.id &&
                            editPointSelection.kind === 'poly' &&
                            editPointSelection.index === idx
                              ? selectionHandleRadius * 1.7
                              : editPointHover?.id === g.id &&
                                  editPointHover.kind === 'poly' &&
                                  editPointHover.index === idx
                                ? selectionHandleRadius * 1.5
                                : selectionHandleRadius * 1.3
                          }
                        fill={
                          editPointSelection?.id === g.id &&
                          editPointSelection.kind === 'poly' &&
                          editPointSelection.index === idx
                            ? '#fef08a'
                            : editPointHover?.id === g.id &&
                                editPointHover.kind === 'poly' &&
                                editPointHover.index === idx
                              ? '#fde047'
                              : 'rgba(255,255,255,0.95)'
                        }
                        stroke={
                          editPointSelection?.id === g.id &&
                          editPointSelection.kind === 'poly' &&
                          editPointSelection.index === idx
                            ? '#facc15'
                            : editPointHover?.id === g.id &&
                                editPointHover.kind === 'poly' &&
                                editPointHover.index === idx
                              ? '#fbbf24'
                              : 'rgba(37,99,235,0.9)'
                        }
                        strokeWidth={selectionStrokeWidth}
                        vectorEffect="non-scaling-stroke"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          editDragRef.current = {
                            id: g.id,
                            type: 'poly',
                            index: idx,
                            points: g.points ?? [],
                          }
                          setEditPointSelection({ id: g.id, index: idx, kind: 'poly' })
                          logAction(
                            `mouseDown b=${e.button} ${formatMousePosition(e)}`,
                            `edit drag start vertex ${idx}`,
                          )
                        }}
                      />
                    ))}
                  </g>
                )}
                {activeTool === 'edit' && isSelected(g.id, 'geometry') && g.shape === 'arc' && g.arc && (
                  <g>
                    {([g.arc.start, g.arc.control ?? g.arc.start, g.arc.end] as Array<[number, number]>).map(
                      (p, idx) => (
                        <circle
                          key={`edit-arc-${g.id}-${idx}`}
                          cx={toScene(p[0])}
                          cy={toScene(p[1])}
                          r={
                            editPointSelection?.id === g.id &&
                            editPointSelection.kind === 'arc' &&
                            editPointSelection.index === idx
                              ? selectionHandleRadius * 1.4
                              : editPointHover?.id === g.id &&
                                  editPointHover.kind === 'arc' &&
                                  editPointHover.index === idx
                                ? selectionHandleRadius * 1.2
                                : selectionHandleRadius
                          }
                          fill={
                            editPointSelection?.id === g.id &&
                            editPointSelection.kind === 'arc' &&
                            editPointSelection.index === idx
                              ? '#fef08a'
                              : editPointHover?.id === g.id &&
                                  editPointHover.kind === 'arc' &&
                                  editPointHover.index === idx
                                ? '#fde047'
                                : 'rgba(255,255,255,0.95)'
                          }
                          stroke={
                            editPointSelection?.id === g.id &&
                            editPointSelection.kind === 'arc' &&
                            editPointSelection.index === idx
                              ? '#facc15'
                              : editPointHover?.id === g.id &&
                                  editPointHover.kind === 'arc' &&
                                  editPointHover.index === idx
                                ? '#fbbf24'
                                : 'rgba(14,165,233,0.9)'
                          }
                          strokeWidth={selectionStrokeWidth}
                          vectorEffect="non-scaling-stroke"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            editDragRef.current = {
                              id: g.id,
                              type: 'arc',
                              index: idx,
                              points: [g.arc.start, g.arc.control ?? g.arc.start, g.arc.end],
                            }
                            setIsEditDragging(true)
                            setEditPointSelection({ id: g.id, index: idx, kind: 'arc' })
                            logAction(
                              `mouseDown b=${e.button} ${formatMousePosition(e)}`,
                              `edit drag start arc ${idx}`,
                            )
                          }}
                        />
                      ),
                    )}
                  </g>
                )}
                {(() => {
                  const cx = toScene(toFinite(g.center[0], 0))
                  const cy = toScene(toFinite(g.center[1], 0))
                  const sx = Math.max(
                    Math.abs(toScene(toFinite(g.size[0], safeCellSize[0] * 0.1))),
                    safeCellSizeScene[0] * 0.02,
                  )
                  const sy = Math.max(
                    Math.abs(toScene(toFinite(g.size[1], safeCellSize[1] * 0.1))),
                    safeCellSizeScene[1] * 0.02,
                  )
                  const inSlice =
                    dimension !== '3d' ||
                    Math.abs((g.centerZ ?? 0) - sliceZ) <= Math.max(Math.abs(g.sizeZ ?? 0) * 0.5, 1e-9)
                  const fillOpacity = inSlice ? 0.6 : 0.12
                  const strokeOpacity = inSlice ? 1 : 0.3

                  if (g.shape === 'polygon' && g.points?.length) {
                    const pts = g.points.map((p) => `${toScene(p[0])},${toScene(p[1])}`).join(' ')
                    const smooth = g.smoothing && g.smoothing !== 'none'
                    const fill = g.boundaryAction === 'outline' ? 'none' : materialColor[g.materialId] ?? '#94a3b8'
                    return (
                      <polygon
                        points={pts}
                        fill={fill}
                        fillOpacity={g.boundaryAction === 'outline' ? 0 : 0.25}
                        stroke={materialColor[g.materialId] ?? '#94a3b8'}
                        strokeWidth={overlayStrokeWidth}
                        vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        strokeLinejoin={smooth ? 'round' : 'miter'}
                        strokeLinecap={smooth ? 'round' : 'butt'}
                        onMouseDown={(e) => {
                          if (activeTool !== 'edit' || !isSelected(g.id, 'geometry') || !g.points) return
                          if (e.button !== 0) return
                          e.stopPropagation()
                          const point = getWorldPoint(e)
                          if (!point) return
                          let bestIndex = 0
                          let bestDist = Number.POSITIVE_INFINITY
                          g.points.forEach((p, idx) => {
                            const d = Math.hypot(point[0] - p[0], point[1] - p[1])
                            if (d < bestDist) {
                              bestDist = d
                              bestIndex = idx
                            }
                          })
                          if (bestDist > editSelectRadius) return
                          editDragRef.current = {
                            id: g.id,
                            type: 'poly',
                            index: bestIndex,
                            points: g.points ?? [],
                          }
                          setIsEditDragging(true)
                          setEditPointSelection({ id: g.id, index: bestIndex, kind: 'poly' })
                          logAction(
                            `mouseDown b=${e.button} ${formatMousePosition(e)}`,
                            `edit drag start vertex ${bestIndex}`,
                          )
                        }}
                        onContextMenu={(e) => {
                          if (activeTool !== 'edit' || !isSelected(g.id, 'geometry') || !g.points) return
                          e.preventDefault()
                          e.stopPropagation()
                          const point = getWorldPoint(e)
                          if (!point) return
                          if (e.shiftKey && g.points.length > 2) {
                            let bestIndex = 0
                            let bestDist = Number.POSITIVE_INFINITY
                            g.points.forEach((p, idx) => {
                              const d = Math.hypot(point[0] - p[0], point[1] - p[1])
                              if (d < bestDist) {
                                bestDist = d
                                bestIndex = idx
                              }
                            })
                            const next = g.points.filter((_, i) => i !== bestIndex)
                            const nextCenter: [number, number] = [
                              next.reduce((acc, pt) => acc + pt[0], 0) / next.length,
                              next.reduce((acc, pt) => acc + pt[1], 0) / next.length,
                            ]
                            updateGeometry(g.id, { points: next, center: nextCenter })
                            pushHistory()
                            return
                          }
                          let bestIndex = 0
                          let bestDist = Number.POSITIVE_INFINITY
                          const points = g.points
                          const segments = points.length >= 2 ? points.slice(0, -1).map((p, idx) => [p, points[idx + 1]]) : []
                          if (points.length >= 3) {
                            segments.push([points[points.length - 1], points[0]])
                          }
                          segments.forEach(([a, b], idx) => {
                            const [cx, cy] = closestPointOnSegment(a, b, point)
                            const d = Math.hypot(point[0] - cx, point[1] - cy)
                            if (d < bestDist) {
                              bestDist = d
                              bestIndex = idx
                            }
                          })
                          if (bestDist > snapDistanceWorld * 1.5) return
                          const [mx, my] = [
                            (points[bestIndex][0] + points[bestIndex + 1][0]) / 2,
                            (points[bestIndex][1] + points[bestIndex + 1][1]) / 2,
                          ]
                          const useMidpoint = Math.hypot(point[0] - mx, point[1] - my) <= snapDistanceWorld
                          const insertPoint = useMidpoint ? ([mx, my] as [number, number]) : point
                          const nextPoints = [...points]
                          nextPoints.splice(bestIndex + 1, 0, insertPoint)
                          updateGeometry(g.id, { points: nextPoints })
                          pushHistory()
                        }}
                      />
                    )
                  }

                  if (g.shape === 'gradient') {
                    const sx = toScene((g.start && g.start[0]) ?? g.center[0])
                    const sy = toScene((g.start && g.start[1]) ?? g.center[1])
                    const ex = toScene((g.end && g.end[0]) ?? g.center[0])
                    const ey = toScene((g.end && g.end[1]) ?? g.center[1])

                    // Render as gradient overlay if enabled
                    if (renderMode === 'gradient-overlay') {
                      // compute gradient stops via util
                      try {
                        const { generateGradientStops } = Gradients as any
                        const start = [(g.start && g.start[0]) ?? g.center[0], (g.start && g.start[1]) ?? g.center[1]]
                        const end = [(g.end && g.end[0]) ?? g.center[0], (g.end && g.end[1]) ?? g.center[1]]
                        const stops = generateGradientStops(materials.find(m => m.id === g.materialId) ?? {}, start, end, 8)
                        const gradId = `grad-${g.id}`
                        const len = Math.hypot(ex - sx, ey - sy) || 1
                        const halfW = Math.min(10, len * 0.1)
                        const dx = ex - sx
                        const dy = ey - sy
                        const nx = -dy / len * halfW
                        const ny = dx / len * halfW
                        const p1 = `${sx + nx},${sy + ny}`
                        const p2 = `${ex + nx},${ey + ny}`
                        const p3 = `${ex - nx},${ey - ny}`
                        const p4 = `${sx - nx},${sy - ny}`
                        return (
                          <g>
                            <defs>
                              <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={ex} y2={ey}>
                                {stops.map((s: any, i: number) => (
                                  <stop key={i} offset={`${Math.round(s.offset * 100)}%`} stopColor={s.color} stopOpacity={s.alpha} />
                                ))}
                              </linearGradient>
                            </defs>
                            <polygon points={`${p1} ${p2} ${p3} ${p4}`} fill={`url(#${gradId})`} />
                            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#fff" strokeWidth={1} opacity={0.4} />
                          </g>
                        )
                      } catch (e) {
                        // fallback to simple arrow
                      }
                    }

                    // Render discretized slices when active
                    if (currentDiscretizeBackend && discretizeCache) {
                      const key = `${currentDiscretizeBackend}:${g.id}:${g.materialId}`
                      const slices = discretizeCache[key] || null
                      if (slices && slices.length > 0) {
                        return (
                          <g>
                            {slices.map((slice: any, i: number) => (
                              <polygon key={i} points={slice.points.map((p: any) => `${toScene(p[0])},${toScene(p[1])}`).join(' ')} fill={slice.color ?? 'rgba(180,180,180,0.6)'} stroke="rgba(0,0,0,0.2)" />
                            ))}
                            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#fff" strokeWidth={1} opacity={0.4} />
                          </g>
                        )
                      }
                    }

                    const dx = ex - sx
                    const dy = ey - sy
                    const len = Math.sqrt(dx * dx + dy * dy) || 1
                    const headLen = Math.min(12, len * 0.2)
                    const hx = ex - (dx / len) * headLen
                    const hy = ey - (dy / len) * headLen
                    const perpX = -(dy / len) * (headLen * 0.5)
                    const perpY = (dx / len) * (headLen * 0.5)
                    const color = materialColor[g.materialId] ?? g.color ?? '#fbbf24'
                    return (
                      <g>
                        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={overlayStrokeWidth} vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'} />
                        <polygon points={`${ex},${ey} ${hx + perpX},${hy + perpY} ${hx - perpX},${hy - perpY}`} fill={color} />
                        {activeTool === 'edit' && isSelected(g.id, 'geometry') && (
                          <g>
                            <circle cx={sx} cy={sy} r={selectionHandleRadius} fill="#fff" stroke="#222" strokeWidth={1} vectorEffect="non-scaling-stroke" onMouseDown={(e) => {
                              e.stopPropagation()
                              editDragRef.current = { id: g.id, type: 'gradient', index: 0 }
                              setIsEditDragging(true)
                              setEditPointSelection({ id: g.id, index: 0, kind: 'gradient' })
                            }} />
                            <circle cx={ex} cy={ey} r={selectionHandleRadius} fill="#fff" stroke="#222" strokeWidth={1} vectorEffect="non-scaling-stroke" onMouseDown={(e) => {
                              e.stopPropagation()
                              editDragRef.current = { id: g.id, type: 'gradient', index: 1 }
                              setIsEditDragging(true)
                              setEditPointSelection({ id: g.id, index: 1, kind: 'gradient' })
                            }} />
                          </g>
                        )}
                      </g>
                    )
                  }

                  if (g.shape === 'polyline' && g.points?.length) {
                    const pts = g.points.map((p) => `${toScene(p[0])},${toScene(p[1])}`).join(' ')
                    const smooth = g.smoothing && g.smoothing !== 'none'
                    return (
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={materialColor[g.materialId] ?? '#94a3b8'}
                        strokeWidth={overlayStrokeWidth}
                        vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        strokeLinejoin={smooth ? 'round' : 'miter'}
                        strokeLinecap={smooth ? 'round' : 'butt'}
                        onMouseDown={(e) => {
                          if (activeTool !== 'edit' || !isSelected(g.id, 'geometry') || !g.points) return
                          if (e.button !== 0) return
                          e.stopPropagation()
                          const point = getWorldPoint(e)
                          if (!point) return
                          let bestIndex = 0
                          let bestDist = Number.POSITIVE_INFINITY
                          g.points.forEach((p, idx) => {
                            const d = Math.hypot(point[0] - p[0], point[1] - p[1])
                            if (d < bestDist) {
                              bestDist = d
                              bestIndex = idx
                            }
                          })
                          if (bestDist > editSelectRadius) return
                          editDragRef.current = {
                            id: g.id,
                            type: 'poly',
                            index: bestIndex,
                            points: g.points ?? [],
                          }
                          setIsEditDragging(true)
                          setEditPointSelection({ id: g.id, index: bestIndex, kind: 'poly' })
                          logAction(
                            `mouseDown b=${e.button} ${formatMousePosition(e)}`,
                            `edit drag start vertex ${bestIndex}`,
                          )
                        }}
                        onContextMenu={(e) => {
                          if (activeTool !== 'edit' || !isSelected(g.id, 'geometry') || !g.points) return
                          e.preventDefault()
                          e.stopPropagation()
                          const point = getWorldPoint(e)
                          if (!point) return
                          if (e.shiftKey && g.points.length > 2) {
                            let bestIndex = 0
                            let bestDist = Number.POSITIVE_INFINITY
                            g.points.forEach((p, idx) => {
                              const d = Math.hypot(point[0] - p[0], point[1] - p[1])
                              if (d < bestDist) {
                                bestDist = d
                                bestIndex = idx
                              }
                            })
                            const next = g.points.filter((_, i) => i !== bestIndex)
                            const nextCenter: [number, number] = [
                              next.reduce((acc, pt) => acc + pt[0], 0) / next.length,
                              next.reduce((acc, pt) => acc + pt[1], 0) / next.length,
                            ]
                            updateGeometry(g.id, { points: next, center: nextCenter })
                            pushHistory()
                            return
                          }
                          let bestIndex = 0
                          let bestDist = Number.POSITIVE_INFINITY
                          const points = g.points
                          const segments = points.length >= 2 ? points.slice(0, -1).map((p, idx) => [p, points[idx + 1]]) : []
                          segments.forEach(([a, b], idx) => {
                            const [cx, cy] = closestPointOnSegment(a, b, point)
                            const d = Math.hypot(point[0] - cx, point[1] - cy)
                            if (d < bestDist) {
                              bestDist = d
                              bestIndex = idx
                            }
                          })
                          if (bestDist > snapDistanceWorld * 1.5) return
                          const [mx, my] = [
                            (points[bestIndex][0] + points[bestIndex + 1][0]) / 2,
                            (points[bestIndex][1] + points[bestIndex + 1][1]) / 2,
                          ]
                          const useMidpoint = Math.hypot(point[0] - mx, point[1] - my) <= snapDistanceWorld
                          const insertPoint = useMidpoint ? ([mx, my] as [number, number]) : point
                          const nextPoints = [...points]
                          nextPoints.splice(bestIndex + 1, 0, insertPoint)
                          updateGeometry(g.id, { points: nextPoints })
                          pushHistory()
                        }}
                      />
                    )
                  }

                  if (g.shape === 'arc' && g.arc) {
                    const start = g.arc.start
                    const end = g.arc.end
                    const r = g.arc.radius
                    const large = g.arc.largeArc ? 1 : 0
                    const path = `M ${toScene(start[0])} ${toScene(start[1])} A ${toScene(r)} ${toScene(r)} 0 ${large} 1 ${toScene(
                      end[0],
                    )} ${toScene(end[1])}`
                    const smooth = g.smoothing && g.smoothing !== 'none'
                    return (
                      <path
                        d={path}
                        fill="none"
                        stroke={materialColor[g.materialId] ?? '#94a3b8'}
                        strokeWidth={overlayStrokeWidth}
                        vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        strokeLinejoin={smooth ? 'round' : 'miter'}
                        strokeLinecap={smooth ? 'round' : 'butt'}
                      />
                    )
                  }

                  if (g.shape === 'block') {
                    const rot = (g.rotation ?? 0) * (180 / Math.PI)
                    return (
                      <rect
                        x={cx - sx / 2}
                        y={cy - sy / 2}
                        width={sx}
                        height={sy}
                        fill={materialColor[g.materialId] ?? '#94a3b8'}
                        fillOpacity={fillOpacity}
                        stroke={materialColor[g.materialId] ?? '#94a3b8'}
                        strokeWidth={overlayStrokeWidth}
                        opacity={strokeOpacity}
                        vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}
                      />
                    )
                  }

                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={sx / 2}
                      fill={materialColor[g.materialId] ?? '#94a3b8'}
                      fillOpacity={fillOpacity}
                      stroke={materialColor[g.materialId] ?? '#94a3b8'}
                      strokeWidth={overlayStrokeWidth}
                      opacity={strokeOpacity}
                      vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                    />
                  )
                })()}
                {isSelected(g.id, 'geometry') && g.points?.length && (
                  <polyline
                    points={g.points.map((p) => `${toScene(p[0])},${toScene(p[1])}`).join(' ')}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={selectionStrokeWidth}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeOpacity={0.85}
                    onClick={(e) => {
                      if (activeTool !== 'edit' || !g.points) return
                      e.stopPropagation()
                      const point = getWorldPoint(e)
                      if (!point) return
                      let bestIndex = 0
                      let bestDist = Number.POSITIVE_INFINITY
                      const points = g.points
                      const segments = points.length >= 2 ? points.slice(0, -1).map((p, idx) => [p, points[idx + 1]]) : []
                      segments.forEach(([a, b], idx) => {
                        const [cx, cy] = closestPointOnSegment(a, b, point)
                        const d = Math.hypot(point[0] - cx, point[1] - cy)
                        if (d < bestDist) {
                          bestDist = d
                          bestIndex = idx
                        }
                      })
                      if (bestDist > snapDistanceWorld * 1.5) return
                      const [mx, my] = [
                        (points[bestIndex][0] + points[bestIndex + 1][0]) / 2,
                        (points[bestIndex][1] + points[bestIndex + 1][1]) / 2,
                      ]
                      const useMidpoint = !e.ctrlKey && Math.hypot(point[0] - mx, point[1] - my) <= snapDistanceWorld
                      const insertPoint = useMidpoint ? ([mx, my] as [number, number]) : point
                      const nextPoints = [...points]
                      nextPoints.splice(bestIndex + 1, 0, insertPoint)
                      updateGeometry(g.id, { points: nextPoints })
                      pushHistory()
                    }}
                  />
                )}
                {isSelected(g.id, 'geometry') && g.shape === 'arc' && g.arc && (
                  <path
                    d={`M ${toScene(g.arc.start[0])} ${toScene(g.arc.start[1])} A ${toScene(
                      g.arc.radius,
                    )} ${toScene(g.arc.radius)} 0 ${g.arc.largeArc ? 1 : 0} 1 ${toScene(
                      g.arc.end[0],
                    )} ${toScene(g.arc.end[1])}`}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={selectionStrokeWidth}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeOpacity={0.85}
                  />
                )}
                {isSelected(g.id, 'geometry') && (g.shape === 'polyline' || g.shape === 'polygon') && g.points?.length && (
                  <g>
                    {(() => {
                      const pts = g.points ?? []
                      const segments = pts.length >= 2 ? pts.slice(0, -1).map((p, idx) => [p, pts[idx + 1]]) : []
                      if (g.shape === 'polygon' && pts.length >= 3) {
                        segments.push([pts[pts.length - 1], pts[0]])
                      }
                      return segments.map(([a, b], idx) => (
                        <circle
                          key={`g-mid-${g.id}-${idx}`}
                          cx={toScene((a[0] + b[0]) / 2)}
                          cy={toScene((a[1] + b[1]) / 2)}
                          r={selectionHandleRadius * 0.7}
                          fill="rgba(148,163,184,0.9)"
                          vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        />
                      ))
                    })()}
                  </g>
                )}
                {g.shape === 'arc' && g.arc && isSelected(g.id, 'geometry') && (
                  <g>
                    <line
                      x1={toScene(g.arc.start[0])}
                      y1={toScene(g.arc.start[1])}
                      x2={toScene(g.arc.end[0])}
                      y2={toScene(g.arc.end[1])}
                      stroke="rgba(148,163,184,0.7)"
                      strokeDasharray="6 4"
                      strokeWidth={overlayStrokeWidth}
                      vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                    />
                    {g.arc.control && (
                      <>
                        <circle
                          cx={toScene(g.arc.control[0])}
                          cy={toScene(g.arc.control[1])}
                          r={selectionHandleRadius}
                          fill="rgba(14,165,233,0.9)"
                          vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        />
                        {(() => {
                          const ax = g.arc.start[0]
                          const ay = g.arc.start[1]
                          const bx = g.arc.end[0]
                          const by = g.arc.end[1]
                          const cx = g.arc.control[0]
                          const cy = g.arc.control[1]
                          const dx = bx - ax
                          const dy = by - ay
                          const denom = dx * dx + dy * dy
                          const t = denom > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / denom : 0
                          const px = ax + dx * t
                          const py = ay + dy * t
                          return (
                            <>
                              <line
                                x1={toScene(cx)}
                                y1={toScene(cy)}
                                x2={toScene(px)}
                                y2={toScene(py)}
                                stroke="rgba(148,163,184,0.7)"
                                strokeDasharray="4 4"
                                strokeWidth={overlayStrokeWidth}
                                vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                              />
                              <circle
                                cx={toScene(px)}
                                cy={toScene(py)}
                                r={selectionHandleRadius * 0.75}
                                fill="rgba(148,163,184,0.9)"
                                vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                              />
                            </>
                          )
                        })()}
                        <circle
                          cx={toScene((g.arc.start[0] + g.arc.end[0]) / 2)}
                          cy={toScene((g.arc.start[1] + g.arc.end[1]) / 2)}
                          r={selectionHandleRadius * 0.85}
                          fill="rgba(148,163,184,0.8)"
                          vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                        />
                      </>
                    )}
                  </g>
                )}
                {showMarkers && (
                  <rect
                    x={
                      toScene(toFinite(g.center[0], 0)) -
                      (g.shape === 'block'
                        ? Math.abs(toScene(toFinite(g.size[0], 0)))
                        : Math.abs(toScene(toFinite(g.size[0], 0)))) /
                        2
                    }
                    y={
                      toScene(toFinite(g.center[1], 0)) -
                      (g.shape === 'block'
                        ? Math.abs(toScene(toFinite(g.size[1], 0)))
                        : Math.abs(toScene(toFinite(g.size[0], 0)))) /
                        2
                    }
                    width={Math.max(Math.abs(toScene(toFinite(g.size[0], 0))), safeCellSizeScene[0] * 0.02)}
                    height={
                      Math.max(
                        Math.abs(toScene(toFinite(g.shape === 'block' ? g.size[1] : g.size[0], 0))),
                        safeCellSizeScene[1] * 0.02,
                      )
                    }
                    fill="none"
                    stroke="rgba(217,70,239,0.9)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {showCenters && (
                  <circle
                    cx={toScene(toFinite(g.center[0], 0))}
                    cy={toScene(toFinite(g.center[1], 0))}
                    r={overlayHandleRadius * 0.8}
                    fill="rgba(255,255,255,0.9)"
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth={overlayStrokeWidth}
                    vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                  />
                )}
                {showMarkers && (
                  <g>
                    <circle
                      cx={toScene(toFinite(g.center[0], 0))}
                      cy={toScene(toFinite(g.center[1], 0))}
                      r={overlayHandleRadius * 1.6}
                      fill="none"
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth={overlayStrokeWidth}
                      vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                    />
                    <line
                      x1={toScene(toFinite(g.center[0], 0)) - overlayHandleRadius * 2}
                      y1={toScene(toFinite(g.center[1], 0))}
                      x2={toScene(toFinite(g.center[0], 0)) + overlayHandleRadius * 2}
                      y2={toScene(toFinite(g.center[1], 0))}
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth={overlayStrokeWidth}
                      vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                    />
                    <line
                      x1={toScene(toFinite(g.center[0], 0))}
                      y1={toScene(toFinite(g.center[1], 0)) - overlayHandleRadius * 2}
                      x2={toScene(toFinite(g.center[0], 0))}
                      y2={toScene(toFinite(g.center[1], 0)) + overlayHandleRadius * 2}
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth={overlayStrokeWidth}
                      vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                    />
                  </g>
                )}
              </g>
            ))}

            {drawStart && drawCurrent && activeTool === 'shape' && (
              <rect
                x={toScene(Math.min(drawStart[0], drawCurrent[0]))}
                y={toScene(Math.min(drawStart[1], drawCurrent[1]))}
                width={toScene(Math.abs(drawCurrent[0] - drawStart[0]))}
                height={toScene(Math.abs(drawCurrent[1] - drawStart[1]))}
                fill="rgba(248,113,113,0.12)"
                stroke="rgba(248,113,113,0.8)"
                strokeDasharray="4 4"
                strokeWidth={overlayStrokeWidth}
                vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
              />
            )}

            {activeTool === 'draw' && (drawMode === 'polyline' || drawMode === 'polygon') && sketchPoints.length > 0 && (
              <g>
                {sketchPoints.map((p, idx) => (
                  <circle
                    key={`sp-${idx}`}
                    cx={toScene(p[0])}
                    cy={toScene(p[1])}
                    r={overlayHandleRadius}
                    fill={idx === 0 ? 'rgba(37,99,235,0.9)' : 'rgba(37,99,235,0.6)'}
                    vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                  />
                ))}
              </g>
            )}

            {activeTool === 'draw' && drawMode === 'arc' && arcPoints.length > 0 && (
              <g>
                {arcPoints.map((p, idx) => (
                  <circle
                    key={`ap-${idx}`}
                    cx={toScene(p[0])}
                    cy={toScene(p[1])}
                    r={overlayHandleRadius}
                    fill={idx === 1 ? 'rgba(14,165,233,0.9)' : 'rgba(37,99,235,0.7)'}
                    vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                  />
                ))}
                {arcPoints.length >= 2 && (
                  <line
                    x1={toScene(arcPoints[0][0])}
                    y1={toScene(arcPoints[0][1])}
                    x2={toScene(arcPoints[arcPoints.length - 1][0])}
                    y2={toScene(arcPoints[arcPoints.length - 1][1])}
                    stroke="rgba(148,163,184,0.7)"
                    strokeDasharray="6 4"
                    strokeWidth={overlayStrokeWidth}
                    vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                  />
                )}
              </g>
            )}

            {sources.map((s) => (
              <g
                key={s.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(s.id, 'source', e.shiftKey)
                }}
                onMouseDown={(e) => {
                  skipSelectRef.current = true
                  handleMoveStart(e)
                }}
                className={isSelected(s.id, 'source') ? 'selected' : ''}
                opacity={
                  dimension === '3d' && Math.abs(s.z - sliceZ) > Math.max(safeCellSize[2] * 0.05, 1e-9)
                    ? 0.35
                    : 1
                }
              >
                {(() => {
                  const size = Math.max(overlayHandleRadius * 1.3, overlayStrokeWidth * 3)
                  return (
                    <>
                <polygon
                  points={`${toScene(toFinite(s.position[0], 0))},${
                    toScene(toFinite(s.position[1], 0)) - size
                  } ${toScene(toFinite(s.position[0], 0)) + size},${
                    toScene(toFinite(s.position[1], 0)) + size
                  } ${toScene(toFinite(s.position[0], 0)) - size},${
                    toScene(toFinite(s.position[1], 0)) + size
                  }`}
                  fill="rgba(245,158,11,0.95)"
                  stroke="rgba(245,158,11,1)"
                  strokeWidth={overlayStrokeWidth}
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
                <circle
                  cx={toScene(toFinite(s.position[0], 0))}
                  cy={toScene(toFinite(s.position[1], 0))}
                  r={size * 0.35}
                  fill="rgba(245,158,11,1)"
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={overlayStrokeWidth}
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
                    </>
                  )
                })()}
                {showMarkers && (
                  <circle
                    cx={toScene(toFinite(s.position[0], 0))}
                    cy={toScene(toFinite(s.position[1], 0))}
                    r={overlayHandleRadius * 1.2}
                    fill="none"
                    stroke="rgba(245,158,11,0.8)"
                    strokeWidth={overlayStrokeWidth}
                    vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                  />
                )}
                {/* orientation arrow */}
                {typeof s.orientation === 'number' && (
                  <MarkerOrientation cx={toScene(s.position[0])} cy={toScene(s.position[1])} ang={s.orientation ?? 0} len={size * 1.8} headSize={overlayHandleRadius} color="rgba(245,158,11,0.95)" strokeWidth={overlayStrokeWidth} vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'} />
                )}
              </g>
            ))}

            {monitors.map((m) => (
              <g
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(m.id, 'monitor', e.shiftKey)
                }}
                onMouseDown={(e) => {
                  skipSelectRef.current = true
                  handleMoveStart(e)
                }}
                className={isSelected(m.id, 'monitor') ? 'selected' : ''}
                opacity={
                  dimension === '3d' && Math.abs(m.z - sliceZ) > Math.max(safeCellSize[2] * 0.05, 1e-9)
                    ? 0.35
                    : 1
                }
              >
                {(() => {
                  const size = Math.max(overlayHandleRadius * 1.1, overlayStrokeWidth * 2.5)
                  // If this monitor is a planar detector, render a rotated rectangle sized by m.size (world units)
                  if (m.shape === 'plane') {
                    const w = (m.size?.[0] ?? (size * 2)) / 1 // world units
                    const h = (m.size?.[1] ?? (size * 2)) / 1
                    const hw = w / 2
                    const hh = h / 2
                    const ang = m.orientation ?? 0
                    const c = Math.cos(ang)
                    const s = Math.sin(ang)
                    const corners = [
                      [-hw, -hh],
                      [hw, -hh],
                      [hw, hh],
                      [-hw, hh],
                    ].map(([dx, dy]) => {
                      const xw = m.position[0] + dx * c - dy * s
                      const yw = m.position[1] + dx * s + dy * c
                      return `${toScene(toFinite(xw, 0))},${toScene(toFinite(yw, 0))}`
                    })
                    // Optionally show sampling grid if sampling mode is 'points' and showMarkers enabled
                    const samples: string[] = []
                    if ((m.sampling?.mode ?? 'points') === 'points' && showMarkers) {
                      const nx = Math.max(1, m.sampling?.nx ?? 5)
                      const ny = Math.max(1, m.sampling?.ny ?? 5)
                      for (let i = 0; i < nx; i++) {
                        for (let j = 0; j < ny; j++) {
                          const fx = nx === 1 ? 0 : i / (nx - 1)
                          const fy = ny === 1 ? 0 : j / (ny - 1)
                          const dx = -hw + fx * 2 * hw
                          const dy = -hh + fy * 2 * hh
                          const xw = m.position[0] + dx * c - dy * s
                          const yw = m.position[1] + dx * s + dy * c
                          samples.push(`${toScene(toFinite(xw, 0))},${toScene(toFinite(yw, 0))}`)
                        }
                      }
                    }

                    return (
                      <>
                        <polygon points={corners.join(' ')} fill="rgba(45,212,191,0.12)" stroke="rgba(45,212,191,1)" strokeWidth={overlayStrokeWidth} vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'} />
                        {samples.map((pt, idx) => {
                          const [x, y] = pt.split(',').map(Number)
                          return <circle key={idx} cx={x} cy={y} r={Math.max(1, overlayHandleRadius * 0.3)} fill="rgba(45,212,191,0.9)" />
                        })}
                      </>
                    )
                  }

                  // default: point-style monitor glyph
                  return (
                    <>
                <rect
                  x={toScene(toFinite(m.position[0], 0)) - size}
                  y={toScene(toFinite(m.position[1], 0)) - size}
                  width={size * 2}
                  height={size * 2}
                  fill="rgba(45,212,191,0.95)"
                  stroke="rgba(45,212,191,1)"
                  strokeWidth={overlayStrokeWidth}
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
                <line
                  x1={toScene(toFinite(m.position[0], 0)) - size * 1.8}
                  y1={toScene(toFinite(m.position[1], 0))}
                  x2={toScene(toFinite(m.position[0], 0)) + size * 1.8}
                  y2={toScene(toFinite(m.position[1], 0))}
                  stroke="rgba(45,212,191,0.9)"
                  strokeWidth={overlayStrokeWidth}
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
                <line
                  x1={toScene(toFinite(m.position[0], 0))}
                  y1={toScene(toFinite(m.position[1], 0)) - size * 1.8}
                  x2={toScene(toFinite(m.position[0], 0))}
                  y2={toScene(toFinite(m.position[1], 0)) + size * 1.8}
                  stroke="rgba(45,212,191,0.9)"
                  strokeWidth={overlayStrokeWidth}
                  vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                />
                    </>
                  )
                })()}
                {showMarkers && (
                  <circle
                    cx={toScene(toFinite(m.position[0], 0))}
                    cy={toScene(toFinite(m.position[1], 0))}
                    r={overlayHandleRadius * 1.1}
                    fill="none"
                    stroke="rgba(45,212,191,0.8)"
                    strokeWidth={overlayStrokeWidth}
                    vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'}
                  />
                )}
                {typeof m.orientation === 'number' && (
                  <MarkerOrientation cx={toScene(m.position[0])} cy={toScene(m.position[1])} ang={m.orientation ?? 0} len={size * 1.9} headSize={overlayHandleRadius} color="rgba(45,212,191,0.95)" strokeWidth={overlayStrokeWidth} vectorEffect={overlayAutoscale ? undefined : 'non-scaling-stroke'} />
                )}
              </g>
            ))}
            </g>


            </svg>

            <div className="orientation">
              <div className="axis">
                <span className="x">X</span>
                <span className="y">Y</span>
              </div>
            </div>

            <div className="ruler ruler-x">
              <div className="ruler-label">X</div>
              {cursorPct && <div className="ruler-marker" style={{ left: `${cursorPct.x * 100}%` }} />}
            </div>
            <div className="ruler ruler-y">
              <div className="ruler-label">Y</div>
              {cursorPct && <div className="ruler-marker" style={{ top: `${cursorPct.y * 100}%` }} />}
            </div>
          </div>
          {dimension === '3d' && show3DPreview && (
            <div className="three-preview" ref={threeMountRef} />
          )}
        </section>
        {showProperties && !canvasMaximized && (
          <section className="panel properties">
            <h2>Materials</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="muted">Manage materials and dispersion models</div>
              <div>
                <button onClick={() => setShowMaterialEditor(true)}>Manage materials</button>
              </div>
            </div>
            <div className="materials" style={{ marginTop: 12 }}>
              {materials.map((m) => (
                <div key={m.id} className="chip">
                  <div className="chip-swatch" style={{ background: m.color }} />
                  <div>
                    <div className="mono">{m.id}</div>
                    <div className="muted">{m.label}</div>
                  </div>
                  <input
                    className="color-input"
                    type="color"
                    value={m.color}
                    onChange={(e) =>
                      setMaterials((prev) =>
                        prev.map((item) => (item.id === m.id ? { ...item, color: e.target.value } : item)),
                      )
                    }
                  />
                </div>
              ))}
              {showMaterialEditor && (
                <MaterialEditor materials={materials} setMaterials={setMaterials} onClose={() => setShowMaterialEditor(false)} />
              )}

              {/* Discretize preview modal */}
              <DiscretizePreviewModal
                open={showDiscretizeModal}
                onClose={() => { setShowDiscretizeModal(false); setRenderMode('none') }}
                geometry={geometry}
                materials={materials}
                defaultSlices={8}
                defaultAxis={'x'}
                onComplete={handleDiscretizeComplete}
              />
            </div>

            <h2>Geometry</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowWaveformEditor(true)}>Edit waveforms</button>
            </div>
            {showWaveformEditor && (
              <WaveformEditor waveforms={waveforms} setWaveforms={setWaveforms} onClose={() => setShowWaveformEditor(false)} />
            )}

            <div style={{ marginTop: 12 }}>
              <MeshManager meshAssets={meshAssets} setMeshAssets={setMeshAssets} />
            </div>

            {selectedItems.length > 0 && (
              <>
                <div className="editor">
                  <h3>Selection Tools</h3>
                <div className="row compact">
                  <button onClick={() => rotateSelected(90)}>Rotate +90°</button>
                  <button onClick={() => rotateSelected(-90)}>Rotate -90°</button>
                  <button onClick={() => reflectSelected('x')}>Reflect X</button>
                  <button onClick={() => reflectSelected('y')}>Reflect Y</button>
                  <button onClick={duplicateSelection}>Duplicate</button>
                  <button onClick={deleteSelection}>Delete</button>
                </div>
                {selectedType === 'geometry' && selectedId && (() => {
                  const g = geometry.find((item) => item.id === selectedId)
                  if (!g) return null
                  if (g.shape !== 'polyline' && g.shape !== 'polygon' && g.shape !== 'arc') return null
                  return (
                    <>
                      <h4>Boundary actions</h4>
                      {g.shape === 'polygon' ? (
                        <label>
                          Fill behavior
                          <select
                            value={g.boundaryAction ?? 'fill'}
                            onChange={(e) =>
                              updateGeometry(g.id, { boundaryAction: e.target.value as GeometryItem['boundaryAction'] })
                            }
                          >
                            <option value="fill">Fill region</option>
                            <option value="outline">Outline only</option>
                          </select>
                        </label>
                      ) : (
                        <div className="muted">Fill is only available for polygons. Convert to polygon to fill.</div>
                      )}
                      <label>
                        Border smoothing
                        <select
                          value={g.smoothing ?? 'none'}
                          onChange={(e) =>
                            updateGeometry(g.id, { smoothing: e.target.value as GeometryItem['smoothing'] })
                          }
                        >
                          <option value="none">None</option>
                          <option value="spline">Spline (round joints)</option>
                          <option value="bspline">B-spline (round joints)</option>
                        </select>
                      </label>
                    </>
                  )
                })()}
              </div>
                </>
            )}
            {geometry.length === 0 && <div className="muted">No geometry.</div>}
            {geometry.map((g) => (
              <div key={g.id} className={`list-item ${isSelected(g.id, 'geometry') ? 'active' : ''}`}>
                <div>
                  <strong>{g.shape}</strong> <span className="mono">{g.id}</span>
                </div>
                <div className="row compact">
                  <button onClick={() => setSelected(g.id, 'geometry')}>Edit</button>
                  <button onClick={() => setGeometry((prev) => prev.filter((item) => item.id !== g.id))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <h2>Sources</h2>
            {sources.length === 0 && <div className="muted">No sources.</div>}
            {sources.map((s) => (
              <div key={s.id} className={`list-item ${isSelected(s.id, 'source') ? 'active' : ''}`}>
                <div>
                  <strong>{s.component}</strong> <span className="mono">{s.id}</span>
                </div>
                <div className="row compact">
                  <button onClick={() => setSelected(s.id, 'source')}>Edit</button>
                  <button onClick={() => setSources((prev) => prev.filter((item) => item.id !== s.id))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <h2>Detectors</h2>
            {monitors.length === 0 && <div className="muted">No detectors.</div>}
            {monitors.map((m) => (
              <div key={m.id} className={`list-item ${isSelected(m.id, 'monitor') ? 'active' : ''}`}>
                <div>
                  <strong>{m.components.join(',')}</strong> <span className="mono">{m.id}</span>
                </div>
                <div className="row compact">
                  <button onClick={() => setSelected(m.id, 'monitor')}>Edit</button>
                  <button onClick={() => setMonitors((prev) => prev.filter((item) => item.id !== m.id))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <h2>Waveforms</h2>
            {waveforms.length === 0 && <div className="muted">No waveforms.</div>}
            {waveforms.map((w) => (
              <div key={w.id} className="list-item">
                <div>
                  <strong>{w.kind}</strong> <span className="mono">{w.label}</span>
                </div>
                <div className="row compact">
                  <button onClick={() => setWaveforms((prev) => prev.filter((item) => item.id !== w.id))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <h2>Meshes</h2>
            {meshAssets.length === 0 && <div className="muted">No mesh assets.</div>}
            {meshAssets.map((m) => (
              <div key={m.id} className="list-item">
                <div>
                  <strong>{m.format}</strong> <span className="mono">{m.name}</span>
                </div>
                <div className="row compact">
                  <button onClick={() => setMeshAssets((prev) => prev.filter((item) => item.id !== m.id))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {selectedId && selectedType === 'geometry' && (
              <div className="editor">
                <h3>Geometry Properties</h3>
                {geometry
                  .filter((g) => g.id === selectedId)
                  .map((g) => (
                    <div key={g.id} className="fields">
                      <label>
                        Shape
                        <select
                          value={g.shape}
                          onChange={(e) => updateGeometry(g.id, { shape: e.target.value as GeometryShape })}
                        >
                          <option value="block">Block</option>
                          <option value="cylinder">Cylinder</option>
                          <option value="polyline">Polyline</option>
                          <option value="polygon">Polygon</option>
                          <option value="arc">Arc</option>
                        </select>
                      </label>
                      <label>
                        Material
                        <select
                          value={g.materialId}
                          onChange={(e) => updateGeometry(g.id, { materialId: e.target.value })}
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Center (x, y) ({displayUnits === 'um' ? 'µm' : displayUnits})
                        <div className="row">
                          <input
                            type="number"
                            value={toDisplayLength(g.center[0], displayUnits)}
                            step={1e-8 * displayScale}
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateGeometry(g.id, {
                                center: [
                                  Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : g.center[0],
                                  g.center[1],
                                ],
                              })
                            }}
                          />
                          <input
                            type="number"
                            value={toDisplayLength(g.center[1], displayUnits)}
                            step={1e-8 * displayScale}
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateGeometry(g.id, {
                                center: [
                                  g.center[0],
                                  Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : g.center[1],
                                ],
                              })
                            }}
                          />
                        </div>
                      </label>
                      {dimension === '3d' && (
                        <label>
                          Center (z) ({displayUnits === 'um' ? 'µm' : displayUnits})
                          <input
                            type="number"
                            value={toDisplayLength(g.centerZ, displayUnits)}
                            step={1e-8 * displayScale}
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateGeometry(g.id, {
                                centerZ: Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : g.centerZ,
                              })
                            }}
                          />
                        </label>
                      )}
                      <label>
                        Size (x, y) ({displayUnits === 'um' ? 'µm' : displayUnits})
                        <div className="row">
                          <input
                            type="number"
                            value={toDisplayLength(g.size[0], displayUnits)}
                            step={1e-8 * displayScale}
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateGeometry(g.id, {
                                size: [Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : g.size[0], g.size[1]],
                              })
                            }}
                          />
                          <input
                            type="number"
                            value={toDisplayLength(g.size[1], displayUnits)}
                            step={1e-8 * displayScale}
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateGeometry(g.id, {
                                size: [g.size[0], Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : g.size[1]],
                              })
                            }}
                          />
                        </div>
                      </label>
                      {dimension === '3d' && (
                        <label>
                          Size (z) ({displayUnits === 'um' ? 'µm' : displayUnits})
                          <input
                            type="number"
                            value={toDisplayLength(g.sizeZ, displayUnits)}
                            step={1e-8 * displayScale}
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateGeometry(g.id, {
                                sizeZ: Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : g.sizeZ,
                              })
                            }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {selectedId && selectedType === 'source' && (
              <div className="editor">
                <h3>Source Properties</h3>
                {sources
                  .filter((s) => s.id === selectedId)
                  .map((s) => (
                    <div key={s.id} className="fields">
                      <label>
                        Source type
                        <input
                          value={s.type ?? 'gaussian_pulse'}
                          onChange={(e) => updateSource(s.id, { type: e.target.value })}
                        />
                      </label>
                      <label>
                        Component
                        <select
                          value={s.component}
                          onChange={(e) =>
                            updateSource(s.id, { component: e.target.value as SourceItem['component'] })
                          }
                        >
                          <option value="Ex">Ex</option>
                          <option value="Ey">Ey</option>
                          <option value="Ez">Ez</option>
                        </select>
                      </label>
                      <label>
                        Position (x, y)
                        <div className="row">
                          <input
                            type="number"
                            value={s.position[0]}
                            step="1e-8"
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateSource(s.id, {
                                position: [Number.isFinite(v) ? v : s.position[0], s.position[1]],
                              })
                            }}
                          />
                          <input
                            type="number"
                            value={s.position[1]}
                            step="1e-8"
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateSource(s.id, {
                                position: [s.position[0], Number.isFinite(v) ? v : s.position[1]],
                              })
                            }}
                          />
                        </div>
                      </label>
                      <label>
                        Orientation (deg)
                        <input
                          type="number"
                          value={((s.orientation ?? 0) * 180) / Math.PI}
                          step="1"
                          onChange={(e) => {
                            const deg = e.currentTarget.valueAsNumber
                            const rad = Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0
                            updateSource(s.id, { orientation: rad })
                          }}
                        />
                      </label> 
                      {dimension === '3d' && (
                        <label>
                          Position (z)
                          <input
                            type="number"
                            value={s.z}
                            step="1e-8"
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateSource(s.id, { z: Number.isFinite(v) ? v : s.z })
                            }}
                          />
                        </label>
                      )}
                      <label>
                        Center frequency (Hz)
                        <input
                          type="number"
                          value={s.centerFreq}
                          step="1e12"
                          onChange={(e) => {
                            const v = e.currentTarget.valueAsNumber
                            updateSource(s.id, { centerFreq: Number.isFinite(v) ? v : s.centerFreq })
                          }}
                        />
                      </label>
                      <label>
                        Fwidth (Hz)
                        <input
                          type="number"
                          value={s.fwidth}
                          step="1e12"
                          onChange={(e) => {
                            const v = e.currentTarget.valueAsNumber
                            updateSource(s.id, { fwidth: Number.isFinite(v) ? v : s.fwidth })
                          }}
                        />
                      </label>
                      <label>
                        Waveform
                        <select
                          value={s.waveformId ?? ''}
                          onChange={(e) => updateSource(s.id, { waveformId: e.target.value || undefined })}
                        >
                          <option value="">(default)</option>
                          {waveforms.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
              </div>
            )}

            {selectedId && selectedType === 'monitor' && (
              <div className="editor">
                <h3>Detector Properties</h3>
                {monitors
                  .filter((m) => m.id === selectedId)
                  .map((m) => (
                    <div key={m.id} className="fields">
                      <label>
                        Components
                        <div className="row">
                          {(['Ex', 'Ey', 'Ez'] as const).map((c) => (
                            <label key={c} className="check">
                              <input
                                type="checkbox"
                                checked={m.components.includes(c)}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...m.components, c]
                                    : m.components.filter((v) => v !== c)
                                  updateMonitor(m.id, { components: next })
                                }}
                              />
                              {c}
                            </label>
                          ))}
                        </div>
                      </label>
                      <label>
                        Position (x, y)
                        <div className="row">
                          <input
                            type="number"
                            value={m.position[0]}
                            step="1e-8"
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateMonitor(m.id, {
                                position: [Number.isFinite(v) ? v : m.position[0], m.position[1]],
                              })
                            }}
                          />
                          <input
                            type="number"
                            value={m.position[1]}
                            step="1e-8"
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateMonitor(m.id, {
                                position: [m.position[0], Number.isFinite(v) ? v : m.position[1]],
                              })
                            }}
                          />
                        </div>
                      </label>
                      {dimension === '3d' && (
                        <label>
                          Position (z)
                          <input
                            type="number"
                            value={m.z}
                            step="1e-8"
                            onChange={(e) => {
                              const v = e.currentTarget.valueAsNumber
                              updateMonitor(m.id, { z: Number.isFinite(v) ? v : m.z })
                            }}
                          />
                        </label>
                      )}
                      <label>
                        dt
                        <input
                          type="number"
                          value={m.dt}
                          step="1e-16"
                          onChange={(e) => {
                            const v = e.currentTarget.valueAsNumber
                            updateMonitor(m.id, { dt: Number.isFinite(v) ? v : m.dt })
                          }}
                        />
                      </label>
                      <label>
                        Orientation (deg)
                        <input
                          type="number"
                          value={((m.orientation ?? 0) * 180) / Math.PI}
                          step="1"
                          onChange={(e) => {
                            const deg = e.currentTarget.valueAsNumber
                            const rad = Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0
                            updateMonitor(m.id, { orientation: rad })
                          }}
                        />
                      </label>

                      <label>
                        Type
                        <select value={m.shape ?? 'point'} onChange={(e) => updateMonitor(m.id, { shape: e.target.value as MonitorItem['shape'] })}>
                          <option value="point">Point</option>
                          <option value="plane">Planar slice</option>
                        </select>
                      </label>

                      {m.shape === 'plane' && (
                        <>
                          <label>
                            Size (width, height) ({displayUnits === 'um' ? 'µm' : displayUnits})
                            <div className="row">
                              <input
                                type="number"
                                value={toDisplayLength(m.size?.[0] ?? 4e-7, displayUnits)}
                                step={1e-8 * displayScale}
                                onChange={(e) => {
                                  const v = e.currentTarget.valueAsNumber
                                  const next = [(Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : (m.size?.[0] ?? 4e-7)), (m.size?.[1] ?? 4e-7)] as [number, number]
                                  updateMonitor(m.id, { size: next })
                                }}
                              />
                              <input
                                type="number"
                                value={toDisplayLength(m.size?.[1] ?? 4e-7, displayUnits)}
                                step={1e-8 * displayScale}
                                onChange={(e) => {
                                  const v = e.currentTarget.valueAsNumber
                                  const next = [(m.size?.[0] ?? 4e-7), (Number.isFinite(v) ? fromDisplayLength(v, displayUnits) : (m.size?.[1] ?? 4e-7))] as [number, number]
                                  updateMonitor(m.id, { size: next })
                                }}
                              />
                            </div>
                          </label>

                          <label>
                            Sampling mode
                            <select value={m.sampling?.mode ?? 'points'} onChange={(e) => updateMonitor(m.id, { sampling: { ...(m.sampling || {}), mode: e.target.value as any } })}>
                              <option value="plane">Direct plane (backend must support)</option>
                              <option value="points">Grid of point monitors (fallback / approximate)</option>
                            </select>
                          </label>

                          {m.sampling?.mode === 'points' && (
                            <label>
                              Grid resolution (nx × ny)
                              <div className="row">
                                <input type="number" value={m.sampling?.nx ?? 5} step={1} min={1} onChange={(e) => updateMonitor(m.id, { sampling: { ...(m.sampling || {}), nx: Math.max(1, Number(e.currentTarget.valueAsNumber || 1)) } })} />
                                <input type="number" value={m.sampling?.ny ?? 5} step={1} min={1} onChange={(e) => updateMonitor(m.id, { sampling: { ...(m.sampling || {}), ny: Math.max(1, Number(e.currentTarget.valueAsNumber || 1)) } })} />
                              </div>
                            </label>
                          )}

                          <div className="muted">Note: Not all backends support direct planar sampling. If unsupported, the UI can fall back to a grid of point monitors (preview shown).</div>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {showRunPanel && !canvasMaximized && (
          <RunPanel
            run={run}
            backend={backend}
            setBackend={setBackend}
            backendOptions={currentBackendOptions}
            setBackendOptions={(opts) => setBackendOptionsFor(backend, opts)}
            backendCapabilities={currentBackendCapabilities}
            setTranslationForBackend={(txt) => setTranslationForBackend(backend, txt)}
            translationPreview={translationPreviews[backend] || ''}
            busy={busy}
            error={error}
            project={project}
            onCreateRun={onCreateRun}
            onSubmitRun={onSubmitRun}
            executionMode={executionMode}
            setExecutionMode={setExecutionMode}
            sshTarget={sshTarget}
            setSshTarget={setSshTarget}
            sshOptions={sshOptions}
            setSshOptions={setSshOptions}
            remotePythonExecutable={remotePythonExecutable}
            setRemotePythonExecutable={setRemotePythonExecutable}
            onCancelRun={onCancelRun}
            meepPythonExecutable={meepPythonExecutable}
            setMeepPythonExecutable={setMeepPythonExecutable}
            previewComponent={previewComponent}
            setPreviewComponent={setPreviewComponent}
            previewPalette={previewPalette}
            setPreviewPalette={setPreviewPalette}
            snapshotEnabled={snapshotEnabled}
            setSnapshotEnabled={setSnapshotEnabled}
            livePreview={livePreview}
            setLivePreview={setLivePreview}
            snapshotStride={snapshotStride}
            pml={pml}
            setPml={setPml}
            hideCad={hideCad}
            setHideCad={setHideCad}
            boundaryType={boundaryType}
            setBoundaryType={setBoundaryType}
            boundaryPerFace={boundaryPerFace}
            setBoundaryPerFace={setBoundaryPerFace}
            boundaryFaces={boundaryFaces}
            setBoundaryFaces={setBoundaryFaces}
            specWarnings={specWarnings}
            showProperties={showProperties}
            setShowProperties={setShowProperties}
            setSnapshotStride={setSnapshotStride}
            movieDt={movieDt}
            setMovieDt={setMovieDt}
            movieStart={movieStart}
            setMovieStart={setMovieStart}
            movieStop={movieStop}
            setMovieStop={setMovieStop}
            movieStride={movieStride}
            setMovieStride={setMovieStride}
            movieMaxFrames={movieMaxFrames}
            setMovieMaxFrames={setMovieMaxFrames}
            specText={specText}
            specRef={specRef}
            logs={logs}
            onRefreshLogs={onRefreshLogs}
            artifacts={artifacts}
            onRefreshArtifacts={onRefreshArtifacts}
            downloadArtifactUrl={downloadArtifactUrl}
          />
        )}
      </main>

      {actionLogOpen && (
        <div
          className="action-log"
          style={{
            left: actionLogPos.x,
            top: actionLogPos.y,
            width: actionLogPos.width,
            height: actionLogPos.height,
          }}
        >
          <div
            className="action-log-header"
            onMouseDown={(e) => {
              actionLogDragRef.current.dragging = true
              actionLogDragRef.current.offsetX = e.clientX - actionLogPos.x
              actionLogDragRef.current.offsetY = e.clientY - actionLogPos.y
            }}
          >
            <div className="action-log-title">Action Log</div>
            <div className="row compact">
              <button
                onClick={() => setActionLogEnabled((prev) => !prev)}
                className={actionLogEnabled ? 'primary' : ''}
              >
                {actionLogEnabled ? 'Logging on' : 'Logging off'}
              </button>
              <button onClick={copyActionLog}>Copy</button>
              <button onClick={() => setActionLogEntries([])}>Clear</button>
              <button onClick={() => setActionLogOpen(false)}>Close</button>
            </div>
          </div>
          <div className="action-log-body">
            <div className="action-log-list" ref={actionLogListRef}>
              {actionLogEntries.length === 0 ? (
                <div className="muted">No actions logged yet.</div>
              ) : (
                actionLogEntries.map((entry) => (
                  <div key={entry.id} className="action-log-row">
                    <span className="action-log-time mono">{formatActionTimestamp(entry.ts)}</span>
                    <span className="action-log-input mono">{entry.input}</span>
                    <span className="action-log-interpreted">{entry.interpreted ?? '—'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="help-overlay" onClick={() => setHelpOpen(false)}>
          <div className="help-panel" onClick={(e) => e.stopPropagation()}>
            <div className="help-header">
              <div>
                <div className="help-title">Help & Settings</div>
                <div className="muted">SunStone {APP_VERSION}</div>
              </div>
              <button onClick={() => setHelpOpen(false)}>Close</button>
            </div>
            <div className="help-tabs">
              <button className={helpTab === 'about' ? 'primary' : ''} onClick={() => setHelpTab('about')}>
                About
              </button>
              <button className={helpTab === 'docs' ? 'primary' : ''} onClick={() => setHelpTab('docs')}>
                Docs
              </button>
              <button className={helpTab === 'keymap' ? 'primary' : ''} onClick={() => setHelpTab('keymap')}>
                Key map
              </button>
            </div>

            {helpTab === 'about' && (
              <div className="help-body">
                <div className="kv">
                  <div className="k">Version</div>
                  <div className="v mono">{APP_VERSION}</div>
                  <div className="k">API</div>
                  <div className="v mono">{apiBaseUrl}</div>
                </div>
                <div className="field">
                  <label>Software spec (JSON preview)</label>
                  <pre className="help-pre">{specText}</pre>
                </div>
              </div>
            )}

            {helpTab === 'docs' && (
              <div className="help-body">
                <div className="field">
                  <a href={`${apiBaseUrl}/docs`} target="_blank" rel="noreferrer">
                    API docs
                  </a>
                </div>
                <div className="field">
                  <button onClick={() => loadReadme('/docs/foss-optics-fdtd-spec.md')}>
                    Load SunStone software spec
                  </button>
                </div>
                <div className="field">
                  <button onClick={() => loadReadme('/docs/project_bundle.md')}>Load project bundle format</button>
                </div>
                <div className="field">
                  <button onClick={() => loadReadme('/README.md')}>Load workspace README</button>
                </div>
                <div className="field">
                  <button onClick={() => loadReadme('/frontend/README.md')}>Load frontend README</button>
                </div>
                {readmeError && <div className="muted">{readmeError}</div>}
                {readmeContent && <pre className="help-pre">{readmeContent}</pre>}
              </div>
            )}

            {helpTab === 'keymap' && (
              <div className="help-body">
                <div className="keymap-block">
                  <div className="keymap-title">Navigation</div>
                  <div className="row">
                    <label>
                      Pan gesture
                      <select
                        value={keymap.panMode}
                        onChange={(e) =>
                          setKeymap((prev) => ({
                            ...prev,
                            panMode: e.target.value as PanMode,
                          }))
                        }
                      >
                        <option value="middle">Middle mouse drag</option>
                        <option value="space">Space + drag</option>
                        <option value="shift">Shift + drag</option>
                      </select>
                    </label>
                    <label>
                      Zoom direction
                      <select
                        value={keymap.zoomDirection}
                        onChange={(e) =>
                          setKeymap((prev) => ({
                            ...prev,
                            zoomDirection: e.target.value as ZoomDirection,
                          }))
                        }
                      >
                        <option value="normal">Wheel up = zoom in</option>
                        <option value="inverted">Wheel up = zoom out</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="keymap-block">
                  <div className="keymap-title">Global actions</div>
                  <table className="keymap-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Binding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { key: 'undo', label: 'Undo' },
                        { key: 'redo', label: 'Redo' },
                        { key: 'copy', label: 'Copy' },
                        { key: 'paste', label: 'Paste' },
                        { key: 'duplicate', label: 'Duplicate' },
                        { key: 'delete', label: 'Delete' },
                        { key: 'cancel', label: 'Cancel/Escape' },
                        { key: 'nudge', label: 'Nudge' },
                        { key: 'nudgeFast', label: 'Nudge (fast)' },
                      ] as Array<{ key: keyof KeymapConfig; label: string }>).map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>
                            <input
                              value={keymap[row.key]}
                              onKeyDown={(e) => {
                                e.preventDefault()
                                updateKeymapField(row.key, comboFromEvent(e.nativeEvent))
                              }}
                              onChange={(e) => updateKeymapField(row.key, e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="keymap-add">
                        <td>
                          <select
                            value={keymapAddGlobalAction}
                            onChange={(e) => setKeymapAddGlobalAction(e.target.value as keyof KeymapConfig)}
                          >
                            <option value="undo">Undo</option>
                            <option value="redo">Redo</option>
                            <option value="copy">Copy</option>
                            <option value="paste">Paste</option>
                            <option value="duplicate">Duplicate</option>
                            <option value="delete">Delete</option>
                            <option value="cancel">Cancel/Escape</option>
                            <option value="nudge">Nudge</option>
                            <option value="nudgeFast">Nudge (fast)</option>
                          </select>
                        </td>
                        <td>
                          <div className="row compact">
                            <input
                              value={keymapAddGlobalValue}
                              placeholder="Type combo"
                              onKeyDown={(e) => {
                                e.preventDefault()
                                setKeymapAddGlobalValue(comboFromEvent(e.nativeEvent))
                              }}
                              onChange={(e) => setKeymapAddGlobalValue(e.target.value)}
                            />
                            <button
                              onClick={() => {
                                if (!keymapAddGlobalValue) return
                                updateKeymapField(keymapAddGlobalAction, keymapAddGlobalValue)
                                setKeymapAddGlobalValue('')
                              }}
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="keymap-block">
                  <div className="keymap-title">View & preview</div>
                  <table className="keymap-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Binding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { key: 'cycleTool', label: 'Cycle tools (Shift to reverse)' },
                        { key: 'rasterHold', label: 'Hold raster preview' },
                        { key: 'rasterToggle', label: 'Toggle raster preview' },
                        { key: 'viewReset', label: 'Reset view' },
                        { key: 'viewFrame', label: 'Frame objects' },
                      ] as Array<{ key: keyof KeymapConfig; label: string }>).map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>
                            <input
                              value={keymap[row.key]}
                              onKeyDown={(e) => {
                                e.preventDefault()
                                updateKeymapField(row.key, comboFromEvent(e.nativeEvent))
                              }}
                              onChange={(e) => updateKeymapField(row.key, e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="keymap-block">
                  <div className="keymap-title">Tools</div>
                  <table className="keymap-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Binding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { key: 'toolSelect', label: 'Select tool' },
                        { key: 'toolInsert', label: 'Insert tool' },
                        { key: 'toolDraw', label: 'Draw tool' },
                        { key: 'toolMeasure', label: 'Measure tool' },
                        { key: 'toolExtrude', label: 'Extrude tool' },
                        { key: 'toolSource', label: 'Insert source' },
                        { key: 'toolDetector', label: 'Insert detector' },
                      ] as Array<{ key: keyof KeymapConfig; label: string }>).map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>
                            <input
                              value={keymap[row.key]}
                              onKeyDown={(e) => {
                                e.preventDefault()
                                updateKeymapField(row.key, comboFromEvent(e.nativeEvent))
                              }}
                              onChange={(e) => updateKeymapField(row.key, e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="keymap-add">
                        <td>
                          <select
                            value={keymapAddToolAction}
                            onChange={(e) => setKeymapAddToolAction(e.target.value as keyof KeymapConfig)}
                          >
                            <option value="toolSelect">Select tool</option>
                            <option value="toolInsert">Insert tool</option>
                            <option value="toolDraw">Draw tool</option>
                            <option value="toolMeasure">Measure tool</option>
                            <option value="toolExtrude">Extrude tool</option>
                            <option value="toolSource">Insert source</option>
                            <option value="toolDetector">Insert detector</option>
                          </select>
                        </td>
                        <td>
                          <div className="row compact">
                            <input
                              value={keymapAddToolValue}
                              placeholder="Type combo"
                              onKeyDown={(e) => {
                                e.preventDefault()
                                setKeymapAddToolValue(comboFromEvent(e.nativeEvent))
                              }}
                              onChange={(e) => setKeymapAddToolValue(e.target.value)}
                            />
                            <button
                              onClick={() => {
                                if (!keymapAddToolValue) return
                                updateKeymapField(keymapAddToolAction, keymapAddToolValue)
                                setKeymapAddToolValue('')
                              }}
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="keymap-block">
                  <div className="keymap-title">Draw mode</div>
                  <table className="keymap-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Binding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { key: 'drawPolyline', label: 'Polyline' },
                        { key: 'drawPolygon', label: 'Polygon' },
                        { key: 'drawArc', label: 'Arc' },
                      ] as Array<{ key: keyof KeymapConfig; label: string }>).map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>
                            <input
                              value={keymap[row.key]}
                              onKeyDown={(e) => {
                                e.preventDefault()
                                updateKeymapField(row.key, comboFromEvent(e.nativeEvent))
                              }}
                              onChange={(e) => updateKeymapField(row.key, e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="keymap-add">
                        <td>
                          <select
                            value={keymapAddDrawAction}
                            onChange={(e) => setKeymapAddDrawAction(e.target.value as keyof KeymapConfig)}
                          >
                            <option value="drawPolyline">Polyline</option>
                            <option value="drawPolygon">Polygon</option>
                            <option value="drawArc">Arc</option>
                          </select>
                        </td>
                        <td>
                          <div className="row compact">
                            <input
                              value={keymapAddDrawValue}
                              placeholder="Type combo"
                              onKeyDown={(e) => {
                                e.preventDefault()
                                setKeymapAddDrawValue(comboFromEvent(e.nativeEvent))
                              }}
                              onChange={(e) => setKeymapAddDrawValue(e.target.value)}
                            />
                            <button
                              onClick={() => {
                                if (!keymapAddDrawValue) return
                                updateKeymapField(keymapAddDrawAction, keymapAddDrawValue)
                                setKeymapAddDrawValue('')
                              }}
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="keymap-block">
                  <div className="keymap-title">Non-configurable shortcuts</div>
                  <table className="keymap-table">
                    <thead>
                      <tr>
                        <th>Input</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Ctrl (hold)</td>
                        <td>Disable snapping while drawing or inserting points</td>
                      </tr>
                      <tr>
                        <td>Right-drag</td>
                        <td>Pan canvas (always)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="keymap-block">
                  <div className="keymap-title">Mode behaviors</div>
                  <div className="keymap-grid">
                    <div className="keymap-mode">
                      <div className="keymap-mode-title">Select mode</div>
                      <table className="keymap-table">
                        <tbody>
                          <tr>
                            <td>Click</td>
                            <td>Select item (clears previous selection)</td>
                          </tr>
                          <tr>
                            <td>Shift+Click</td>
                            <td>Add/remove from selection</td>
                          </tr>
                          <tr>
                            <td>Drag</td>
                            <td>Move selection or box-select on empty canvas</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="keymap-mode">
                      <div className="keymap-mode-title">Insert mode</div>
                      <table className="keymap-table">
                        <tbody>
                          <tr>
                            <td>Click</td>
                            <td>Place shape/source/detector</td>
                          </tr>
                          <tr>
                            <td>Drag</td>
                            <td>Size insert shapes (rectangle/square/ellipse/circle)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="keymap-mode">
                      <div className="keymap-mode-title">Draw mode</div>
                      <table className="keymap-table">
                        <tbody>
                          <tr>
                            <td>Click</td>
                            <td>Add vertex (polyline/polygon) or control point (arc)</td>
                          </tr>
                          <tr>
                            <td>Double-click</td>
                            <td>Finish polyline/polygon or commit arc</td>
                          </tr>
                          <tr>
                            <td>Right-click</td>
                            <td>Commit if enough points; otherwise cancel sketch</td>
                          </tr>
                          <tr>
                            <td>Right-click ×2</td>
                            <td>Undo last draw point</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="keymap-mode">
                      <div className="keymap-mode-title">Measure mode</div>
                      <table className="keymap-table">
                        <tbody>
                          <tr>
                            <td>Click</td>
                            <td>Measure between two points</td>
                          </tr>
                          <tr>
                            <td>Shift+Click</td>
                            <td>Chain multi-segment measurements</td>
                          </tr>
                          <tr>
                            <td>Right-click</td>
                            <td>Clear measurement</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="keymap-mode">
                      <div className="keymap-mode-title">Edit mode</div>
                      <table className="keymap-table">
                        <tbody>
                          <tr>
                            <td>Drag handle</td>
                            <td>Move vertex/control point</td>
                          </tr>
                          <tr>
                            <td>Right-click segment</td>
                            <td>Insert vertex (midpoint if nearby)</td>
                          </tr>
                          <tr>
                            <td>Shift+Right-click vertex</td>
                            <td>Delete vertex (polyline/polygon)</td>
                          </tr>
                          <tr>
                            <td>Click selected edge</td>
                            <td>Insert vertex (Ctrl to avoid midpoint)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="keymap-mode">
                      <div className="keymap-mode-title">Extrude mode</div>
                      <table className="keymap-table">
                        <tbody>
                          <tr>
                            <td>Drag selection</td>
                            <td>Extrude (3D height or 2D duplicate + loft)</td>
                          </tr>
                          <tr>
                            <td>Release</td>
                            <td>Commit extrusion</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="row">
                  <button onClick={() => setKeymap(DEFAULT_KEYMAP)}>Reset key map</button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>


  )
}

export default App
