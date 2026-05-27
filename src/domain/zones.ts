import type { Device, ProjectConfig, Zone } from './types'

/** Domyślne identyfikatory stref z szablonu projektu → typ strefy. */
export const LEGACY_ZONE_ID_TO_TYPE: Record<string, Zone['type']> = {
  warehouse: 'warehouse',
  office: 'office',
  'server-room': 'serverRoom',
  technical: 'technical',
}

/** Polskie nazwy dla starych ID, gdy brak strefy w projekcie. */
export const LEGACY_ZONE_LABELS: Record<string, string> = {
  warehouse: 'Magazyn',
  office: 'Biuro',
  'server-room': 'Serwerownia',
  technical: 'Pomieszczenia techniczne',
}

export const resolveDeviceZone = (
  project: ProjectConfig,
  zoneId: string,
): Zone | undefined => {
  const direct = project.zones.find((zone) => zone.id === zoneId)
  if (direct) {
    return direct
  }

  const legacyType = LEGACY_ZONE_ID_TO_TYPE[zoneId]
  if (!legacyType) {
    return undefined
  }

  return project.zones.find((zone) => zone.type === legacyType)
}

export const resolveDeviceZoneId = (project: ProjectConfig, zoneId: string): string =>
  resolveDeviceZone(project, zoneId)?.id ?? zoneId

export const getZoneDisplayName = (project: ProjectConfig, zoneId: string): string => {
  const zone = resolveDeviceZone(project, zoneId)
  if (zone) {
    return zone.name
  }

  return LEGACY_ZONE_LABELS[zoneId] ?? zoneId
}

/** Ujednolica zoneId urządzeń do ID stref zdefiniowanych w projekcie. */
export const normalizeDeviceZoneIds = (
  project: ProjectConfig,
  devices: Device[],
): Device[] =>
  devices.map((device) => ({
    ...device,
    zoneId: resolveDeviceZoneId(project, device.zoneId),
  }))
