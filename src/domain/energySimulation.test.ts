import { describe, expect, it } from 'vitest'
import { defaultDevices, defaultProject } from './defaults'
import {
  advanceIndoorTemperatureC,
  computeHeatingThermalDemandKw,
  getSimulationExternalTempC,
  interpolateCopAtOutdoorTemp,
  resolveEnergySimulationConfig,
  simulateScenarioEnergy,
} from './energySimulation'
import type { Device } from './types'

describe('energySimulation', () => {
  it('keeps low heating before preheat ramp and rises toward work start in winter', () => {
    const winter = simulateScenarioEnergy(
      {
        ...defaultProject,
        energySimulation: {
          ...resolveEnergySimulationConfig(defaultProject),
          externalTempWinterC: -20,
          winterNightSetpointC: 12,
          preheatRampStartHour: 5,
          preheatStartHour: 22,
          workStartHour: 8,
        },
      },
      defaultDevices,
      'winter',
      'Zima',
    )

    const hour23 = winter?.hourly.find((point) => point.hour === 23)
    const hour6 = winter?.hourly.find((point) => point.hour === 6)
    const hour10 = winter?.hourly.find((point) => point.hour === 10)

    expect(hour23?.setpointC).toBe(12)
    expect(hour6?.setpointC).toBeGreaterThan(12)
    expect(hour10?.setpointC).toBeGreaterThan(hour6?.setpointC ?? 0)
    expect(hour23?.electricalHeatingKw ?? 0).toBeLessThan(hour6?.electricalHeatingKw ?? 0)
    expect(hour10?.electricalHeatingKw ?? 0).toBeGreaterThan(
      (hour23?.electricalHeatingKw ?? 0) * 1.2,
    )
  })

  it('assigns preheat, work and setback hours in daily profile', () => {
    const winter = simulateScenarioEnergy(
      defaultProject,
      defaultDevices,
      'winter',
      'Zima',
    )

    expect(winter?.hourly.find((point) => point.hour === 23)?.phase).toBe('preheat')
    expect(winter?.hourly.find((point) => point.hour === 6)?.phase).toBe('preheat')
    expect(winter?.hourly.find((point) => point.hour === 10)?.phase).toBe('work')
    expect(winter?.hourly.find((point) => point.hour === 18)?.phase).toBe('setback')
  })

  it('reduces heating right after setback while indoor temp is still high', () => {
    const winter = simulateScenarioEnergy(
      {
        ...defaultProject,
        energySimulation: {
          ...resolveEnergySimulationConfig(defaultProject),
          externalTempWinterC: -20,
          winterNightSetpointC: 12,
          workStartHour: 8,
          workEndHour: 16,
          preheatStartHour: 22,
          buildingThermalTimeConstantH: 8,
        },
      },
      defaultDevices,
      'winter',
      'Zima',
    )

    const hour16 = winter?.hourly.find((point) => point.hour === 16)
    const hour23 = winter?.hourly.find((point) => point.hour === 23)

    expect(hour16?.phase).toBe('setback')
    expect(hour16?.indoorTempC ?? 0).toBeGreaterThan(hour16?.setpointC ?? 0)
    expect(hour16?.thermalHeatingKw ?? 0).toBeLessThan(hour23?.thermalHeatingKw ?? 0)
  })

  it('uses higher heating during work than during night setback within preheat', () => {
    const winter = simulateScenarioEnergy(
      defaultProject,
      defaultDevices,
      'winter',
      'Zima',
    )

    expect(winter).not.toBeNull()

    const nightPreheat = winter!.hourly.filter(
      (point) => point.phase === 'preheat' && point.hour >= 22,
    )
    const work = winter!.hourly.filter((point) => point.phase === 'work')

    const avgNightPreheat =
      nightPreheat.reduce((sum, point) => sum + point.electricalHeatingKw, 0) /
      nightPreheat.length
    const avgWork =
      work.reduce((sum, point) => sum + point.electricalHeatingKw, 0) / work.length

    expect(avgWork).toBeGreaterThan(avgNightPreheat)
  })

  it('excludes cooling in winter and heating in summer', () => {
    const heatPump = defaultDevices.find((device) => device.categoryId === 'heatPumps')
    const cooling = defaultDevices.find((device) => device.categoryId === 'cooling')
    const devices: Device[] = [
      {
        ...(heatPump ?? defaultDevices[0]),
        id: 'hp-winter',
        categoryId: 'heatPumps',
        scenarios: ['winter'],
      },
      {
        ...(cooling ?? defaultDevices[0]),
        id: 'cool-summer',
        categoryId: 'cooling',
        scenarios: ['summer'],
      },
    ]

    const winter = simulateScenarioEnergy(defaultProject, devices, 'winter', 'Zima')
    const summer = simulateScenarioEnergy(defaultProject, devices, 'summer', 'Lato')

    expect(winter?.showHeating).toBe(true)
    expect(winter?.showCooling).toBe(false)
    expect(winter?.hourly.every((p) => p.electricalCoolingKw === 0)).toBe(true)

    expect(summer?.showHeating).toBe(false)
    expect(summer?.showCooling).toBe(true)
    expect(summer?.hourly.every((p) => p.electricalHeatingKw === 0)).toBe(true)
  })

  it('includes heat pumps for normal scenario via seasonal reference', () => {
    const heatPump = defaultDevices.find((device) => device.categoryId === 'heatPumps')
    const heatOnlyWinter: Device = {
      ...(heatPump ?? defaultDevices[0]),
      id: 'hp-test',
      categoryId: 'heatPumps',
      scenarios: ['winter'],
    }

    const normal = simulateScenarioEnergy(
      defaultProject,
      [heatOnlyWinter],
      'normal',
      'Praca normalna',
    )

    expect(normal?.maxHeatingThermalKw).toBeGreaterThan(0)
    expect(normal?.hourly.some((point) => point.electricalHeatingKw > 0)).toBe(true)
  })

  it('reads external temperature per scenario from config', () => {
    const config = resolveEnergySimulationConfig({
      ...defaultProject,
      energySimulation: {
        ...resolveEnergySimulationConfig(defaultProject),
        externalTempWinterC: -18,
        externalTempSummerC: 32,
        externalTempNormalC: 4,
      },
    })

    expect(getSimulationExternalTempC('winter', config)).toBe(-18)
    expect(getSimulationExternalTempC('summer', config)).toBe(32)
    expect(getSimulationExternalTempC('normal', config)).toBe(4)
  })

  it('needs no extra heating when indoor temp equals setpoint at steady losses', () => {
    const ua = 10
    const c = ua * 6
    const demand = computeHeatingThermalDemandKw(20, 20, -20, ua, c)

    expect(demand).toBeCloseTo(ua * 40, 5)
    expect(computeHeatingThermalDemandKw(20, 22, -20, ua, c)).toBeLessThan(demand)
  })

  it('advances indoor temperature when heating exceeds heat loss', () => {
    const ua = 10
    const indoor = 12
    const outdoor = -20
    const heatLossKw = ua * (indoor - outdoor)
    const next = advanceIndoorTemperatureC(indoor, outdoor, heatLossKw + 30, ua, 60)

    expect(next).toBeGreaterThan(indoor)
  })

  it('interpolates COP between -20 and +7 C', () => {
    expect(interpolateCopAtOutdoorTemp(-20, 1.75, 3.5)).toBe(1.75)
    expect(interpolateCopAtOutdoorTemp(7, 1.75, 3.5)).toBe(3.5)
    expect(interpolateCopAtOutdoorTemp(-5, 1.75, 3.5)).toBeGreaterThan(1.75)
    expect(interpolateCopAtOutdoorTemp(-5, 1.75, 3.5)).toBeLessThan(3.5)
  })
})
