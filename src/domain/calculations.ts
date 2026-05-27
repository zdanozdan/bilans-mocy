import {
  defaultHeatPumpCopMinus20C,
  deviceCategories,
  getDefaultThermalDensityUnit,
  scenarios as defaultScenarios,
} from './defaults'
import type {
  Device,
  DeviceCalculation,
  DeviceCategoryId,
  GroupedBalanceRow,
  HvacAlternativeBalance,
  ProjectBalance,
  ProjectConfig,
  ProjectMetrics,
  Scenario,
  ScenarioBalance,
  ScenarioId,
  ThermalDensityUnit,
  Zone,
} from './types'
import { getZoneDisplayName, resolveDeviceZone, resolveDeviceZoneId } from './zones'

export const usesCopThermalConversion = (categoryId: DeviceCategoryId) =>
  categoryId === 'heatPumps' || categoryId === 'cooling' || categoryId === 'cwu'

export const usesCwuPeopleThermalInput = (device: Device) =>
  device.categoryId === 'cwu' &&
  device.powerInputMode === 'area' &&
  (device.quantityInputMode ?? 'manual') === 'people'

export type HeatPumpThermalBasis = 'area' | 'volume'

export const resolveThermalDensityUnit = (
  device: Device,
  zoneType: Zone['type'],
): ThermalDensityUnit => {
  if (device.thermalDensityUnit) {
    return device.thermalDensityUnit
  }

  if (device.categoryId === 'cooling' || device.categoryId === 'cwu') {
    return 'Wm2'
  }

  return getDefaultThermalDensityUnit(zoneType)
}

const round = (value: number, precision = 2) => {
  const multiplier = 10 ** precision
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier
}

export const getWarehouseVolumeM3 = (project: ProjectConfig) =>
  project.warehouseAreaM2 * project.warehouseHeightM

export const getHeatPumpThermalBasis = (unit: ThermalDensityUnit): HeatPumpThermalBasis =>
  unit === 'Wm3' ? 'volume' : 'area'

export const getZoneVolumeM3 = (project: ProjectConfig, zone: Zone): number => {
  if (zone.type === 'warehouse') {
    return getWarehouseVolumeM3(project)
  }

  return zone.areaM2 * Math.max(zone.heightM ?? 0, 0)
}

export const getHeatPumpThermalBase = (
  project: ProjectConfig,
  device: Device,
): { basis: HeatPumpThermalBasis; valueM2OrM3: number; unit: ThermalDensityUnit } => {
  const zone = resolveDeviceZone(project, device.zoneId)
  const zoneType = zone?.type ?? 'custom'
  const unit = resolveThermalDensityUnit(device, zoneType)

  if (unit === 'Wm3') {
    return {
      basis: 'volume',
      unit,
      valueM2OrM3: zone ? getZoneVolumeM3(project, zone) : 0,
    }
  }

  return {
    basis: 'area',
    unit,
    valueM2OrM3: zone?.areaM2 ?? 0,
  }
}

export const calculateProjectMetrics = (project: ProjectConfig): ProjectMetrics => ({
  totalAreaM2: round(project.warehouseAreaM2 + project.officeAreaM2),
  warehouseVolumeM3: round(getWarehouseVolumeM3(project)),
  peopleCount: project.peopleCount,
  computerCount: project.computerCount,
})

export const resolveDeviceQuantity = (device: Device, project?: ProjectConfig) => {
  if (device.quantityInputMode === 'people') {
    return project?.peopleCount ?? device.quantity
  }

  if (device.quantityInputMode === 'computers') {
    return project?.computerCount ?? device.quantity
  }

  return device.quantity
}

/** Do bilansu przyłącza liczymy moc el. z COP przy -20°C. */
export const resolveDeviceCopMinus20C = (device: Device) =>
  Math.max(device.copMinus20C ?? device.cop ?? defaultHeatPumpCopMinus20C, 0.1)

const usesCopThermalAreaInput = (device: Device) =>
  usesCopThermalConversion(device.categoryId) && device.powerInputMode === 'area'

export const calculateDevice = (
  device: Device,
  project?: ProjectConfig,
): DeviceCalculation => {
  const zoneAreaM2 = project ? (resolveDeviceZone(project, device.zoneId)?.areaM2 ?? 0) : 0
  const resolvedQuantity = resolveDeviceQuantity(device, project)

  if (usesCopThermalAreaInput(device)) {
    const thermalBase = usesCwuPeopleThermalInput(device)
      ? 1
      : project
        ? getHeatPumpThermalBase(project, device).valueM2OrM3
        : zoneAreaM2
    const installedThermalPowerKw =
      (thermalBase * (device.powerDensityWm2 ?? 0) * resolvedQuantity) / 1000
    const calculatedThermalPowerKw =
      installedThermalPowerKw * device.simultaneityFactor * device.utilizationFactor
    const cop = resolveDeviceCopMinus20C(device)
    const installedPowerKw = installedThermalPowerKw / cop
    const calculatedPowerKw = calculatedThermalPowerKw / cop
    const apparentPowerKva = calculatedPowerKw / Math.max(device.cosPhi, 0.01)

    return {
      device,
      resolvedQuantity: round(resolvedQuantity),
      installedThermalPowerKw: round(installedThermalPowerKw),
      calculatedThermalPowerKw: round(calculatedThermalPowerKw),
      installedPowerKw: round(installedPowerKw),
      calculatedPowerKw: round(calculatedPowerKw),
      apparentPowerKva: round(apparentPowerKva),
    }
  }

  const installedPowerKw =
    device.powerInputMode === 'area'
      ? (zoneAreaM2 * (device.powerDensityWm2 ?? 0) * resolvedQuantity) / 1000
      : resolvedQuantity * device.unitPowerKw
  const calculatedPowerKw =
    installedPowerKw * device.simultaneityFactor * device.utilizationFactor
  const apparentPowerKva = calculatedPowerKw / Math.max(device.cosPhi, 0.01)

  return {
    device,
    resolvedQuantity: round(resolvedQuantity),
    installedPowerKw: round(installedPowerKw),
    calculatedPowerKw: round(calculatedPowerKw),
    apparentPowerKva: round(apparentPowerKva),
  }
}

const sumCalculations = (devices: DeviceCalculation[]) =>
  devices.reduce(
    (acc, item) => ({
      installedPowerKw: acc.installedPowerKw + item.installedPowerKw,
      calculatedPowerKw: acc.calculatedPowerKw + item.calculatedPowerKw,
      apparentPowerKva: acc.apparentPowerKva + item.apparentPowerKva,
    }),
    { installedPowerKw: 0, calculatedPowerKw: 0, apparentPowerKva: 0 },
  )

interface CalculationTotals {
  installedPowerKw: number
  calculatedPowerKw: number
  apparentPowerKva: number
}

const replaceHvacInTotals = (
  rawTotals: CalculationTotals,
  heatingTotals: CalculationTotals,
  coolingTotals: CalculationTotals,
  hvacTotals: CalculationTotals,
): CalculationTotals => ({
  installedPowerKw:
    rawTotals.installedPowerKw -
    heatingTotals.installedPowerKw -
    coolingTotals.installedPowerKw +
    hvacTotals.installedPowerKw,
  calculatedPowerKw:
    rawTotals.calculatedPowerKw -
    heatingTotals.calculatedPowerKw -
    coolingTotals.calculatedPowerKw +
    hvacTotals.calculatedPowerKw,
  apparentPowerKva:
    rawTotals.apparentPowerKva -
    heatingTotals.apparentPowerKva -
    coolingTotals.apparentPowerKva +
    hvacTotals.apparentPowerKva,
})

const scaleCalculationTotals = (totals: CalculationTotals, factor: number): CalculationTotals => ({
  installedPowerKw: totals.installedPowerKw * factor,
  calculatedPowerKw: totals.calculatedPowerKw * factor,
  apparentPowerKva: totals.apparentPowerKva * factor,
})

const averageCalculationTotals = (
  a: CalculationTotals,
  b: CalculationTotals,
): CalculationTotals => ({
  installedPowerKw: (a.installedPowerKw + b.installedPowerKw) / 2,
  calculatedPowerKw: (a.calculatedPowerKw + b.calculatedPowerKw) / 2,
  apparentPowerKva: (a.apparentPowerKva + b.apparentPowerKva) / 2,
})

const calculateHvacAlternative = (
  project: ProjectConfig,
  devices: DeviceCalculation[],
  scenarioId: ScenarioId,
): {
  totals: CalculationTotals
  hvacAlternative: HvacAlternativeBalance
} => {
  const rawTotals = sumCalculations(devices)
  const enabled = project.useAlternativeHeatingCooling !== false
  const heatingTotals = sumCalculations(
    devices.filter((item) => item.device.categoryId === 'heatPumps'),
  )
  const coolingTotals = sumCalculations(
    devices.filter((item) => item.device.categoryId === 'cooling'),
  )
  const heatingCalculatedPowerKw = round(heatingTotals.calculatedPowerKw)
  const coolingCalculatedPowerKw = round(coolingTotals.calculatedPowerKw)
  const hasHeating = heatingTotals.calculatedPowerKw > 0
  const hasCooling = coolingTotals.calculatedPowerKw > 0

  const baseHvac = {
    enabled,
    heatingCalculatedPowerKw,
    coolingCalculatedPowerKw,
  }

  if (!enabled) {
    return {
      totals: rawTotals,
      hvacAlternative: {
        ...baseHvac,
        applied: false,
        excludedCalculatedPowerKw: 0,
      },
    }
  }

  if (scenarioId === 'normal') {
    if (hasHeating && hasCooling) {
      const hvacTotals = averageCalculationTotals(heatingTotals, coolingTotals)
      const hvacContributionKw = round(hvacTotals.calculatedPowerKw)
      const excludedCalculatedPowerKw = round(
        heatingTotals.calculatedPowerKw +
          coolingTotals.calculatedPowerKw -
          hvacTotals.calculatedPowerKw,
      )

      return {
        totals: replaceHvacInTotals(rawTotals, heatingTotals, coolingTotals, hvacTotals),
        hvacAlternative: {
          ...baseHvac,
          applied: true,
          mode: 'normalAverage',
          hvacContributionKw,
          excludedCalculatedPowerKw,
        },
      }
    }

    if (hasHeating || hasCooling) {
      const deratingFactor = Math.min(
        Math.max(project.normalHvacDeratingFactor ?? 0.65, 0.05),
        1,
      )
      const seasonalTotals = hasHeating ? heatingTotals : coolingTotals
      const hvacTotals = scaleCalculationTotals(seasonalTotals, deratingFactor)
      const hvacContributionKw = round(hvacTotals.calculatedPowerKw)
      const excludedCalculatedPowerKw = round(
        seasonalTotals.calculatedPowerKw - hvacTotals.calculatedPowerKw,
      )
      const emptyTotals: CalculationTotals = {
        installedPowerKw: 0,
        calculatedPowerKw: 0,
        apparentPowerKva: 0,
      }
      const heating = hasHeating ? heatingTotals : emptyTotals
      const cooling = hasCooling ? coolingTotals : emptyTotals

      return {
        totals: replaceHvacInTotals(rawTotals, heating, cooling, hvacTotals),
        hvacAlternative: {
          ...baseHvac,
          applied: true,
          mode: 'normalDerated',
          hvacContributionKw,
          excludedCategoryId: hasHeating ? 'heatPumps' : 'cooling',
          excludedCalculatedPowerKw,
        },
      }
    }

    return {
      totals: rawTotals,
      hvacAlternative: {
        ...baseHvac,
        applied: false,
        excludedCalculatedPowerKw: 0,
      },
    }
  }

  if (!hasHeating || !hasCooling) {
    return {
      totals: rawTotals,
      hvacAlternative: {
        ...baseHvac,
        applied: false,
        excludedCalculatedPowerKw: 0,
      },
    }
  }

  const excludedCategoryId =
    heatingTotals.calculatedPowerKw <= coolingTotals.calculatedPowerKw ? 'heatPumps' : 'cooling'
  const excludedTotals = excludedCategoryId === 'heatPumps' ? heatingTotals : coolingTotals
  const hvacTotals = excludedCategoryId === 'heatPumps' ? coolingTotals : heatingTotals

  return {
    totals: replaceHvacInTotals(rawTotals, heatingTotals, coolingTotals, hvacTotals),
    hvacAlternative: {
      ...baseHvac,
      applied: true,
      mode: 'seasonalPeak',
      hvacContributionKw: round(hvacTotals.calculatedPowerKw),
      excludedCategoryId,
      excludedCalculatedPowerKw: round(excludedTotals.calculatedPowerKw),
    },
  }
}

const groupCalculations = (
  devices: DeviceCalculation[],
  getKey: (device: Device) => string,
  getLabel: (key: string) => string,
): GroupedBalanceRow[] => {
  const rows = new Map<string, DeviceCalculation[]>()

  for (const calculation of devices) {
    const key = getKey(calculation.device)
    rows.set(key, [...(rows.get(key) ?? []), calculation])
  }

  return [...rows.entries()]
    .map(([id, groupedDevices]) => {
      const totals = sumCalculations(groupedDevices)

      return {
        id,
        label: getLabel(id),
        installedPowerKw: round(totals.installedPowerKw),
        calculatedPowerKw: round(totals.calculatedPowerKw),
        apparentPowerKva: round(totals.apparentPowerKva),
      }
    })
    .sort((a, b) => b.calculatedPowerKw - a.calculatedPowerKw)
}

export const calculateEnergyStorageAdjustment = (
  project: ProjectConfig,
  scenarioId: ScenarioId,
) => {
  const storage = project.energyStorage

  if (!storage.enabled || storage.mode === 'neutral') {
    return 0
  }

  if (storage.mode === 'charging') {
    return round(storage.chargePowerKw)
  }

  const effectiveDischargePower =
    storage.dischargePowerKw * (storage.roundTripEfficiencyPercent / 100)

  if (storage.mode === 'discharging') {
    return round(-effectiveDischargePower)
  }

  if (storage.mode === 'peakShaving' && scenarioId !== 'backup') {
    return round(-effectiveDischargePower)
  }

  return 0
}

export const calculateScenarioBalance = (
  project: ProjectConfig,
  devices: Device[],
  scenario: Scenario,
): ScenarioBalance => {
  const activeDevices = devices
    .filter((device) => device.scenarios.includes(scenario.id))
    .map((device) => calculateDevice(device, project))

  const { totals, hvacAlternative } = calculateHvacAlternative(
    project,
    activeDevices,
    scenario.id,
  )
  const reservePowerKw = totals.calculatedPowerKw * (project.reservePercent / 100)
  const totalWithReserveKw = totals.calculatedPowerKw + reservePowerKw
  const energyStorageAdjustmentKw = calculateEnergyStorageAdjustment(project, scenario.id)
  const netPowerKw = Math.max(0, totalWithReserveKw + energyStorageAdjustmentKw)

  return {
    scenario,
    devices: activeDevices,
    byCategory: groupCalculations(
      activeDevices,
      (device) => device.categoryId,
      (id) => deviceCategories.find((category) => category.id === id)?.name ?? id,
    ),
    byZone: groupCalculations(
      activeDevices,
      (device) => resolveDeviceZoneId(project, device.zoneId),
      (id) => getZoneDisplayName(project, id),
    ),
    installedPowerKw: round(totals.installedPowerKw),
    calculatedPowerKw: round(totals.calculatedPowerKw),
    apparentPowerKva: round(totals.apparentPowerKva),
    reservePowerKw: round(reservePowerKw),
    totalWithReserveKw: round(totalWithReserveKw),
    energyStorageAdjustmentKw,
    netPowerKw: round(netPowerKw),
    hvacAlternative,
  }
}

export const calculateProjectBalance = (
  project: ProjectConfig,
  devices: Device[],
  scenarios: Scenario[] = defaultScenarios,
): ProjectBalance => ({
  project,
  metrics: calculateProjectMetrics(project),
  scenarios: scenarios.map((scenario) => calculateScenarioBalance(project, devices, scenario)),
})
