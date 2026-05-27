import { useEffect, useState } from 'react'
import type { ProjectConfig, Zone } from '../../domain/types'

interface ProjectFormProps {
  project: ProjectConfig
  onChange: (project: ProjectConfig) => void
}

const zoneTypes: Zone['type'][] = [
  'warehouse',
  'office',
  'serverRoom',
  'technical',
  'common',
  'custom',
]

const zoneTypeLabels: Record<Zone['type'], string> = {
  warehouse: 'Magazyn',
  office: 'Biuro',
  serverRoom: 'Serwerownia',
  technical: 'Techniczne',
  common: 'Wspólne',
  custom: 'Własne',
}

const createZone = (): Zone => ({
  id: `zone-${crypto.randomUUID()}`,
  name: 'Nowa strefa',
  type: 'custom',
  areaM2: 0,
  minTempC: 10,
  maxTempC: 28,
})

export function ProjectForm({ project, onChange }: ProjectFormProps) {
  const [lastAddedZoneId, setLastAddedZoneId] = useState<string | null>(null)

  const updateProject = <K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) => {
    onChange({ ...project, [key]: value })
  }

  const updateArea = (key: 'warehouseAreaM2' | 'officeAreaM2', areaM2: number) => {
    const zoneType = key === 'warehouseAreaM2' ? 'warehouse' : 'office'

    onChange({
      ...project,
      [key]: areaM2,
      zones: project.zones.map((zone) =>
        zone.type === zoneType ? { ...zone, areaM2 } : zone,
      ),
    })
  }

  const updateTemperature = (
    key:
      | 'minWarehouseTempC'
      | 'maxWarehouseTempC'
      | 'minOfficeTempC'
      | 'maxOfficeTempC',
    temperatureC: number,
  ) => {
    const isWarehouse = key.includes('Warehouse')
    const isMin = key.startsWith('min')
    const zoneType = isWarehouse ? 'warehouse' : 'office'

    onChange({
      ...project,
      [key]: temperatureC,
      zones: project.zones.map((zone) =>
        zone.type === zoneType
          ? { ...zone, [isMin ? 'minTempC' : 'maxTempC']: temperatureC }
          : zone,
      ),
    })
  }

  const updateZone = (zoneId: string, patch: Partial<Zone>) => {
    updateProject(
      'zones',
      project.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)),
    )
  }

  const removeZone = (zoneId: string) => {
    if (project.zones.length <= 1) {
      return
    }

    updateProject(
      'zones',
      project.zones.filter((zone) => zone.id !== zoneId),
    )
  }

  const addZone = () => {
    const newZone = createZone()
    setLastAddedZoneId(newZone.id)
    updateProject('zones', [newZone, ...project.zones])
  }

  useEffect(() => {
    if (!lastAddedZoneId) {
      return
    }

    const element = document.querySelector(`[data-zone-id="${lastAddedZoneId}"]`)
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }

    const timeout = window.setTimeout(() => setLastAddedZoneId(null), 2500)
    return () => window.clearTimeout(timeout)
  }, [lastAddedZoneId])

  return (
    <section className="panel" aria-labelledby="project-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Konfiguracja</p>
          <h2 id="project-heading">Dane budynku i założenia</h2>
        </div>
        <p className="muted">
          Parametry są zapisywane lokalnie w stanie aplikacji i trafiają do zapisu JSON oraz raportu.
        </p>
      </div>

      <div className="form-grid">
        <label>
          Nazwa projektu
          <input
            value={project.name}
            onChange={(event) => updateProject('name', event.target.value)}
          />
        </label>
        <label>
          Typ budynku
          <input
            value={project.buildingType}
            onChange={(event) => updateProject('buildingType', event.target.value)}
          />
        </label>
        <label>
          Pow. magazynu [m2]
          <input
            min="0"
            type="number"
            value={project.warehouseAreaM2}
            onChange={(event) => updateArea('warehouseAreaM2', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Wysokość hali magazynowej [m]
          <input
            min="0"
            step="0.1"
            type="number"
            value={project.warehouseHeightM}
            onChange={(event) => {
              const warehouseHeightM = event.target.valueAsNumber
              onChange({
                ...project,
                warehouseHeightM,
                zones: project.zones.map((zone) =>
                  zone.type === 'warehouse' ? { ...zone, heightM: warehouseHeightM } : zone,
                ),
              })
            }}
          />
        </label>
        <div className="readonly-field">
          <span>Kubatura magazynu</span>
          <strong>{(project.warehouseAreaM2 * project.warehouseHeightM).toFixed(0)} m3</strong>
        </div>
        <label>
          Pow. biura [m2]
          <input
            min="0"
            type="number"
            value={project.officeAreaM2}
            onChange={(event) => updateArea('officeAreaM2', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Liczba osób pracujących
          <input
            min="0"
            type="number"
            value={project.peopleCount}
            onChange={(event) => updateProject('peopleCount', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Liczba komputerów
          <input
            min="0"
            type="number"
            value={project.computerCount}
            onChange={(event) => updateProject('computerCount', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Temp. min magazynu [C]
          <input
            type="number"
            value={project.minWarehouseTempC}
            onChange={(event) => updateTemperature('minWarehouseTempC', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Temp. max magazynu [C]
          <input
            type="number"
            value={project.maxWarehouseTempC}
            onChange={(event) => updateTemperature('maxWarehouseTempC', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Temp. min biura [C]
          <input
            type="number"
            value={project.minOfficeTempC}
            onChange={(event) => updateTemperature('minOfficeTempC', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Temp. max biura [C]
          <input
            type="number"
            value={project.maxOfficeTempC}
            onChange={(event) => updateTemperature('maxOfficeTempC', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Rezerwa projektowa [%]
          <input
            min="0"
            type="number"
            value={project.reservePercent}
            onChange={(event) => updateProject('reservePercent', event.target.valueAsNumber)}
          />
        </label>
        <label className="checkbox-label">
          <input
            checked={project.useAlternativeHeatingCooling !== false}
            type="checkbox"
            onChange={(event) =>
              updateProject('useAlternativeHeatingCooling', event.target.checked)
            }
          />
          Nie sumuj ogrzewania i klimatyzacji
        </label>
      </div>

      <div className="subsection">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Strefy</p>
            <h3>Podział budynku</h3>
          </div>
          <button
            className="secondary"
            type="button"
            onClick={addZone}
          >
            Dodaj strefę
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Typ</th>
                <th>Pow. [m2]</th>
                <th>Wys. [m]</th>
                <th>Kub. [m3]</th>
                <th>Temp. min [C]</th>
                <th>Temp. max [C]</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {project.zones.map((zone) => (
                <tr
                  className={zone.id === lastAddedZoneId ? 'is-new-row' : ''}
                  data-zone-id={zone.id}
                  key={zone.id}
                >
                  <td>
                    <input
                      value={zone.name}
                      onChange={(event) => updateZone(zone.id, { name: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={zone.type}
                      onChange={(event) =>
                        updateZone(zone.id, { type: event.target.value as Zone['type'] })
                      }
                    >
                      {zoneTypes.map((type) => (
                        <option key={type} value={type}>
                          {zoneTypeLabels[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      min="0"
                      type="number"
                      value={zone.areaM2}
                      onChange={(event) => updateZone(zone.id, { areaM2: event.target.valueAsNumber })}
                    />
                  </td>
                  <td>
                    <input
                      min="0"
                      step="0.1"
                      type="number"
                      value={zone.heightM ?? ''}
                      onChange={(event) =>
                        updateZone(zone.id, { heightM: event.target.valueAsNumber })
                      }
                    />
                  </td>
                  <td className="numeric">
                    {zone.type === 'warehouse'
                      ? (project.warehouseAreaM2 * project.warehouseHeightM).toFixed(0)
                      : (zone.areaM2 * Math.max(zone.heightM ?? 0, 0)).toFixed(0)}
                  </td>
                  <td>
                    <input
                      type="number"
                      value={zone.minTempC ?? ''}
                      onChange={(event) => updateZone(zone.id, { minTempC: event.target.valueAsNumber })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={zone.maxTempC ?? ''}
                      onChange={(event) => updateZone(zone.id, { maxTempC: event.target.valueAsNumber })}
                    />
                  </td>
                  <td>
                    <button className="ghost danger" type="button" onClick={() => removeZone(zone.id)}>
                      Usuń
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="subsection">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Magazyn energii</p>
            <h3>Wpływ na moc pobieraną</h3>
          </div>
        </div>
        <div className="form-grid">
          <label className="checkbox-label">
            <input
              checked={project.energyStorage.enabled}
              type="checkbox"
              onChange={(event) =>
                updateProject('energyStorage', {
                  ...project.energyStorage,
                  enabled: event.target.checked,
                })
              }
            />
            Uwzględnij magazyn energii
          </label>
          <label>
            Tryb pracy
            <select
              value={project.energyStorage.mode}
              onChange={(event) =>
                updateProject('energyStorage', {
                  ...project.energyStorage,
                  mode: event.target.value as ProjectConfig['energyStorage']['mode'],
                })
              }
            >
              <option value="neutral">Neutralny</option>
              <option value="charging">Ładowanie</option>
              <option value="discharging">Rozładowanie</option>
              <option value="peakShaving">Redukcja szczytu</option>
            </select>
          </label>
          <label>
            Pojemność [kWh]
            <input
              min="0"
              type="number"
              value={project.energyStorage.capacityKwh}
              onChange={(event) =>
                updateProject('energyStorage', {
                  ...project.energyStorage,
                  capacityKwh: event.target.valueAsNumber,
                })
              }
            />
          </label>
          <label>
            Moc ładowania [kW]
            <input
              min="0"
              type="number"
              value={project.energyStorage.chargePowerKw}
              onChange={(event) =>
                updateProject('energyStorage', {
                  ...project.energyStorage,
                  chargePowerKw: event.target.valueAsNumber,
                })
              }
            />
          </label>
          <label>
            Moc rozładowania [kW]
            <input
              min="0"
              type="number"
              value={project.energyStorage.dischargePowerKw}
              onChange={(event) =>
                updateProject('energyStorage', {
                  ...project.energyStorage,
                  dischargePowerKw: event.target.valueAsNumber,
                })
              }
            />
          </label>
          <label>
            Sprawność cyklu [%]
            <input
              max="100"
              min="0"
              type="number"
              value={project.energyStorage.roundTripEfficiencyPercent}
              onChange={(event) =>
                updateProject('energyStorage', {
                  ...project.energyStorage,
                  roundTripEfficiencyPercent: event.target.valueAsNumber,
                })
              }
            />
          </label>
        </div>
      </div>
    </section>
  )
}
