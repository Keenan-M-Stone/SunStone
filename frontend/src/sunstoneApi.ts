import type { ArtifactEntry, ProjectRecord, RunRecord } from './types'
import { apiBaseUrl } from './config'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        'content-type': 'application/json',
      },
    })
  } catch (err: any) {
    // Network-level failure (DNS, connection refused, CORS preflight failure, etc.)
    throw new Error(`Network error contacting ${apiBaseUrl}${path}: ${err?.message ?? String(err)}. Is the backend running and reachable?`)
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${txt ? `: ${txt}` : ''}`)
  }

  try {
    return (await res.json()) as T
  } catch (err: any) {
    // If JSON parsing failed, return raw text with context
    const txt = await res.text().catch(() => '')
    throw new Error(`Failed to parse JSON response from ${apiBaseUrl}${path}: ${err?.message ?? String(err)}${txt ? `; response: ${txt}` : ''}`)
  }
}

export async function createProject(name: string): Promise<ProjectRecord> {
  return await http<ProjectRecord>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function createRun(projectId: string, spec: unknown): Promise<RunRecord> {
  return await http<RunRecord>(`/projects/${encodeURIComponent(projectId)}/runs`, {
    method: 'POST',
    body: JSON.stringify({ spec }),
  })
}

export async function submitRun(runId: string, backend: string, pythonExecutable?: string, backendOptions?: Record<string, any>, mode: 'local'|'ssh'|'slurm' = 'local', sshTarget?: string, sshOptions?: Record<string, any>): Promise<void> {
  await http(`/runs/${encodeURIComponent(runId)}/submit`, {
    method: 'POST',
    body: JSON.stringify({
      mode,
      backend,
      python_executable: pythonExecutable || undefined,
      ssh_target: sshTarget || undefined,
      ssh_options: sshOptions || undefined,
      backend_options: backendOptions || undefined,
    }),
  })
}

export async function cancelRun(runId: string): Promise<void> {
  await http(`/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
}

export async function getRunJobStatus(runId: string): Promise<any> {
  return await http(`/runs/${encodeURIComponent(runId)}/job/status`)
}

export async function cancelRunJob(runId: string): Promise<any> {
  return await http(`/runs/${encodeURIComponent(runId)}/job/cancel`, { method: 'POST' })
}

export async function getRun(runId: string): Promise<RunRecord> {
  return await http<RunRecord>(`/runs/${encodeURIComponent(runId)}`)
}

export async function getHealth(): Promise<{ ok: boolean }> {
  return await http<{ ok: boolean }>(`/health`)
}

export async function getLogs(runId: string, stream: 'stdout' | 'stderr'): Promise<string> {
  const res = await http<{ text: string }>(
    `/runs/${encodeURIComponent(runId)}/logs?stream=${encodeURIComponent(stream)}&tail_lines=400`,
  )
  return res.text
}

export async function getArtifacts(runId: string): Promise<ArtifactEntry[]> {
  const res = await http<{ artifacts: ArtifactEntry[] }>(`/runs/${encodeURIComponent(runId)}/artifacts`)
  return res.artifacts
}

export function downloadArtifactUrl(runId: string, path: string): string {
  return `${apiBaseUrl}/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(path)}`
}

export async function createMaterial(body: any): Promise<{ id: string; path?: string }> {
  return await http<{ id: string; path?: string }>(`/materials`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function expandGradient(material: any, geometry: any, slices: number = 8, axis: 'x'|'y'|'z'|'radial' = 'x'): Promise<{ slices: any[] }> {
  return await http<{ slices: any[] }>(`/materials/expand_gradient`, {
    method: 'POST',
    body: JSON.stringify({ material, geometry, slices, axis }),
  })
}

export async function expandGradientBatch(items: Array<{ key?: string; material: any; geometry: any; slices?: number; axis?: string }>): Promise<{ results: Record<string, any[]> }> {
  return await http<{ results: Record<string, any[]> }>(`/materials/expand_gradient_batch`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}
