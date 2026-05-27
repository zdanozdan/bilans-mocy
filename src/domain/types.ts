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
  | 'mills'
  | 'printer3d'
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
  /**
   * W scenariuszu „Praca normalna”, gdy aktywne jest tylko ogrzewanie lub tylko chłodzenie:
   * jaki udział szczytu sezonowego wliczyć do bilansu (np. 0,65 = 65%).
   */
  normalHvacDeratingFactor?: number
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
  /**
   * COP przy -20°C — do bilansu mocy i przyłącza (wyższa moc el. przy niskim COP).
   * @deprecated Stare pliki JSON — używaj copMinus20C; przy wczytywaniu `cop` jest mapowane.
   */
  cop?: number
  /** COP przy -20°C — używany w obliczeniach Pinst/Pobl. */
  copMinus20C?: number
  /** COP w warunkach normalnych — informacyjnie (np. katalog producenta). */
  copNormal?: number
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

export type HvacAlternativeMode = 'seasonalPeak' | 'normalAverage' | 'normalDerated'

export interface HvacAlternativeBalance {
  enabled: boolean
  applied: boolean
  /** Jak ogrzewanie i klimatyzacja wchodzą do sumy scenariusza. */
  mode?: HvacAlternativeMode
  heatingCalculatedPowerKw: number
  coolingCalculatedPowerKw: number
  /** Moc HVAC faktycznie wliczona do Pobl scenariusza (po korekcie). */
  hvacContributionKw?: number
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
