import { apiBaseUrl } from './config'

export async function getResourceUsage(runId: string): Promise<any[]> {
  const res = await fetch(`${apiBaseUrl}/runs/${encodeURIComponent(runId)}/resource`)
  if (!res.ok) return []
  return await res.json()
}

export async function getRunMetrics(runId: string): Promise<any[]> {
  const res = await fetch(`${apiBaseUrl}/runs/${encodeURIComponent(runId)}/metrics`)
  if (!res.ok) return []
  return await res.json()
}

export async function getHostMetrics(): Promise<any> {
  const res = await fetch(`${apiBaseUrl}/metrics/hosts`)
  if (!res.ok) return {}
  return await res.json()
}
