import type { RunRecord } from './types'
import { apiBaseUrl } from './config'

export async function getResourceUsage(runId: string): Promise<any[]> {
  const res = await fetch(`${apiBaseUrl}/runs/${encodeURIComponent(runId)}/resource`)
  if (!res.ok) return []
  return await res.json()
}
