import { describe, expect, it } from 'vitest'
import { defaultDevices, defaultProject } from './defaults'
import {
  buildHeatPumpSoftStartAssumptionRow,
  buildLlmReviewPrompt,
} from './projectAssumptionsDisplay'
import type { Device } from './types'

const heatPumpDevice: Device = {
  id: 'hp',
  name: 'Ogrzewanie biura PC',
  categoryId: 'heatPumps',
  zoneId: 'office',
  powerInputMode: 'manual',
  quantityInputMode: 'manual',
  quantity: 1,
  unitPowerKw: 10,
  simultaneityFactor: 1,
  utilizationFactor: 1,
  cosPhi: 0.9,
  phase: '3P',
  voltageV: 400,
  scenarios: ['winter'],
}

describe('buildHeatPumpSoftStartAssumptionRow', () => {
  it('returns soft start row when heat pumps exist', () => {
    const row = buildHeatPumpSoftStartAssumptionRow([heatPumpDevice])

    expect(row?.[0]).toContain('PC')
    expect(row?.[1]).toContain('soft start')
  })

  it('returns null when there are no heat pumps', () => {
    expect(
      buildHeatPumpSoftStartAssumptionRow([
        { ...heatPumpDevice, id: 'light', categoryId: 'lighting', name: 'LED' },
      ]),
    ).toBeNull()
  })
})

describe('buildLlmReviewPrompt', () => {
  it('asks about BESS sense when storage is disabled', () => {
    const prompt = buildLlmReviewPrompt({
      ...defaultProject,
      energyStorage: { ...defaultProject.energyStorage, enabled: false },
    })

    expect(prompt).toContain('CZY MAGAZYN ENERGII MA SENS')
    expect(prompt).not.toContain('ANALIZA SKONFIGUROWANEGO MAGAZYNU')
    expect(prompt).not.toContain('PEAK SHAVING')
  })

  it('includes peak shaving analysis after PV when storage is enabled', () => {
    const prompt = buildLlmReviewPrompt(defaultProject, defaultDevices)

    expect(prompt).toContain('ANALIZA SKONFIGUROWANEGO MAGAZYNU')
    expect(prompt).toContain('CZY MAGAZYN ENERGII MA SENS')
    expect(prompt.indexOf('INTEGRACJA Z INSTALACJĄ FOTOWOLTAICZNĄ')).toBeLessThan(
      prompt.indexOf('ANALIZA SKONFIGUROWANEGO MAGAZYNU'),
    )
  })
})
