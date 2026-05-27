import {
  defaultHeatPumpCop,
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
  const zone = project.zones.find((item) => item.id === device.zoneId)
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

const resolveDeviceCop = (device: Device) => Math.max(device.cop ?? defaultHeatPumpCop, 0.1)

const usesCopThermalAreaInput = (device: Device) =>
  usesCopThermalConversion(device.categoryId) && device.powerInputMode === 'area'

export const calculateDevice = (
  device: Device,
  project?: ProjectConfig,
): DeviceCalculation => {
  const zoneAreaM2 = project?.zones.find((zone) => zone.id === device.zoneId)?.areaM2 ?? 0
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
    const cop = resolveDeviceCop(device)
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

const calculateHvacAlternative = (
  project: ProjectConfig,
  devices: DeviceCalculation[],
): {
  totals: CalculationTotals
  hvacAlternative: HvacAlternativeBalance
} => {
  const rawTotals = sumCalculations(devices)
  const enabled = project.useAlternativeHeatingCooling !== false

  if (!enabled) {
    return {
      totals: rawTotals,
      hvacAlternative: {
        enabled,
        applied: false,
        heatingCalculatedPowerKw: 0,
        coolingCalculatedPowerKw: 0,
        excludedCalculatedPowerKw: 0,
      },
    }
  }

  const heatingTotals = sumCalculations(
    devices.filter((item) => item.device.categoryId === 'heatPumps'),
  )
  const coolingTotals = sumCalculations(
    devices.filter((item) => item.device.categoryId === 'cooling'),
  )
  const hasHeating = heatingTotals.calculatedPowerKw > 0
  const hasCooling = coolingTotals.calculatedPowerKw > 0

  if (!hasHeating || !hasCooling) {
    return {
      totals: rawTotals,
      hvacAlternative: {
        enabled,
        applied: false,
        heatingCalculatedPowerKw: round(heatingTotals.calculatedPowerKw),
        coolingCalculatedPowerKw: round(coolingTotals.calculatedPowerKw),
        excludedCalculatedPowerKw: 0,
      },
    }
  }

  const excludedCategoryId =
    heatingTotals.calculatedPowerKw <= coolingTotals.calculatedPowerKw ? 'heatPumps' : 'cooling'
  const excludedTotals = excludedCategoryId === 'heatPumps' ? heatingTotals : coolingTotals

  return {
    totals: {
      installedPowerKw: rawTotals.installedPowerKw - excludedTotals.installedPowerKw,
      calculatedPowerKw: rawTotals.calculatedPowerKw - excludedTotals.calculatedPowerKw,
      apparentPowerKva: rawTotals.apparentPowerKva - excludedTotals.apparentPowerKva,
    },
    hvacAlternative: {
      enabled,
      applied: true,
      heatingCalculatedPowerKw: round(heatingTotals.calculatedPowerKw),
      coolingCalculatedPowerKw: round(coolingTotals.calculatedPowerKw),
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

  const { totals, hvacAlternative } = calculateHvacAlternative(project, activeDevices)
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
      (device) => device.zoneId,
      (id) => project.zones.find((zone) => zone.id === id)?.name ?? id,
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
