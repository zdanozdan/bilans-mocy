import { getDefaultHeatPumpThermalDensity, getDefaultThermalDensityUnit } from './defaults'
import { resolveDeviceZone } from './zones'
import type { Device, ProjectConfig, ThermalDensityUnit } from './types'

const formatDensityLabel = (unit: ThermalDensityUnit) => (unit === 'Wm3' ? 'W/m³' : 'W/m²')

const uniqueDensityValues = (
  devices: Device[],
  unit: ThermalDensityUnit,
): number[] => [
  ...new Set(
    devices
      .filter((device) => (device.thermalDensityUnit ?? 'Wm2') === unit)
      .map((device) => device.powerDensityWm2 ?? 0)
      .filter((value) => value > 0),
  ),
]

const formatDensityList = (values: number[], unit: ThermalDensityUnit) =>
  values.map((value) => `${value} ${formatDensityLabel(unit)}`).join(', ')

/** W/m³ × wysokość [m] = równoważne W/m² (ta sama moc cieplna przy V = A × h). */
export const wm3ToEquivalentWm2 = (densityWm3: number, heightM: number) =>
  densityWm3 * Math.max(heightM, 0)

const formatWm3WithEquivalentWm2 = (values: number[], heightM: number) =>
  values
    .map((wm3) => {
      const wm2 = wm3ToEquivalentWm2(wm3, heightM)
      return `${wm3} W/m³ (= ${wm2.toFixed(1)} W/m² przy h = ${heightM.toFixed(1)} m)`
    })
    .join('; ')

const getWarehouseHeightM = (project: ProjectConfig): number => {
  const warehouseZone = project.zones.find((zone) => zone.type === 'warehouse')
  return warehouseZone?.heightM ?? project.warehouseHeightM
}

const getHeatDevicesForZoneType = (
  project: ProjectConfig,
  devices: Device[],
  zoneType: 'office' | 'warehouse',
) =>
  devices.filter((device) => {
    if (device.categoryId !== 'heatPumps' || device.powerInputMode !== 'area') {
      return false
    }

    const zone = resolveDeviceZone(project, device.zoneId)
    return zone?.type === zoneType
  })

/** Wiersze do tabeli PDF: przyjęte zapotrzebowanie na ciepło (gęstość mocy termicznej). */
export const buildHeatDemandRows = (
  project: ProjectConfig,
  devices: Device[],
): Array<[string, string]> => {
  const rows: Array<[string, string]> = []

  const officeHeat = getHeatDevicesForZoneType(project, devices, 'office')
  const officeWm2 = uniqueDensityValues(officeHeat, 'Wm2')

  if (officeWm2.length > 0) {
    rows.push(['Biuro — ogrzewanie', formatDensityList(officeWm2, 'Wm2')])
  } else {
    const officeZone = project.zones.find((zone) => zone.type === 'office')
    if (officeZone) {
      const defaultWm2 = getDefaultHeatPumpThermalDensity('office', 'Wm2')
      rows.push(['Biuro — ogrzewanie (domyślnie)', `${defaultWm2} W/m²`])
    }
  }

  const warehouseHeat = getHeatDevicesForZoneType(project, devices, 'warehouse')
  const warehouseWm2 = uniqueDensityValues(warehouseHeat, 'Wm2')
  const warehouseWm3 = uniqueDensityValues(warehouseHeat, 'Wm3')
  const warehouseHeightM = getWarehouseHeightM(project)

  if (warehouseWm3.length > 0) {
    rows.push([
      'Magazyn — ogrzewanie',
      formatWm3WithEquivalentWm2(warehouseWm3, warehouseHeightM),
    ])
  }

  if (warehouseWm2.length > 0) {
    const directWm2 = formatDensityList(warehouseWm2, 'Wm2')
    if (warehouseWm3.length > 0) {
      rows.push(['Magazyn — ogrzewanie (bezpośrednio z m²)', directWm2])
    } else {
      rows.push(['Magazyn — ogrzewanie', directWm2])
    }
  }

  if (warehouseWm2.length === 0 && warehouseWm3.length === 0) {
    const warehouseZone = project.zones.find((zone) => zone.type === 'warehouse')
    if (warehouseZone) {
      const unit = getDefaultThermalDensityUnit('warehouse')
      const defaultDensity = getDefaultHeatPumpThermalDensity('warehouse', unit)

      if (unit === 'Wm3') {
        rows.push([
          'Magazyn — ogrzewanie (domyślnie)',
          formatWm3WithEquivalentWm2([defaultDensity], warehouseHeightM),
        ])
      } else {
        rows.push([
          'Magazyn — ogrzewanie (domyślnie)',
          `${defaultDensity} ${formatDensityLabel(unit)}`,
        ])
      }
    }
  }

  return rows
}
