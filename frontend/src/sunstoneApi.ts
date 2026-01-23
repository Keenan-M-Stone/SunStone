import type { ArtifactEntry, ProjectRecord, RunRecord } from './types'
import { apiBaseUrl } from './config'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'content-type': 'application/json',
    },
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${txt ? `: ${txt}` : ''}`)
  }

  return (await res.json()) as T
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

export async function submitRun(runId: string, backend: string): Promise<void> {
  await http(`/runs/${encodeURIComponent(runId)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ mode: 'local', backend }),
  })
}

export async function getRun(runId: string): Promise<RunRecord> {
  return await http<RunRecord>(`/runs/${encodeURIComponent(runId)}`)
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
