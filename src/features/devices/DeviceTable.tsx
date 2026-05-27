import { calculateDevice } from '../../domain/calculations'
import { deviceCategories, scenarios } from '../../domain/defaults'
import type { Device, DeviceCategoryId, ElectricalPhase, ProjectConfig, ScenarioId } from '../../domain/types'

interface DeviceTableProps {
  devices: Device[]
  project: ProjectConfig
  onChange: (devices: Device[]) => void
}

const phaseOptions: ElectricalPhase[] = ['1P', '3P', 'DC']

const createDevice = (project: ProjectConfig): Device => {
  const category = deviceCategories[0]

  return {
    id: `device-${crypto.randomUUID()}`,
    name: 'Nowe urządzenie',
    categoryId: category.id,
    zoneId: project.zones[0]?.id ?? 'warehouse',
    powerInputMode: 'manual',
    quantityInputMode: 'manual',
    quantity: 1,
    unitPowerKw: 1,
    powerDensityWm2: 10,
    simultaneityFactor: category.defaultSimultaneityFactor,
    utilizationFactor: category.defaultUtilizationFactor,
    cosPhi: 0.9,
    phase: '3P',
    voltageV: 400,
    scenarios: ['normal'],
  }
}

export function DeviceTable({ devices, project, onChange }: DeviceTableProps) {
  const updateDevice = (deviceId: string, patch: Partial<Device>) => {
    onChange(devices.map((device) => (device.id === deviceId ? { ...device, ...patch } : device)))
  }

  const removeDevice = (deviceId: string) => {
    onChange(devices.filter((device) => device.id !== deviceId))
  }

  const addDevice = () => {
    onChange([...devices, createDevice(project)])
  }

  const toggleScenario = (device: Device, scenarioId: ScenarioId) => {
    const scenariosForDevice = device.scenarios.includes(scenarioId)
      ? device.scenarios.filter((id) => id !== scenarioId)
      : [...device.scenarios, scenarioId]

    updateDevice(device.id, { scenarios: scenariosForDevice })
  }

  const handleCategoryChange = (device: Device, categoryId: DeviceCategoryId) => {
    const category = deviceCategories.find((item) => item.id === categoryId)

    updateDevice(device.id, {
      categoryId,
      simultaneityFactor: category?.defaultSimultaneityFactor ?? device.simultaneityFactor,
      utilizationFactor: category?.defaultUtilizationFactor ?? device.utilizationFactor,
    })
  }

  return (
    <section className="panel" aria-labelledby="devices-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Odbiorniki</p>
          <h2 id="devices-heading">Lista urządzeń i współczynniki</h2>
        </div>
        <button type="button" onClick={addDevice}>
          Dodaj urządzenie
        </button>
      </div>

      <div className="device-list">
        {devices.map((device) => {
          const calculation = calculateDevice(device, project)
          const selectedZone = project.zones.find((zone) => zone.id === device.zoneId)

          return (
            <article className="device-card" key={device.id}>
              <div className="device-card-header">
                <label className="device-name-field">
                  Nazwa
                  <input
                    value={device.name}
                    onChange={(event) => updateDevice(device.id, { name: event.target.value })}
                  />
                </label>
                <div className="device-totals" aria-label="Wyniki urządzenia">
                  <span>
                    Pinst <strong>{calculation.installedPowerKw.toFixed(2)} kW</strong>
                  </span>
                  <span>
                    Pobl <strong>{calculation.calculatedPowerKw.toFixed(2)} kW</strong>
                  </span>
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
                    onChange={(event) => updateDevice(device.id, { zoneId: event.target.value })}
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
                    value={device.powerInputMode}
                    onChange={(event) =>
                      updateDevice(device.id, {
                        powerInputMode: event.target.value as Device['powerInputMode'],
                      })
                    }
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
                  {device.powerInputMode === 'area' ? 'Mnożnik / ilość' : 'Ilość'}
                  <input
                    disabled={(device.quantityInputMode ?? 'manual') !== 'manual'}
                    min="0"
                    type="number"
                    value={device.quantity}
                    onChange={(event) =>
                      updateDevice(device.id, { quantity: event.target.valueAsNumber })
                    }
                  />
                </label>
                <div className="readonly-field">
                  <span>Ilość do obliczeń</span>
                  <strong>{calculation.resolvedQuantity.toFixed(0)}</strong>
                </div>
                <label>
                  Moc jedn. [kW]
                  <input
                    disabled={device.powerInputMode === 'area'}
                    min="0"
                    step="0.1"
                    type="number"
                    value={device.unitPowerKw}
                    onChange={(event) =>
                      updateDevice(device.id, { unitPowerKw: event.target.valueAsNumber })
                    }
                  />
                </label>
                <label>
                  Moc powierzchniowa [W/m2]
                  <input
                    disabled={device.powerInputMode === 'manual'}
                    min="0"
                    step="1"
                    type="number"
                    value={device.powerDensityWm2 ?? 0}
                    onChange={(event) =>
                      updateDevice(device.id, { powerDensityWm2: event.target.valueAsNumber })
                    }
                  />
                </label>
                <div className="readonly-field">
                  <span>Pow. strefy</span>
                  <strong>{(selectedZone?.areaM2 ?? 0).toFixed(0)} m2</strong>
                </div>
                <label>
                  Wsp. jednoczesności
                  <input
                    max="1"
                    min="0"
                    step="0.05"
                    type="number"
                    value={device.simultaneityFactor}
                    onChange={(event) =>
                      updateDevice(device.id, { simultaneityFactor: event.target.valueAsNumber })
                    }
                  />
                </label>
                <label>
                  Wsp. wykorzystania
                  <input
                    max="1"
                    min="0"
                    step="0.05"
                    type="number"
                    value={device.utilizationFactor}
                    onChange={(event) =>
                      updateDevice(device.id, { utilizationFactor: event.target.valueAsNumber })
                    }
                  />
                </label>
                <label>
                  cos phi
                  <input
                    max="1"
                    min="0.01"
                    step="0.01"
                    type="number"
                    value={device.cosPhi}
                    onChange={(event) => updateDevice(device.id, { cosPhi: event.target.valueAsNumber })}
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
                  <input
                    min="0"
                    type="number"
                    value={device.voltageV}
                    onChange={(event) => updateDevice(device.id, { voltageV: event.target.valueAsNumber })}
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
    </section>
  )
}
