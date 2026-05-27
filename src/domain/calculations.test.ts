import { describe, expect, it } from 'vitest'
import {
  calculateDevice,
  calculateEnergyStorageAdjustment,
  calculateProjectMetrics,
  calculateProjectBalance,
} from './calculations'
import {
  defaultDevices,
  defaultProject,
  getDefaultHeatPumpThermalDensity,
  scenarios,
} from './defaults'
import type { Device } from './types'

const baseDevice: Device = {
  id: 'test-device',
  name: 'Test device',
  categoryId: 'lighting',
  zoneId: 'warehouse',
  powerInputMode: 'manual',
  quantityInputMode: 'manual',
  quantity: 4,
  unitPowerKw: 10,
  simultaneityFactor: 0.5,
  utilizationFactor: 0.8,
  cosPhi: 0.8,
  phase: '3P',
  voltageV: 400,
  scenarios: ['normal'],
}

describe('calculateDevice', () => {
  it('calculates installed, demand and apparent power', () => {
    const result = calculateDevice(baseDevice)

    expect(result.installedPowerKw).toBe(40)
    expect(result.calculatedPowerKw).toBe(16)
    expect(result.apparentPowerKva).toBe(20)
  })

  it('uses warehouse volume for heat pump thermal demand', () => {
    const result = calculateDevice(
      {
        ...baseDevice,
        categoryId: 'heatPumps',
        zoneId: 'warehouse',
        powerInputMode: 'area',
        quantity: 1,
        powerDensityWm2: 2.25,
        thermalDensityUnit: 'Wm3',
        cop: 1,
        simultaneityFactor: 1,
        utilizationFactor: 1,
      },
      defaultProject,
    )

    expect(result.installedThermalPowerKw).toBe(54)
    expect(result.installedPowerKw).toBe(54)
  })

  it('recalculates warehouse heat demand when height changes', () => {
    const device = {
      ...baseDevice,
      categoryId: 'heatPumps' as const,
      zoneId: 'warehouse',
      powerInputMode: 'area' as const,
      quantity: 1,
      powerDensityWm2: 2.25,
      cop: 1,
      simultaneityFactor: 1,
      utilizationFactor: 1,
    }
    const tallerWarehouse = { ...defaultProject, warehouseHeightM: 10 }
    const result = calculateDevice(device, tallerWarehouse)

    expect(result.installedThermalPowerKw).toBe(67.5)
  })

  it('converts CWU thermal power per person to electrical using COP', () => {
    const result = calculateDevice(
      {
        ...baseDevice,
        categoryId: 'cwu',
        zoneId: 'office',
        powerInputMode: 'area',
        quantityInputMode: 'people',
        quantity: 1,
        powerDensityWm2: 400,
        cop: 2.5,
        simultaneityFactor: 1,
        utilizationFactor: 1,
      },
      defaultProject,
    )

    expect(result.installedThermalPowerKw).toBe(14)
    expect(result.installedPowerKw).toBe(5.6)
    expect(result.calculatedPowerKw).toBe(5.6)
  })

  it('converts cooling thermal area power to electrical using COP', () => {
    const result = calculateDevice(
      {
        ...baseDevice,
        categoryId: 'cooling',
        zoneId: 'office',
        powerInputMode: 'area',
        quantity: 1,
        powerDensityWm2: 45,
        cop: 3,
        simultaneityFactor: 1,
        utilizationFactor: 1,
      },
      defaultProject,
    )

    expect(result.installedThermalPowerKw).toBe(20.25)
    expect(result.installedPowerKw).toBe(6.75)
    expect(result.calculatedPowerKw).toBe(6.75)
  })

  it('uses copMinus20C for balance, not copNormal', () => {
    const withMinus20 = calculateDevice(
      {
        ...baseDevice,
        categoryId: 'heatPumps',
        zoneId: 'office',
        powerInputMode: 'area',
        quantity: 1,
        powerDensityWm2: 40,
        thermalDensityUnit: 'Wm2',
        copMinus20C: 2,
        copNormal: 5,
        simultaneityFactor: 1,
        utilizationFactor: 1,
      },
      defaultProject,
    )

    expect(withMinus20.installedPowerKw).toBe(9)
  })

  it('converts heat pump thermal area power to electrical using COP', () => {
    const result = calculateDevice(
      {
        ...baseDevice,
        categoryId: 'heatPumps',
        zoneId: 'office',
        powerInputMode: 'area',
        quantity: 1,
        powerDensityWm2: 40,
        thermalDensityUnit: 'Wm2',
        cop: 4,
        simultaneityFactor: 1,
        utilizationFactor: 1,
      },
      defaultProject,
    )

    expect(result.installedThermalPowerKw).toBe(18)
    expect(result.installedPowerKw).toBe(4.5)
    expect(result.calculatedThermalPowerKw).toBe(18)
    expect(result.calculatedPowerKw).toBe(4.5)
  })

  it('calculates installed power from zone area and power density', () => {
    const result = calculateDevice(
      {
        ...baseDevice,
        powerInputMode: 'area',
        quantity: 1,
        unitPowerKw: 999,
        powerDensityWm2: 8,
      },
      defaultProject,
    )

    expect(result.installedPowerKw).toBe(24)
    expect(result.calculatedPowerKw).toBe(9.6)
  })

  it('can use project computer count as device quantity', () => {
    const result = calculateDevice(
      {
        ...baseDevice,
        quantityInputMode: 'computers',
        quantity: 1,
        unitPowerKw: 0.2,
      },
      { ...defaultProject, computerCount: 12 },
    )

    expect(result.resolvedQuantity).toBe(12)
    expect(result.installedPowerKw).toBe(2.4)
  })
})

describe('calculateProjectMetrics', () => {
  it('calculates warehouse volume from area and height', () => {
    const metrics = calculateProjectMetrics({
      ...defaultProject,
      warehouseAreaM2: 2500,
      warehouseHeightM: 7.5,
      officeAreaM2: 500,
      peopleCount: 42,
      computerCount: 40,
    })

    expect(metrics.totalAreaM2).toBe(3000)
    expect(metrics.warehouseVolumeM3).toBe(18750)
    expect(metrics.peopleCount).toBe(42)
    expect(metrics.computerCount).toBe(40)
  })
})

describe('calculateProjectBalance', () => {
  it('merges legacy and current office zone ids under one Polish label', () => {
    const officeZoneId = 'zone-biuro-uuid'
    const project = {
      ...defaultProject,
      zones: defaultProject.zones.map((zone) =>
        zone.id === 'office' ? { ...zone, id: officeZoneId, name: 'Biuro' } : zone,
      ),
    }
    const devices: Device[] = [
      { ...baseDevice, id: 'd-office-legacy', zoneId: 'office' },
      { ...baseDevice, id: 'd-office-new', zoneId: officeZoneId, unitPowerKw: 5 },
    ]

    const result = calculateProjectBalance(project, devices, scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.byZone).toHaveLength(1)
    expect(normalScenario?.byZone[0].label).toBe('Biuro')
  })

  it('groups active devices by category and zone for a scenario', () => {
    const result = calculateProjectBalance(defaultProject, [baseDevice], scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.installedPowerKw).toBe(40)
    expect(normalScenario?.calculatedPowerKw).toBe(16)
    expect(normalScenario?.byCategory).toHaveLength(1)
    expect(normalScenario?.byCategory[0].label).toBe('Oświetlenie')
    expect(normalScenario?.byZone[0].label).toBe('Magazyn')
  })

  it('recalculates area-based devices when zone area changes', () => {
    const project = {
      ...defaultProject,
      zones: defaultProject.zones.map((zone) =>
        zone.id === 'warehouse' ? { ...zone, areaM2: 1000 } : zone,
      ),
    }
    const areaDevice: Device = {
      ...baseDevice,
      powerInputMode: 'area',
      quantityInputMode: 'manual',
      quantity: 1,
      powerDensityWm2: 10,
    }
    const result = calculateProjectBalance(project, [areaDevice], scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.installedPowerKw).toBe(10)
    expect(normalScenario?.calculatedPowerKw).toBe(4)
  })

  it('filters devices by scenario', () => {
    const result = calculateProjectBalance(defaultProject, [baseDevice], scenarios)
    const winterScenario = result.scenarios.find((item) => item.scenario.id === 'winter')

    expect(winterScenario?.devices).toHaveLength(0)
    expect(winterScenario?.calculatedPowerKw).toBe(0)
  })

  it('adds project reserve to scenario totals', () => {
    const project = { ...defaultProject, reservePercent: 10, energyStorage: { ...defaultProject.energyStorage, enabled: false } }
    const result = calculateProjectBalance(project, [baseDevice], scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.reservePowerKw).toBe(1.6)
    expect(normalScenario?.totalWithReserveKw).toBe(17.6)
    expect(normalScenario?.netPowerKw).toBe(17.6)
  })

  it('uses the larger heating or cooling load when HVAC alternative mode is enabled', () => {
    const project = {
      ...defaultProject,
      reservePercent: 0,
      useAlternativeHeatingCooling: true,
      energyStorage: { ...defaultProject.energyStorage, enabled: false },
    }
    const heatDevice: Device = {
      ...baseDevice,
      id: 'heat',
      categoryId: 'heatPumps',
      quantity: 1,
      unitPowerKw: 30,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }
    const coolingDevice: Device = {
      ...baseDevice,
      id: 'cooling',
      categoryId: 'cooling',
      quantity: 1,
      unitPowerKw: 20,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }
    const otherDevice: Device = {
      ...baseDevice,
      id: 'other',
      categoryId: 'lighting',
      quantity: 1,
      unitPowerKw: 10,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }

    const result = calculateProjectBalance(project, [heatDevice, coolingDevice, otherDevice], scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.calculatedPowerKw).toBe(35)
    expect(normalScenario?.hvacAlternative.applied).toBe(true)
    expect(normalScenario?.hvacAlternative.mode).toBe('normalAverage')
    expect(normalScenario?.hvacAlternative.hvacContributionKw).toBe(25)
    expect(normalScenario?.hvacAlternative.excludedCalculatedPowerKw).toBe(25)
  })

  it('applies normal HVAC from seasonal peaks when heat is winter-only and cooling is summer-only', () => {
    const project = {
      ...defaultProject,
      reservePercent: 0,
      useAlternativeHeatingCooling: true,
      normalHvacDeratingFactor: 0.65,
      energyStorage: { ...defaultProject.energyStorage, enabled: false },
    }
    const heatDevice: Device = {
      ...baseDevice,
      id: 'heat',
      categoryId: 'heatPumps',
      scenarios: ['winter'],
      quantity: 1,
      unitPowerKw: 40,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }
    const coolingDevice: Device = {
      ...baseDevice,
      id: 'cooling',
      categoryId: 'cooling',
      scenarios: ['summer'],
      quantity: 1,
      unitPowerKw: 20,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }
    const baseLoad: Device = {
      ...baseDevice,
      id: 'base',
      categoryId: 'lighting',
      scenarios: ['normal'],
      quantity: 1,
      unitPowerKw: 10,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }

    const result = calculateProjectBalance(
      project,
      [heatDevice, coolingDevice, baseLoad],
      scenarios,
    )
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.calculatedPowerKw).toBe(40)
    expect(normalScenario?.hvacAlternative.applied).toBe(true)
    expect(normalScenario?.hvacAlternative.mode).toBe('normalAverage')
    expect(normalScenario?.hvacAlternative.hvacContributionKw).toBe(30)
    expect(normalScenario?.hvacAlternative.heatingCalculatedPowerKw).toBe(40)
    expect(normalScenario?.hvacAlternative.coolingCalculatedPowerKw).toBe(20)
  })

  it('uses full seasonal peak for winter when both HVAC categories are active', () => {
    const project = {
      ...defaultProject,
      reservePercent: 0,
      useAlternativeHeatingCooling: true,
      energyStorage: { ...defaultProject.energyStorage, enabled: false },
    }
    const heatDevice: Device = {
      ...baseDevice,
      id: 'heat',
      categoryId: 'heatPumps',
      scenarios: ['normal', 'winter'],
      quantity: 1,
      unitPowerKw: 30,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }
    const coolingDevice: Device = {
      ...baseDevice,
      id: 'cooling',
      categoryId: 'cooling',
      scenarios: ['normal', 'winter'],
      quantity: 1,
      unitPowerKw: 20,
      simultaneityFactor: 1,
      utilizationFactor: 1,
      cosPhi: 1,
    }

    const result = calculateProjectBalance(project, [heatDevice, coolingDevice], scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')
    const winterScenario = result.scenarios.find((item) => item.scenario.id === 'winter')

    expect(normalScenario?.calculatedPowerKw).toBe(25)
    expect(winterScenario?.calculatedPowerKw).toBe(30)
    expect(winterScenario?.hvacAlternative.mode).toBe('seasonalPeak')
  })

  it('sums heating and cooling when HVAC alternative mode is disabled', () => {
    const project = {
      ...defaultProject,
      reservePercent: 0,
      useAlternativeHeatingCooling: false,
      energyStorage: { ...defaultProject.energyStorage, enabled: false },
    }
    const heatDevice: Device = {
      ...baseDevice,
      id: 'heat',
      categoryId: 'heatPumps',
      quantity: 1,
      unitPowerKw: 30,
      simultaneityFactor: 1,
      utilizationFactor: 1,
    }
    const coolingDevice: Device = {
      ...baseDevice,
      id: 'cooling',
      categoryId: 'cooling',
      quantity: 1,
      unitPowerKw: 20,
      simultaneityFactor: 1,
      utilizationFactor: 1,
    }

    const result = calculateProjectBalance(project, [heatDevice, coolingDevice], scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.calculatedPowerKw).toBe(50)
    expect(normalScenario?.hvacAlternative.applied).toBe(false)
  })

  it('applies energy storage peak shaving to non-backup scenarios', () => {
    const project = {
      ...defaultProject,
      reservePercent: 0,
      energyStorage: {
        ...defaultProject.energyStorage,
        enabled: true,
        mode: 'peakShaving' as const,
        dischargePowerKw: 10,
        roundTripEfficiencyPercent: 90,
      },
    }
    const result = calculateProjectBalance(project, [baseDevice], scenarios)
    const normalScenario = result.scenarios.find((item) => item.scenario.id === 'normal')

    expect(normalScenario?.energyStorageAdjustmentKw).toBe(-9)
    expect(normalScenario?.netPowerKw).toBe(7)
  })

  it('calculates sample project without negative net power', () => {
    const result = calculateProjectBalance(defaultProject, defaultDevices, scenarios)

    expect(result.scenarios).toHaveLength(4)
    expect(result.scenarios.every((scenario) => scenario.netPowerKw >= 0)).toBe(true)
  })
})

describe('getDefaultHeatPumpThermalDensity', () => {
  it('uses 40 W/m2 for office heat pumps', () => {
    expect(getDefaultHeatPumpThermalDensity('office', 'Wm2')).toBe(40)
  })

  it('uses separate defaults for heat pump W/m2 and W/m3', () => {
    expect(getDefaultHeatPumpThermalDensity('warehouse', 'Wm3')).toBe(2.25)
    expect(getDefaultHeatPumpThermalDensity('warehouse', 'Wm2')).toBe(18)
    expect(getDefaultHeatPumpThermalDensity('office', 'Wm2')).toBe(40)
  })
})

describe('calculateEnergyStorageAdjustment', () => {
  it('adds charging power when storage is charging', () => {
    const project = {
      ...defaultProject,
      energyStorage: { ...defaultProject.energyStorage, mode: 'charging' as const, chargePowerKw: 25 },
    }

    expect(calculateEnergyStorageAdjustment(project, 'normal')).toBe(25)
  })
})
