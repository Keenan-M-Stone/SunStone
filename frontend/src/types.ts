export type ProjectRecord = {
  id: string
  name: string
  created_at: string
}

export type RunRecord = {
  id: string
  project_id: string
  created_at: string
  status: string
  backend: string
}

export type ArtifactEntry = {
  path: string
  size_bytes: number
  mtime: number
}
