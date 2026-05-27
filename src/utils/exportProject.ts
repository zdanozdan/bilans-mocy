import type { Device, ProjectConfig } from '../domain/types'

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-')
    .replace(/^-|-$/g, '')

export const exportProjectToJson = (project: ProjectConfig, devices: Device[]) => {
  const payload = JSON.stringify({ project, devices }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${sanitizeFileName(project.name) || 'bilans-energii'}.json`
  link.click()
  URL.revokeObjectURL(url)
}
