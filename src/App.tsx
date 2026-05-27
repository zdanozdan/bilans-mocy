import { useEffect, useMemo, useState } from 'react'
import { calculateProjectBalance } from './domain/calculations'
import { defaultDevices, defaultProject } from './domain/defaults'
import type { Device, ProjectConfig } from './domain/types'
import { DeviceTable } from './features/devices/DeviceTable'
import { ProjectForm } from './features/project/ProjectForm'
import { ResultsView } from './features/results/ResultsView'
import { exportProjectToJson } from './utils/exportProject'
import './App.css'

interface StoredProject {
  project: ProjectConfig
  devices: Device[]
}

const STORAGE_KEY = 'bilans-energii.project.v1'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStoredProject = (value: unknown): value is StoredProject =>
  isRecord(value) && isRecord(value.project) && Array.isArray(value.devices)

const normalizeStoredProject = (storedProject: StoredProject): StoredProject => ({
  project: {
    ...defaultProject,
    ...storedProject.project,
    energyStorage: {
      ...defaultProject.energyStorage,
      ...storedProject.project.energyStorage,
    },
    zones:
      storedProject.project.zones?.length > 0 ? storedProject.project.zones : defaultProject.zones,
  },
  devices:
    storedProject.devices.length > 0
      ? storedProject.devices.map((device) => ({
          ...device,
          powerInputMode: device.powerInputMode ?? 'manual',
          quantityInputMode: device.quantityInputMode ?? 'manual',
          powerDensityWm2: device.powerDensityWm2 ?? 0,
          scenarios: device.scenarios?.length > 0 ? device.scenarios : ['normal'],
        }))
      : defaultDevices,
})

const loadStoredProject = (): StoredProject => {
  if (typeof window === 'undefined') {
    return { project: defaultProject, devices: defaultDevices }
  }

  const savedProject = window.localStorage.getItem(STORAGE_KEY)

  if (!savedProject) {
    return { project: defaultProject, devices: defaultDevices }
  }

  try {
    const parsed = JSON.parse(savedProject)

    if (!isStoredProject(parsed)) {
      throw new Error('Niepoprawny format danych w autozapisie.')
    }

    return normalizeStoredProject(parsed)
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return { project: defaultProject, devices: defaultDevices }
  }
}

function App() {
  const [storedProject, setStoredProject] = useState<StoredProject>(loadStoredProject)
  const [importError, setImportError] = useState<string | null>(null)
  const project = storedProject.project
  const devices = storedProject.devices
  const balance = useMemo(() => calculateProjectBalance(project, devices), [project, devices])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedProject))
  }, [storedProject])

  const setProject = (nextProject: ProjectConfig) => {
    setStoredProject((currentProject) => ({
      ...currentProject,
      project: nextProject,
    }))
  }

  const setDevices = (nextDevices: Device[]) => {
    setStoredProject((currentProject) => ({
      ...currentProject,
      devices: nextDevices,
    }))
  }

  const handleExport = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedProject))
    exportProjectToJson(project, devices)
  }

  const handleImport = (file: File | undefined) => {
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))

        if (!isStoredProject(parsed)) {
          throw new Error('Niepoprawny format pliku JSON.')
        }

        setStoredProject(normalizeStoredProject(parsed))
        setImportError(null)
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Nie udało się wczytać pliku.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <main className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Bilans energii</p>
          <h1>Bilans mocy dla budynku magazynowo-biurowego</h1>
          <p>
            Skonfiguruj strefy, odbiorniki, współczynniki jednoczesności i scenariusze pracy.
            Aplikacja wyliczy moce oraz przygotuje arkusz z wynikiem.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={handleExport}>
            Zapisz JSON
          </button>
          <label className="file-button">
            Wczytaj JSON
            <input
              accept="application/json"
              type="file"
              onChange={(event) => handleImport(event.target.files?.[0])}
            />
          </label>
          {importError ? <p className="error-text">{importError}</p> : null}
          <p className="autosave-note">Autozapis działa po każdej zmianie i wraca po odświeżeniu.</p>
        </div>
      </header>

      <section className="quick-summary" aria-label="Szybkie podsumowanie">
        <article>
          <span>Urządzenia</span>
          <strong>{devices.length}</strong>
        </article>
        <article>
          <span>Strefy</span>
          <strong>{project.zones.length}</strong>
        </article>
        <article>
          <span>Kubatura magazynu</span>
          <strong>{balance.metrics.warehouseVolumeM3.toFixed(0)} m3</strong>
        </article>
        <article>
          <span>Osoby / komputery</span>
          <strong>
            {balance.metrics.peopleCount} / {balance.metrics.computerCount}
          </strong>
        </article>
        <article>
          <span>Najwyższa moc netto</span>
          <strong>
            {Math.max(...balance.scenarios.map((scenario) => scenario.netPowerKw)).toFixed(2)} kW
          </strong>
        </article>
      </section>

      <div className="layout">
        <ProjectForm project={project} onChange={setProject} />
        <DeviceTable devices={devices} project={project} onChange={setDevices} />
        <ResultsView balance={balance} />
      </div>
    </main>
  )
}

export default App
