export type ScenarioId = 'normal' | 'winter' | 'summer' | 'backup'

export type DeviceCategoryId =
  | 'heatPumps'
  | 'cooling'
  | 'cwu'
  | 'ventilation'
  | 'kitchen'
  | 'lighting'
  | 'sockets'
  | 'serverRoom'
  | 'energyStorage'
  | 'evChargers'
  | 'technology'
  | 'other'

export type ElectricalPhase = '1P' | '3P' | 'DC'

export type EnergyStorageMode = 'neutral' | 'charging' | 'discharging' | 'peakShaving'

export type PowerInputMode = 'manual' | 'area'

export type ThermalDensityUnit = 'Wm2' | 'Wm3'

export type QuantityInputMode = 'manual' | 'people' | 'computers'

export interface Scenario {
  id: ScenarioId
  name: string
  description: string
}

export interface DeviceCategory {
  id: DeviceCategoryId
  name: string
  defaultSimultaneityFactor: number
  defaultUtilizationFactor: number
}

export interface Zone {
  id: string
  name: string
  type: 'warehouse' | 'office' | 'serverRoom' | 'technical' | 'common' | 'custom'
  areaM2: number
  /** Wysokość strefy [m] — do kubatury przy liczeniu ciepła w W/m³. */
  heightM?: number
  minTempC?: number
  maxTempC?: number
}

export interface EnergyStorageConfig {
  enabled: boolean
  capacityKwh: number
  chargePowerKw: number
  dischargePowerKw: number
  mode: EnergyStorageMode
  roundTripEfficiencyPercent: number
}

export interface ProjectConfig {
  name: string
  buildingType: string
  warehouseAreaM2: number
  warehouseHeightM: number
  officeAreaM2: number
  peopleCount: number
  computerCount: number
  minWarehouseTempC: number
  maxWarehouseTempC: number
  minOfficeTempC: number
  maxOfficeTempC: number
  reservePercent: number
  useAlternativeHeatingCooling: boolean
  /** Nazwa pliku JSON do zapisu (np. wysogotowo-mikran.json). */
  exportFileName?: string
  zones: Zone[]
  energyStorage: EnergyStorageConfig
}

export interface Device {
  id: string
  name: string
  categoryId: DeviceCategoryId
  zoneId: string
  powerInputMode: PowerInputMode
  quantityInputMode?: QuantityInputMode
  quantity: number
  unitPowerKw: number
  powerDensityWm2?: number
  /** Dla pomp ciepła: W/m² = od powierzchni, W/m³ = od kubatury. */
  thermalDensityUnit?: ThermalDensityUnit
  /** Pompa ciepła, klimatyzacja, CWU: moc termiczna / COP → moc elektryczna. */
  cop?: number
  simultaneityFactor: number
  utilizationFactor: number
  cosPhi: number
  phase: ElectricalPhase
  voltageV: number
  scenarios: ScenarioId[]
  notes?: string
}

export interface DeviceCalculation {
  device: Device
  resolvedQuantity: number
  /** Moc elektryczna zainstalowana (do bilansu). */
  installedPowerKw: number
  /** Moc elektryczna obliczeniowa (do bilansu). */
  calculatedPowerKw: number
  apparentPowerKva: number
  /** Moc cieplna lub chłodnicza — pompy ciepła, klimatyzacja, CWU (z powierzchni / osób). */
  installedThermalPowerKw?: number
  calculatedThermalPowerKw?: number
}

export interface ProjectMetrics {
  totalAreaM2: number
  warehouseVolumeM3: number
  peopleCount: number
  computerCount: number
}

export interface GroupedBalanceRow {
  id: string
  label: string
  installedPowerKw: number
  calculatedPowerKw: number
  apparentPowerKva: number
}

export interface HvacAlternativeBalance {
  enabled: boolean
  applied: boolean
  heatingCalculatedPowerKw: number
  coolingCalculatedPowerKw: number
  excludedCategoryId?: 'heatPumps' | 'cooling'
  excludedCalculatedPowerKw: number
}

export interface ScenarioBalance {
  scenario: Scenario
  devices: DeviceCalculation[]
  byCategory: GroupedBalanceRow[]
  byZone: GroupedBalanceRow[]
  installedPowerKw: number
  calculatedPowerKw: number
  apparentPowerKva: number
  reservePowerKw: number
  totalWithReserveKw: number
  energyStorageAdjustmentKw: number
  netPowerKw: number
  hvacAlternative: HvacAlternativeBalance
}

export interface ProjectBalance {
  project: ProjectConfig
  metrics: ProjectMetrics
  scenarios: ScenarioBalance[]
}
