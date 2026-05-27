import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import type { Device, ProjectConfig } from './types'
import {
  getZoneDisplayName,
  normalizeDeviceZoneIds,
  resolveDeviceZoneId,
} from './zones'

const officeZoneId = 'zone-biuro-uuid'

const projectWithRenamedOffice: ProjectConfig = {
  ...defaultProject,
  zones: defaultProject.zones.map((zone) =>
    zone.id === 'office' ? { ...zone, id: officeZoneId, name: 'Biuro' } : zone,
  ),
}

const baseDevice: Device = {
  id: 'd1',
  name: 'Test',
  categoryId: 'lighting',
  zoneId: 'warehouse',
  powerInputMode: 'manual',
  quantity: 1,
  unitPowerKw: 10,
  simultaneityFactor: 1,
  utilizationFactor: 1,
  cosPhi: 0.9,
  phase: '3P',
  voltageV: 400,
  scenarios: ['normal'],
}

describe('zones', () => {
  it('maps legacy office id to renamed office zone', () => {
    expect(resolveDeviceZoneId(projectWithRenamedOffice, 'office')).toBe(officeZoneId)
    expect(getZoneDisplayName(projectWithRenamedOffice, 'office')).toBe('Biuro')
  })

  it('normalizes device zone ids on load', () => {
    const devices = normalizeDeviceZoneIds(projectWithRenamedOffice, [
      { ...baseDevice, zoneId: 'office' },
      { ...baseDevice, id: 'd2', zoneId: officeZoneId },
    ])

    expect(devices.every((device) => device.zoneId === officeZoneId)).toBe(true)
  })
})
