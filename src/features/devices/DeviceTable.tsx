import { useEffect, useState } from 'react'
import { ContextHelp } from '../../components/ContextHelp'
import { NumericInput } from '../../components/NumericInput'
import {
  calculateDevice,
  getHeatPumpThermalBase,
  usesCopThermalConversion,
} from '../../domain/calculations'
import {
  defaultHeatPumpCop,
  deviceCategories,
  defaultCwuThermalDensityWPerPerson,
  getDefaultHeatPumpThermalDensity,
  getDefaultPowerDensityWm2,
  getDefaultThermalDensityUnit,
  scenarios,
} from '../../domain/defaults'
import type {
  Device,
  DeviceCategoryId,
  ElectricalPhase,
  ProjectConfig,
  ScenarioId,
  ThermalDensityUnit,
} from '../../domain/types'
import { moveItemById } from '../../utils/reorderList'

interface DeviceTableProps {
  devices: Device[]
  project: ProjectConfig
  onChange: (devices: Device[]) => void
}

const phaseOptions: ElectricalPhase[] = ['1P', '3P', 'DC']

const areaBasedCategories = new Set<DeviceCategoryId>([
  'heatPumps',
  'cooling',
  'cwu',
  'lighting',
])

const prefersAreaPowerInput = (categoryId: DeviceCategoryId) => areaBasedCategories.has(categoryId)

const helpSimultaneityFactor =
  'Ile odbiorników / obwodów działa naraz w szczycie. Np. zainstalowano wiele urządzeń, ale w jednym momencie nie wszystkie pracują na pełnej mocy — stąd współczynnik poniżej 1.'

const helpUtilizationFactor =
  'Jak mocno i jak długo urządzenie realnie pracuje względem mocy znamionowej. Nawet gdy jest włączone, rzadko cały czas na 100% mocy (obciążenie częściowe, przerwy, sezonowość).'

const helpPinst =
  'Moc elektryczna zainstalowana (znamionowa). Przy pompach, klimatyzacji i CWU z powierzchni: moc termiczna ÷ COP.'

const helpPobl =
  'Moc elektryczna obliczeniowa do bilansu: Pinst × wsp. jednoczesności × wsp. wykorzystania.'

const helpThermalInst =
  'Moc cieplna lub chłodnicza zainstalowana (pełna, bez współczynników): np. powierzchnia × W/m² lub liczba osób × W/os.'

const helpThermalObl =
  'Moc termiczna obliczeniowa: wartość inst × wsp. jednoczesności × wsp. wykorzystania. Stąd liczone Pinst (el.) ÷ COP = Pobl (el.).'

const FieldLabel = ({ label, help }: { label: string; help: string }) => (
  <span className="field-label-with-help">
    {label}
    <ContextHelp text={help} />
  </span>
)

const DeviceTotal = ({
  label,
  help,
  value,
}: {
  label: string
  help: string
  value: string
}) => (
  <span className="device-total-item">
    <span className="device-total-label">
      {label}
      <ContextHelp text={help} />
    </span>
    <strong>{value}</strong>
  </span>
)

const getZoneType = (project: ProjectConfig, zoneId: string) =>
  project.zones.find((zone) => zone.id === zoneId)?.type ?? 'custom'

const createDevice = (project: ProjectConfig): Device => {
  const category = deviceCategories[0]
  const zoneId = project.zones[0]?.id ?? 'warehouse'
  const zoneType = getZoneType(project, zoneId)
  const thermalUnit = getDefaultThermalDensityUnit(zoneType)

  return {
    id: `device-${crypto.randomUUID()}`,
    name: 'Nowe urządzenie',
    categoryId: category.id,
    zoneId,
    powerInputMode: prefersAreaPowerInput(category.id) ? 'area' : 'manual',
    quantityInputMode: 'manual',
    quantity: 1,
    unitPowerKw: 1,
    powerDensityWm2:
      category.id === 'heatPumps'
        ? getDefaultHeatPumpThermalDensity(zoneType, thermalUnit)
        : getDefaultPowerDensityWm2(zoneType, category.id),
    thermalDensityUnit: category.id === 'heatPumps' ? thermalUnit : undefined,
    cop: usesCopThermalConversion(category.id) ? defaultHeatPumpCop : undefined,
    simultaneityFactor: category.defaultSimultaneityFactor,
    utilizationFactor: category.defaultUtilizationFactor,
    cosPhi: 0.9,
    phase: '3P',
    voltageV: 400,
    scenarios: ['normal'],
  }
}

export function DeviceTable({ devices, project, onChange }: DeviceTableProps) {
  const [lastAddedDeviceId, setLastAddedDeviceId] = useState<string | null>(null)

  const updateDevice = (deviceId: string, patch: Partial<Device>) => {
    onChange(devices.map((device) => (device.id === deviceId ? { ...device, ...patch } : device)))
  }

  const removeDevice = (deviceId: string) => {
    onChange(devices.filter((device) => device.id !== deviceId))
  }

  const addDeviceAt = (position: 'start' | 'end') => {
    const newDevice = createDevice(project)
    setLastAddedDeviceId(newDevice.id)
    onChange(position === 'start' ? [newDevice, ...devices] : [...devices, newDevice])
  }

  useEffect(() => {
    if (!lastAddedDeviceId) {
      return
    }

    const element = document.querySelector(`[data-device-id="${lastAddedDeviceId}"]`)
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const timeout = window.setTimeout(() => setLastAddedDeviceId(null), 2500)
    return () => window.clearTimeout(timeout)
  }, [lastAddedDeviceId])

  const toggleScenario = (device: Device, scenarioId: ScenarioId) => {
    const scenariosForDevice = device.scenarios.includes(scenarioId)
      ? device.scenarios.filter((id) => id !== scenarioId)
      : [...device.scenarios, scenarioId]

    updateDevice(device.id, { scenarios: scenariosForDevice })
  }

  const applyAreaDefaults = (
    zoneId: string,
    categoryId: DeviceCategoryId,
    thermalUnit?: ThermalDensityUnit,
  ) => {
    const zoneType = getZoneType(project, zoneId)

    if (categoryId === 'heatPumps') {
      const unit = thermalUnit ?? getDefaultThermalDensityUnit(zoneType)

      return {
        thermalDensityUnit: unit,
        powerDensityWm2: getDefaultHeatPumpThermalDensity(zoneType, unit),
      }
    }

    if (categoryId === 'cwu') {
      return {
        thermalDensityUnit: 'Wm2' as const,
        powerDensityWm2:
          getDefaultPowerDensityWm2(zoneType, 'cwu') || defaultCwuThermalDensityWPerPerson,
        quantityInputMode: 'people' as const,
      }
    }

    return {
      powerDensityWm2: getDefaultPowerDensityWm2(zoneType, categoryId),
    }
  }

  const moveDevice = (deviceId: string, direction: 'up' | 'down') => {
    onChange(moveItemById(devices, deviceId, direction))
  }

  const handleCategoryChange = (device: Device, categoryId: DeviceCategoryId) => {
    const category = deviceCategories.find((item) => item.id === categoryId)

    const useAreaPower = prefersAreaPowerInput(categoryId)

    updateDevice(device.id, {
      categoryId,
      powerInputMode: useAreaPower ? 'area' : device.powerInputMode,
      quantityInputMode:
        categoryId === 'cwu' ? ('people' as const) : device.quantityInputMode,
      cop: usesCopThermalConversion(categoryId) ? (device.cop ?? defaultHeatPumpCop) : undefined,
      simultaneityFactor: category?.defaultSimultaneityFactor ?? device.simultaneityFactor,
      utilizationFactor: category?.defaultUtilizationFactor ?? device.utilizationFactor,
      ...(useAreaPower ? applyAreaDefaults(device.zoneId, categoryId) : {}),
    })
  }

  return (
    <section className="panel" aria-labelledby="devices-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Odbiorniki</p>
          <h2 id="devices-heading">Lista urządzeń i współczynniki</h2>
        </div>
        <button type="button" onClick={() => addDeviceAt('start')}>
          Dodaj urządzenie
        </button>
      </div>

      <div className="device-list">
        {devices.map((device, deviceIndex) => {
          const calculation = calculateDevice(device, project)
          const selectedZone = project.zones.find((zone) => zone.id === device.zoneId)
          const isNew = device.id === lastAddedDeviceId
          const powerInputMode = device.powerInputMode ?? 'manual'
          const usesAreaPower = powerInputMode === 'area'
          const usesCop = usesCopThermalConversion(device.categoryId)
          const isHeatPump = device.categoryId === 'heatPumps'
          const isCooling = device.categoryId === 'cooling'
          const isCwu = device.categoryId === 'cwu'
          const usesPeopleThermal =
            isCwu && usesAreaPower && (device.quantityInputMode ?? 'manual') === 'people'
          const thermalPowerLabel = isCwu ? 'PcWU' : isHeatPump ? 'Pciel' : 'Pchł'
          const showsThermalPower =
            usesCop && usesAreaPower && calculation.installedThermalPowerKw !== undefined
          const thermalBase = usesCop ? getHeatPumpThermalBase(project, device) : null
          const thermalUsesVolume = thermalBase?.unit === 'Wm3'
          const thermalVolumeMissing =
            thermalUsesVolume && (thermalBase?.valueM2OrM3 ?? 0) <= 0

          const canMoveUp = deviceIndex > 0
          const canMoveDown = deviceIndex < devices.length - 1

          return (
            <article
              className={`device-card ${isNew ? 'is-new' : ''}`}
              data-device-id={device.id}
              key={device.id}
            >
              <div className="device-card-header">
                <div className="device-order-buttons" aria-label={`Kolejność: ${device.name}`}>
                  <button
                    aria-label={`Przesuń wyżej: ${device.name}`}
                    className="device-order-button"
                    disabled={!canMoveUp}
                    title="Przesuń o jedną pozycję w górę"
                    type="button"
                    onClick={() => moveDevice(device.id, 'up')}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Przesuń niżej: ${device.name}`}
                    className="device-order-button"
                    disabled={!canMoveDown}
                    title="Przesuń o jedną pozycję w dół"
                    type="button"
                    onClick={() => moveDevice(device.id, 'down')}
                  >
                    ↓
                  </button>
                </div>
                <label className="device-name-field">
                  Nazwa
                  <input
                    value={device.name}
                    onChange={(event) => updateDevice(device.id, { name: event.target.value })}
                  />
                </label>
                <div className="device-totals" aria-label="Wyniki urządzenia">
                  {showsThermalPower ? (
                    <>
                      <DeviceTotal
                        help={helpThermalInst}
                        label={`${thermalPowerLabel} inst`}
                        value={`${calculation.installedThermalPowerKw!.toFixed(2)} kW`}
                      />
                      <DeviceTotal
                        help={helpThermalObl}
                        label={`${thermalPowerLabel} obl`}
                        value={`${calculation.calculatedThermalPowerKw!.toFixed(2)} kW`}
                      />
                    </>
                  ) : null}
                  <DeviceTotal
                    help={helpPinst}
                    label="Pinst (el.)"
                    value={`${calculation.installedPowerKw.toFixed(2)} kW`}
                  />
                  <DeviceTotal
                    help={helpPobl}
                    label="Pobl (el.)"
                    value={`${calculation.calculatedPowerKw.toFixed(2)} kW`}
                  />
                  <span>
                    Ilość <strong>{calculation.resolvedQuantity.toFixed(0)}</strong>
                  </span>
                </div>
                <button className="ghost danger" type="button" onClick={() => removeDevice(device.id)}>
                  Usuń
                </button>
              </div>

              <div className="device-fields">
                <label className="wide-field">
                  Kategoria
                  <select
                    value={device.categoryId}
                    onChange={(event) =>
                      handleCategoryChange(device, event.target.value as DeviceCategoryId)
                    }
                  >
                    {deviceCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Strefa
                  <select
                    value={device.zoneId}
                    onChange={(event) => {
                      const zoneId = event.target.value
                      updateDevice(device.id, {
                        zoneId,
                        ...((device.powerInputMode ?? 'manual') === 'area'
                          ? applyAreaDefaults(zoneId, device.categoryId)
                          : {}),
                      })
                    }}
                  >
                    {project.zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sposób mocy
                  <select
                    value={powerInputMode}
                    onChange={(event) => {
                      const nextPowerInputMode = event.target.value as Device['powerInputMode']
                      updateDevice(device.id, {
                        powerInputMode: nextPowerInputMode,
                        ...(nextPowerInputMode === 'area'
                          ? applyAreaDefaults(device.zoneId, device.categoryId)
                          : {}),
                      })
                    }}
                  >
                    <option value="manual">Ręcznie: ilość x kW</option>
                    <option value="area">Z powierzchni: m2 x W/m2</option>
                  </select>
                </label>
                <label>
                  Źródło ilości
                  <select
                    value={device.quantityInputMode ?? 'manual'}
                    onChange={(event) =>
                      updateDevice(device.id, {
                        quantityInputMode: event.target.value as Device['quantityInputMode'],
                      })
                    }
                  >
                    <option value="manual">Ręcznie</option>
                    <option value="people">Liczba osób</option>
                    <option value="computers">Liczba komputerów</option>
                  </select>
                </label>
                <label>
                  {usesAreaPower ? 'Mnożnik / ilość' : 'Ilość'}
                  <NumericInput
                    disabled={(device.quantityInputMode ?? 'manual') !== 'manual'}
                    value={device.quantity}
                    onValueChange={(quantity) => updateDevice(device.id, { quantity })}
                  />
                </label>
                <div className="readonly-field">
                  <span>Ilość do obliczeń</span>
                  <strong>{calculation.resolvedQuantity.toFixed(0)}</strong>
                </div>
                <label>
                  Moc jedn. [kW]
                  <NumericInput
                    disabled={usesAreaPower}
                    step={0.1}
                    value={device.unitPowerKw}
                    onValueChange={(unitPowerKw) => updateDevice(device.id, { unitPowerKw })}
                  />
                </label>
                {usesCop && usesAreaPower && !usesPeopleThermal ? (
                  <label>
                    {isHeatPump
                      ? 'Jednostka mocy cieplnej'
                      : isCooling
                        ? 'Jednostka mocy chłodniczej'
                        : 'Jednostka mocy CWU'}
                    <select
                      value={device.thermalDensityUnit ?? thermalBase?.unit ?? 'Wm2'}
                      onChange={(event) => {
                        const thermalDensityUnit = event.target.value as ThermalDensityUnit
                        updateDevice(device.id, {
                          thermalDensityUnit,
                          ...applyAreaDefaults(device.zoneId, device.categoryId, thermalDensityUnit),
                        })
                      }}
                    >
                      <option value="Wm2">Powierzchnia — W/m²</option>
                      <option value="Wm3">Kubatura — W/m³</option>
                    </select>
                  </label>
                ) : null}
                {usesAreaPower ? (
                  <label>
                    {usesCop
                      ? usesPeopleThermal
                        ? 'Moc cieplna CWU [W/os.]'
                        : thermalUsesVolume
                          ? isHeatPump
                            ? 'Moc cieplna [W/m3]'
                            : isCooling
                              ? 'Moc chłodnicza [W/m3]'
                              : 'Moc cieplna CWU [W/m3]'
                          : isHeatPump
                            ? 'Moc cieplna [W/m2]'
                            : isCooling
                              ? 'Moc chłodnicza [W/m2]'
                              : 'Moc cieplna CWU [W/m2]'
                      : 'Moc powierzchniowa [W/m2]'}
                    <NumericInput
                      value={device.powerDensityWm2 ?? 0}
                      onValueChange={(powerDensityWm2) =>
                        updateDevice(device.id, { powerDensityWm2 })
                      }
                    />
                  </label>
                ) : (
                  <p className="field-hint">
                    Ustaw sposób mocy na „Z powierzchni”, aby edytować gęstość mocy
                    {usesCop
                      ? usesPeopleThermal
                        ? ' (liczba osób × W/os., potem / COP).'
                        : thermalUsesVolume
                          ? ' (kubatura × W/m³, potem / COP).'
                          : isHeatPump
                            ? ' (moc cieplna z m², potem / COP).'
                            : isCooling
                              ? ' (moc chłodnicza z m², potem / COP).'
                              : ' (moc cieplna z m², potem / COP).'
                      : '.'}
                  </p>
                )}
                {usesCop ? (
                  <label>
                    COP [-]
                    <NumericInput
                      min={0.1}
                      step={0.1}
                      value={device.cop ?? defaultHeatPumpCop}
                      onValueChange={(cop) => updateDevice(device.id, { cop })}
                    />
                  </label>
                ) : null}
                {usesCop && usesAreaPower ? (
                  <div className="readonly-field">
                    <span>Moc el. = {isCooling ? 'chłód' : 'ciepło'} / COP</span>
                    <strong>
                      {calculation.installedThermalPowerKw!.toFixed(1)} /{' '}
                      {(device.cop ?? defaultHeatPumpCop).toFixed(1)} ={' '}
                      {calculation.installedPowerKw.toFixed(2)} kW
                    </strong>
                  </div>
                ) : null}
                {thermalVolumeMissing ? (
                  <p className="field-hint field-hint-warning">
                    Kubatura wynosi 0 — ustaw wysokość strefy (tabela stref) lub parametry
                    magazynu.
                  </p>
                ) : null}
                {usesCop && usesAreaPower && usesPeopleThermal ? (
                  <div className="readonly-field">
                    <span>Liczba osób (projekt)</span>
                    <strong>{calculation.resolvedQuantity.toFixed(0)} os.</strong>
                  </div>
                ) : usesCop && usesAreaPower && thermalBase ? (
                  <div className="readonly-field">
                    <span>{thermalUsesVolume ? 'Kubatura strefy' : 'Pow. strefy'}</span>
                    <strong>
                      {thermalBase.valueM2OrM3.toFixed(0)} {thermalUsesVolume ? 'm3' : 'm2'}
                    </strong>
                  </div>
                ) : (
                  <div className="readonly-field">
                    <span>Pow. strefy</span>
                    <strong>{(selectedZone?.areaM2 ?? 0).toFixed(0)} m2</strong>
                  </div>
                )}
                <label>
                  <FieldLabel help={helpSimultaneityFactor} label="Wsp. jednoczesności" />
                  <NumericInput
                    max={1}
                    step={0.05}
                    value={device.simultaneityFactor}
                    onValueChange={(simultaneityFactor) =>
                      updateDevice(device.id, { simultaneityFactor })
                    }
                  />
                </label>
                <label>
                  <FieldLabel help={helpUtilizationFactor} label="Wsp. wykorzystania" />
                  <NumericInput
                    max={1}
                    step={0.05}
                    value={device.utilizationFactor}
                    onValueChange={(utilizationFactor) =>
                      updateDevice(device.id, { utilizationFactor })
                    }
                  />
                </label>
                <label>
                  cos phi
                  <NumericInput
                    max={1}
                    min={0.01}
                    step={0.01}
                    value={device.cosPhi}
                    onValueChange={(cosPhi) => updateDevice(device.id, { cosPhi })}
                  />
                </label>
                <label>
                  Fazy
                  <select
                    value={device.phase}
                    onChange={(event) =>
                      updateDevice(device.id, { phase: event.target.value as ElectricalPhase })
                    }
                  >
                    {phaseOptions.map((phase) => (
                      <option key={phase} value={phase}>
                        {phase}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Napięcie [V]
                  <NumericInput
                    value={device.voltageV}
                    onValueChange={(voltageV) => updateDevice(device.id, { voltageV })}
                  />
                </label>
              </div>

              <fieldset className="scenario-fieldset">
                <legend>Scenariusze pracy</legend>
                <div className="scenario-list">
                  {scenarios.map((scenario) => (
                    <label key={scenario.id} className="mini-check">
                      <input
                        checked={device.scenarios.includes(scenario.id)}
                        type="checkbox"
                        onChange={() => toggleScenario(device, scenario.id)}
                      />
                      {scenario.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </article>
          )
        })}
      </div>

      <div className="device-list-footer">
        <button type="button" onClick={() => addDeviceAt('end')}>
          Dodaj urządzenie
        </button>
      </div>
    </section>
  )
}
