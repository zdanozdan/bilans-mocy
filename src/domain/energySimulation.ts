import { calculateDevice, resolveDeviceCopMinus20C } from './calculations'
import { defaultEnergySimulation, defaultHeatPumpCopMinus20C, defaultHeatPumpCopNormal } from './defaults'
import { contributesToNormalHvacViaSeasonalReference } from './hvacDisplay'
import type {
  Device,
  EnergySimulationConfig,
  EnergySimulationPhase,
  HourlyEnergyPoint,
  ProjectConfig,
  ScenarioEnergySimulation,
  ScenarioId,
} from './types'

const SIMULATION_SCENARIO_IDS: ScenarioId[] = ['normal', 'winter', 'summer']
const SIMULATION_PASS_COUNT = 2

export const resolveEnergySimulationConfig = (
  project: ProjectConfig,
): EnergySimulationConfig => ({
  ...defaultEnergySimulation,
  ...project.energySimulation,
})

export const getSimulationExternalTempC = (
  scenarioId: ScenarioId,
  config: EnergySimulationConfig,
): number => {
  switch (scenarioId) {
    case 'winter':
      return config.externalTempWinterC
    case 'summer':
      return config.externalTempSummerC
    case 'normal':
      return config.externalTempNormalC
    default:
      return config.externalTempNormalC
  }
}

export const interpolateCopAtOutdoorTemp = (
  outdoorTempC: number,
  copMinus20C: number,
  copNormal: number,
): number => {
  if (outdoorTempC <= -20) {
    return copMinus20C
  }

  if (outdoorTempC >= 7) {
    return copNormal
  }

  return copMinus20C + ((copNormal - copMinus20C) * (outdoorTempC + 20)) / 27
}

const isHeatingRelevantForSimulation = (scenarioId: ScenarioId) =>
  scenarioId === 'winter' || scenarioId === 'normal'

const isCoolingRelevantForSimulation = (scenarioId: ScenarioId) =>
  scenarioId === 'summer' || scenarioId === 'normal'

const isDeviceInSimulationScenario = (
  device: Device,
  scenarioId: ScenarioId,
  project: ProjectConfig,
): boolean => {
  if (!SIMULATION_SCENARIO_IDS.includes(scenarioId)) {
    return false
  }

  if (device.categoryId === 'heatPumps' && !isHeatingRelevantForSimulation(scenarioId)) {
    return false
  }

  if (device.categoryId === 'cooling' && !isCoolingRelevantForSimulation(scenarioId)) {
    return false
  }

  if (device.scenarios.includes(scenarioId)) {
    return true
  }

  return (
    scenarioId === 'normal' && contributesToNormalHvacViaSeasonalReference(device, project)
  )
}

const getHourPhase = (hour: number, config: EnergySimulationConfig): EnergySimulationPhase => {
  const { workStartHour, workEndHour, preheatStartHour } = config

  if (hour >= workStartHour && hour < workEndHour) {
    return 'work'
  }

  if (hour >= preheatStartHour || hour < workStartHour) {
    return 'preheat'
  }

  return 'setback'
}

const formatHourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const weightedAverage = (items: Array<{ weight: number; value: number }>, fallback: number) => {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)

  if (totalWeight <= 0) {
    return fallback
  }

  return items.reduce((sum, item) => sum + item.weight * item.value, 0) / totalWeight
}

const getZoneComfortTempC = (project: ProjectConfig, zoneId: string) => {
  const zone = project.zones.find((item) => item.id === zoneId)

  if (zone?.maxTempC != null) {
    return zone.maxTempC
  }

  if (zone?.type === 'warehouse') {
    return project.maxWarehouseTempC
  }

  if (zone?.type === 'office') {
    return project.maxOfficeTempC
  }

  return project.maxOfficeTempC
}

const getZoneSetbackTempC = (project: ProjectConfig, zoneId: string) => {
  const zone = project.zones.find((item) => item.id === zoneId)

  if (zone?.minTempC != null) {
    return zone.minTempC
  }

  if (zone?.type === 'warehouse') {
    return project.minWarehouseTempC
  }

  if (zone?.type === 'office') {
    return project.minOfficeTempC
  }

  return project.minOfficeTempC
}

/** Godziny od startHour do endHour (bez end), z obsługą przekroczenia północy. */
const hoursFromStartUntil = (hour: number, startHour: number, endHour: number): number => {
  if (hour >= startHour && hour < endHour) {
    return hour - startHour
  }

  if (startHour > endHour && (hour >= startHour || hour < endHour)) {
    return hour >= startHour ? hour - startHour : hour + 24 - startHour
  }

  return -1
}

const preheatWindowLengthHours = (config: EnergySimulationConfig) => {
  const { preheatStartHour, workStartHour } = config
  return workStartHour > preheatStartHour
    ? workStartHour - preheatStartHour
    : 24 - preheatStartHour + workStartHour
}

const resolveNightSetpointC = (
  scenarioId: ScenarioId,
  config: EnergySimulationConfig,
  setbackSetpointC: number,
) => (scenarioId === 'winter' ? config.winterNightSetpointC : setbackSetpointC)

/** Temperatura zadana w cyklu dobowym ogrzewania. */
export const resolveHeatingSetpointC = (
  hour: number,
  phase: EnergySimulationPhase,
  config: EnergySimulationConfig,
  comfortSetpointC: number,
  nightSetpointC: number,
): number => {
  if (phase === 'work') {
    return comfortSetpointC
  }

  if (phase === 'setback') {
    return nightSetpointC
  }

  const elapsed = hoursFromStartUntil(hour, config.preheatStartHour, config.workStartHour)
  const windowLen = preheatWindowLengthHours(config)
  const rampStartElapsed = hoursFromStartUntil(
    config.preheatRampStartHour,
    config.preheatStartHour,
    config.workStartHour,
  )

  if (elapsed < 0 || elapsed < rampStartElapsed) {
    return nightSetpointC
  }

  const rampHours = Math.max(windowLen - rampStartElapsed, 1)
  const rampProgress = clamp01((elapsed - rampStartElapsed) / rampHours)

  return nightSetpointC + (comfortSetpointC - nightSetpointC) * rampProgress
}

/** Moc cieplna [kW] — utrzymanie strat + doład bezwładności (model RC). */
export const computeHeatingThermalDemandKw = (
  setpointC: number,
  indoorTempC: number,
  externalTempC: number,
  uaKwPerK: number,
  thermalCapacityKwhPerK: number,
): number => {
  const steadyKw = uaKwPerK * Math.max(setpointC - externalTempC, 0)
  const inertiaKw = (thermalCapacityKwhPerK * (setpointC - indoorTempC)) / 1

  return Math.max(0, steadyKw + inertiaKw)
}

/** Aktualizacja T_wewn po 1 h przy zadanej mocy grzewczej [kW]. */
export const advanceIndoorTemperatureC = (
  indoorTempC: number,
  externalTempC: number,
  thermalHeatingKw: number,
  uaKwPerK: number,
  thermalCapacityKwhPerK: number,
): number => {
  if (thermalCapacityKwhPerK <= 0) {
    return indoorTempC
  }

  const heatLossKw = uaKwPerK * (indoorTempC - externalTempC)

  return indoorTempC + (thermalHeatingKw - heatLossKw) / thermalCapacityKwhPerK
}

export const simulateScenarioEnergy = (
  project: ProjectConfig,
  devices: Device[],
  scenarioId: ScenarioId,
  scenarioName: string,
  config: EnergySimulationConfig = resolveEnergySimulationConfig(project),
): ScenarioEnergySimulation | null => {
  if (!SIMULATION_SCENARIO_IDS.includes(scenarioId)) {
    return null
  }

  const externalTempC = getSimulationExternalTempC(scenarioId, config)
  const showHeating = isHeatingRelevantForSimulation(scenarioId)
  const showCooling = isCoolingRelevantForSimulation(scenarioId)
  const activeDevices = devices.filter((device) =>
    isDeviceInSimulationScenario(device, scenarioId, project),
  )

  const heatPumpCalcs = activeDevices
    .filter((device) => device.categoryId === 'heatPumps')
    .map((device) => calculateDevice(device, project))

  const coolingCalcs = activeDevices
    .filter((device) => device.categoryId === 'cooling')
    .map((device) => calculateDevice(device, project))

  const baseCalcs = activeDevices
    .filter(
      (device) => device.categoryId !== 'heatPumps' && device.categoryId !== 'cooling',
    )
    .map((device) => calculateDevice(device, project))

  const installedHeatingThermalKw = heatPumpCalcs.reduce(
    (sum, item) => sum + (item.installedThermalPowerKw ?? 0),
    0,
  )
  const maxHeatingThermalKw = heatPumpCalcs.reduce(
    (sum, item) => sum + (item.calculatedThermalPowerKw ?? item.calculatedPowerKw),
    0,
  )
  const maxCoolingThermalKw = coolingCalcs.reduce(
    (sum, item) => sum + (item.calculatedThermalPowerKw ?? item.calculatedPowerKw),
    0,
  )

  const comfortSetpointC = weightedAverage(
    heatPumpCalcs.map((item) => ({
      weight: item.installedThermalPowerKw ?? item.calculatedThermalPowerKw ?? 0,
      value: getZoneComfortTempC(project, item.device.zoneId),
    })),
    (project.minOfficeTempC + project.maxOfficeTempC) / 2,
  )

  const setbackSetpointC = weightedAverage(
    heatPumpCalcs.map((item) => ({
      weight: item.installedThermalPowerKw ?? item.calculatedThermalPowerKw ?? 0,
      value: getZoneSetbackTempC(project, item.device.zoneId),
    })),
    (project.minOfficeTempC + project.minWarehouseTempC) / 2,
  )

  const coolingSetpointC = weightedAverage(
    coolingCalcs.map((item) => ({
      weight: item.calculatedThermalPowerKw ?? item.calculatedPowerKw,
      value: getZoneComfortTempC(project, item.device.zoneId),
    })),
    project.maxOfficeTempC,
  )

  const weightedHeatingCop =
    heatPumpCalcs.length > 0
      ? weightedAverage(
          heatPumpCalcs.map((item) => ({
            weight: item.calculatedThermalPowerKw ?? item.calculatedPowerKw,
            value: interpolateCopAtOutdoorTemp(
              externalTempC,
              resolveDeviceCopMinus20C(item.device),
              item.device.copNormal ?? defaultHeatPumpCopNormal,
            ),
          })),
          interpolateCopAtOutdoorTemp(
            externalTempC,
            defaultHeatPumpCopMinus20C,
            defaultHeatPumpCopNormal,
          ),
        )
      : defaultHeatPumpCopMinus20C

  const weightedCoolingCop =
    coolingCalcs.length > 0
      ? weightedAverage(
          coolingCalcs.map((item) => ({
            weight: item.calculatedThermalPowerKw ?? item.calculatedPowerKw,
            value: interpolateCopAtOutdoorTemp(
              externalTempC,
              resolveDeviceCopMinus20C(item.device),
              item.device.copNormal ?? defaultHeatPumpCopNormal,
            ),
          })),
          defaultHeatPumpCopNormal,
        )
      : defaultHeatPumpCopNormal

  const baseWorkPowerKw = baseCalcs.reduce((sum, item) => sum + item.calculatedPowerKw, 0)
  const workHours = Math.max(config.workEndHour - config.workStartHour, 1)
  const nightSetpointC = resolveNightSetpointC(scenarioId, config, setbackSetpointC)

  const designHeatingDeltaK = Math.max(comfortSetpointC - externalTempC, 1)
  const uaKwPerK =
    showHeating && installedHeatingThermalKw > 0
      ? installedHeatingThermalKw / designHeatingDeltaK
      : 0
  const thermalCapacityKwhPerK =
    uaKwPerK > 0 ? uaKwPerK * Math.max(config.buildingThermalTimeConstantH, 0.1) : 0
  const heatingCapacityKw = Math.max(installedHeatingThermalKw, maxHeatingThermalKw)

  let indoorTempC = nightSetpointC
  let hourly: HourlyEnergyPoint[] = []

  for (let pass = 0; pass < SIMULATION_PASS_COUNT; pass += 1) {
    const passHourly: HourlyEnergyPoint[] = []

    for (let hour = 0; hour < 24; hour += 1) {
      const phase = getHourPhase(hour, config)
      const setpointC = showHeating
        ? resolveHeatingSetpointC(hour, phase, config, comfortSetpointC, nightSetpointC)
        : comfortSetpointC

      const demandThermalKw =
        showHeating && uaKwPerK > 0
          ? computeHeatingThermalDemandKw(
              setpointC,
              indoorTempC,
              externalTempC,
              uaKwPerK,
              thermalCapacityKwhPerK,
            )
          : 0
      const thermalHeatingKw =
        showHeating && heatingCapacityKw > 0
          ? Math.min(heatingCapacityKw, demandThermalKw)
          : 0

      indoorTempC =
        showHeating && thermalCapacityKwhPerK > 0
          ? advanceIndoorTemperatureC(
              indoorTempC,
              externalTempC,
              thermalHeatingKw,
              uaKwPerK,
              thermalCapacityKwhPerK,
            )
          : indoorTempC

      const coolingDelta = Math.max(externalTempC - coolingSetpointC, 0)
      const coolingActive = showCooling && phase === 'work' && maxCoolingThermalKw > 0
      const thermalCoolingKw = coolingActive
        ? maxCoolingThermalKw * clamp01(coolingDelta / Math.max(config.coolingDesignDeltaK, 1))
        : 0

      const electricalHeatingKw =
        thermalHeatingKw > 0 ? thermalHeatingKw / Math.max(weightedHeatingCop, 0.1) : 0
      const electricalCoolingKw =
        thermalCoolingKw > 0 ? thermalCoolingKw / Math.max(weightedCoolingCop, 0.1) : 0

      const electricalBaseKw =
        phase === 'work' ? baseWorkPowerKw / workHours : baseWorkPowerKw * 0.08

      const electricalTotalKw = electricalHeatingKw + electricalCoolingKw + electricalBaseKw

      passHourly.push({
        hour,
        label: formatHourLabel(hour),
        phase,
        externalTempC,
        setpointC,
        indoorTempC,
        thermalHeatingKw,
        thermalCoolingKw,
        electricalHeatingKw,
        electricalCoolingKw,
        electricalBaseKw,
        electricalTotalKw,
        energyKwh: electricalTotalKw,
      })
    }

    if (pass === SIMULATION_PASS_COUNT - 1) {
      hourly = passHourly
    }
  }

  const peakPoint = hourly.reduce((best, point) =>
    point.electricalTotalKw > best.electricalTotalKw ? point : best,
  )

  return {
    scenarioId,
    scenarioName,
    externalTempC,
    comfortSetpointC,
    setbackSetpointC,
    nightSetpointC,
    showHeating,
    showCooling,
    maxHeatingThermalKw,
    maxCoolingThermalKw,
    hourly,
    dailyEnergyKwh: hourly.reduce((sum, point) => sum + point.energyKwh, 0),
    peakPowerKw: peakPoint.electricalTotalKw,
    peakHour: peakPoint.hour,
  }
}

export const simulateProjectEnergy = (
  project: ProjectConfig,
  devices: Device[],
  scenarioNames: Record<ScenarioId, string>,
): ScenarioEnergySimulation[] => {
  const config = resolveEnergySimulationConfig(project)

  return SIMULATION_SCENARIO_IDS.map((scenarioId) =>
    simulateScenarioEnergy(project, devices, scenarioId, scenarioNames[scenarioId], config),
  ).filter((item): item is ScenarioEnergySimulation => item != null)
}
