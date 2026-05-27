import { describe, expect, it } from 'vitest'
import { buildHeatDemandRows, wm3ToEquivalentWm2 } from './heatDemandDisplay'
import type { Device, ProjectConfig } from './types'

const baseProject: ProjectConfig = {
  name: 'Test',
  buildingType: 'Test',
  warehouseAreaM2: 500,
  warehouseHeightM: 8,
  officeAreaM2: 200,
  peopleCount: 10,
  computerCount: 5,
  minWarehouseTempC: 10,
  maxWarehouseTempC: 25,
  minOfficeTempC: 20,
  maxOfficeTempC: 24,
  reservePercent: 15,
  useAlternativeHeatingCooling: true,
  zones: [
    { id: 'warehouse', name: 'Magazyn', type: 'warehouse', areaM2: 500, heightM: 8 },
    { id: 'office', name: 'Biuro', type: 'office', areaM2: 200, heightM: 3 },
  ],
  energyStorage: {
    enabled: false,
    capacityKwh: 0,
    chargePowerKw: 0,
    dischargePowerKw: 0,
    mode: 'neutral',
    roundTripEfficiencyPercent: 90,
  },
}

const heatDevice = (
  id: string,
  zoneId: string,
  powerDensityWm2: number,
  thermalDensityUnit: 'Wm2' | 'Wm3',
): Device => ({
  id,
  name: id,
  categoryId: 'heatPumps',
  zoneId,
  powerInputMode: 'area',
  quantity: 1,
  unitPowerKw: 1,
  powerDensityWm2,
  thermalDensityUnit,
  copMinus20C: 1.75,
  simultaneityFactor: 1,
  utilizationFactor: 1,
  cosPhi: 0.9,
  phase: '3P',
  voltageV: 400,
  scenarios: ['winter'],
})

describe('buildHeatDemandRows', () => {
  it('lists office W/m2 and warehouse W/m3 from heat pump devices', () => {
    const rows = buildHeatDemandRows(baseProject, [
      heatDevice('office-hp', 'office', 45, 'Wm2'),
      heatDevice('warehouse-hp', 'warehouse', 7, 'Wm3'),
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(['Biuro — ogrzewanie', '45 W/m²'])
    expect(rows[1][0]).toBe('Magazyn — ogrzewanie')
    expect(rows[1][1]).toBe('7 W/m³ (= 56.0 W/m² przy h = 8.0 m)')
  })

  it('converts W/m3 to equivalent W/m2 using height', () => {
    expect(wm3ToEquivalentWm2(7, 8)).toBe(56)
    expect(wm3ToEquivalentWm2(2.25, 8)).toBe(18)
  })
})
