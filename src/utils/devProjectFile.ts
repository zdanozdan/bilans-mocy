import type { Device, ProjectConfig } from '../domain/types'
import type { StoredProject } from './projectFile'

interface DevProjectStatus {
  available: boolean
  projectsDir: string
}

interface DevProjectList {
  files: string[]
}

interface DevProjectSaveResponse {
  ok: boolean
  fileName: string
  path: string
}

let devServerAvailable: boolean | null = null

export const isDevEnvironment = (): boolean => import.meta.env.DEV

export const getDevProjectDisplayPath = (fileName: string) => `projects/${fileName}`

export const checkDevProjectServer = async (): Promise<boolean> => {
  if (!isDevEnvironment()) {
    devServerAvailable = false
    return false
  }

  try {
    const response = await fetch('/api/project/status')

    if (!response.ok) {
      devServerAvailable = false
      return false
    }

    const status = (await response.json()) as DevProjectStatus
    devServerAvailable = status.available
    return status.available
  } catch {
    devServerAvailable = false
    return false
  }
}

export const isDevProjectServerCached = (): boolean => devServerAvailable === true

export const listDevProjectFiles = async (): Promise<string[]> => {
  const response = await fetch('/api/project/list')

  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as DevProjectList
  return payload.files
}

export const loadProjectFromDevServer = async (
  fileName: string,
): Promise<StoredProject | null> => {
  const response = await fetch(`/api/project?file=${encodeURIComponent(fileName)}`)

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Nie udało się wczytać projektu z serwera deweloperskiego.')
  }

  return (await response.json()) as StoredProject
}

export const saveProjectToDevServer = async (
  fileName: string,
  project: ProjectConfig,
  devices: Device[],
): Promise<DevProjectSaveResponse> => {
  const response = await fetch('/api/project', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, project, devices }),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(error?.error ?? 'Nie udało się zapisać projektu na dysku.')
  }

  return (await response.json()) as DevProjectSaveResponse
}
