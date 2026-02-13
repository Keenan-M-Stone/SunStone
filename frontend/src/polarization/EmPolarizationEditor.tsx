import {
  PolarizationEditor,
  type PolarizationEditorProps,
  type SourcePolarization,
} from '../stardust'

export type EmPolarizationEditorProps = Omit<PolarizationEditorProps, 'axisLabels' | 'modeLabels'> & {
  value: unknown
  onChange: (next: SourcePolarization) => void
}

// EM flavor wrapper for the shared two-component polarization editor.
// Intentionally thin: SunStone can layer additional EM-specific presets or UI around this.
export default function EmPolarizationEditor(props: EmPolarizationEditorProps) {
  return (
    <PolarizationEditor
      {...props}
      axisLabels={{ a: 'u', b: 'v' }}
      modeLabels={{ components: 'Jones (complex)' }}
    />
  )
}
