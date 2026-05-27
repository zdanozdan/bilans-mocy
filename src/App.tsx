import { useEffect, useMemo, useRef, useState } from 'react'
import { calculateProjectBalance, usesCopThermalConversion } from './domain/calculations'
import { resolveDeviceZone } from './domain/zones'
import {
  defaultDevices,
  defaultHeatPumpCopMinus20C,
  defaultHeatPumpCopNormal,
  defaultProject,
  getDefaultThermalDensityUnit,
} from './domain/defaults'
import { normalizeDeviceZoneIds } from './domain/zones'
import type { Device, ProjectConfig } from './domain/types'
import { DeviceTable } from './features/devices/DeviceTable'
import { ProjectForm } from './features/project/ProjectForm'
import { PrintReport } from './features/results/PrintReport'
import { ResultsView } from './features/results/ResultsView'
import { getDevProjectDisplayPath } from './utils/devProjectFile'
import {
  canOverwriteProjectFile,
  checkDevProjectServer,
  downloadProjectCopy,
  getPreferredExportFileName,
  getProjectFilePath,
  setProjectFilePath,
  hasNativeFilePicker,
  hydrateProjectFileHandle,
  isProjectFileLinked,
  linkAndSaveProjectFile,
  loadProjectFromDevServer,
  openProjectFromJson,
  readProjectFromFile,
  saveProjectToJson,
  withExportFileName,
  type StoredProject,
} from './utils/projectFile'
import './App.css'

const STORAGE_KEY = 'bilans-energii.project.v1'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStoredProject = (value: unknown): value is StoredProject =>
  isRecord(value) && isRecord(value.project) && Array.isArray(value.devices)

const normalizeStoredProject = (storedProject: StoredProject): StoredProject => {
  const rememberedFileName =
    storedProject.project.exportFileName?.trim() || getProjectFilePath() || undefined

  return {
  project: {
    ...defaultProject,
    ...storedProject.project,
    exportFileName: rememberedFileName,
    energyStorage: {
      ...defaultProject.energyStorage,
      ...storedProject.project.energyStorage,
    },
    zones:
      storedProject.project.zones?.length > 0 ? storedProject.project.zones : defaultProject.zones,
  },
  devices:
    storedProject.devices.length > 0
      ? normalizeDeviceZoneIds(
          storedProject.project,
          storedProject.devices.map((device) => {
          const zoneType =
            resolveDeviceZone(storedProject.project, device.zoneId)?.type ?? 'custom'

          return {
            ...device,
            powerInputMode: device.powerInputMode ?? 'manual',
            quantityInputMode: device.quantityInputMode ?? 'manual',
            powerDensityWm2: device.powerDensityWm2 ?? 0,
            thermalDensityUnit: usesCopThermalConversion(device.categoryId)
              ? (device.thermalDensityUnit ??
                  (device.categoryId === 'cooling' || device.categoryId === 'cwu'
                    ? 'Wm2'
                    : getDefaultThermalDensityUnit(zoneType)))
              : device.thermalDensityUnit,
            ...(usesCopThermalConversion(device.categoryId)
              ? {
                  copMinus20C: Math.max(
                    device.copMinus20C ?? device.cop ?? defaultHeatPumpCopMinus20C,
                    0.1,
                  ),
                  copNormal: Math.max(
                    device.copNormal ?? defaultHeatPumpCopNormal,
                    0.1,
                  ),
                }
              : {}),
            scenarios: device.scenarios?.length > 0 ? device.scenarios : ['normal'],
          }
        }),
        )
      : defaultDevices,
  }
}

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
  const importInputRef = useRef<HTMLInputElement>(null)
  const skipFileAutosaveRef = useRef(true)
  const [storedProject, setStoredProject] = useState<StoredProject>(loadStoredProject)
  const [importError, setImportError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)
  const [projectFilePath, setProjectFilePathState] = useState<string | null>(() => getProjectFilePath())
  const [projectFileLinked, setProjectFileLinked] = useState(false)
  const [devProjectServer, setDevProjectServer] = useState(false)
  const nativeFileDialogs = hasNativeFilePicker()
  const project = storedProject.project
  const devices = storedProject.devices
  const balance = useMemo(() => calculateProjectBalance(project, devices), [project, devices])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedProject))
  }, [storedProject])

  const refreshFileLinkState = async () => {
    const dev = await checkDevProjectServer()
    setDevProjectServer(dev)

    if (dev) {
      setProjectFileLinked(true)
      const fileName = getPreferredExportFileName(project)
      setProjectFilePathState(getDevProjectDisplayPath(fileName))
      return
    }

    const linked = await hydrateProjectFileHandle()
    setProjectFileLinked(linked && (await isProjectFileLinked()))
    const path = getProjectFilePath()
    setProjectFilePathState(path)

    if (path) {
      setStoredProject((current) => ({
        ...current,
        project: withExportFileName(current.project, path),
      }))
    }
  }

  useEffect(() => {
    void (async () => {
      const dev = await checkDevProjectServer()
      setDevProjectServer(dev)

      if (!dev) {
        await refreshFileLinkState()
        return
      }

      setProjectFileLinked(true)
      const fileName = getPreferredExportFileName(storedProject.project)

      try {
        const loaded = await loadProjectFromDevServer(fileName)

        if (loaded) {
          setStoredProject(normalizeStoredProject(loaded))
          skipFileAutosaveRef.current = true
        }
      } catch {
        // Brak pliku na starcie — zostaje autozapis z przeglądarki.
      }

      setProjectFilePathState(getDevProjectDisplayPath(fileName))
    })()
  }, [])

  useEffect(() => {
    if (skipFileAutosaveRef.current) {
      skipFileAutosaveRef.current = false
      return
    }

    if (!projectFileLinked) {
      return
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await saveProjectToJson(project, devices, { silent: true })

          if ((result.mode === 'overwrite' || result.mode === 'dev_server') && result.path) {
            setProjectFilePathState(result.path)
            setSaveInfo(result.message ?? 'Zapisano do pliku.')
            setSaveError(null)
          }
        } catch (error) {
          setSaveError(
            error instanceof Error ? error.message : 'Nie udało się zapisać pliku po zmianie.',
          )
        }
      })()
    }, 900)

    return () => window.clearTimeout(timeout)
  }, [storedProject, projectFileLinked, project, devices])

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

  const applySaveResult = async (result: Awaited<ReturnType<typeof saveProjectToJson>>) => {
    if (result.path && result.mode !== 'cancelled') {
      setStoredProject((current) => ({
        ...current,
        project: withExportFileName(current.project, result.path),
      }))
      await refreshFileLinkState()
      setProjectFilePathState(result.path)
    }

    if (result.message) {
      setSaveInfo(result.message)
    }

    if (result.mode === 'needs_link') {
      setSaveError(null)
    }
  }

  const handleExport = async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedProject))
    setSaveError(null)
    setSaveInfo(null)

    try {
      const result =
        devProjectServer || (await isProjectFileLinked())
          ? await saveProjectToJson(project, devices)
          : await linkAndSaveProjectFile(project, devices)

      await applySaveResult(result)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Nie udało się zapisać pliku.')
    }
  }

  const handleLinkFile = async () => {
    setSaveError(null)
    setSaveInfo(null)

    try {
      const result = await linkAndSaveProjectFile(project, devices)
      skipFileAutosaveRef.current = true
      await applySaveResult(result)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Nie udało się powiązać pliku.')
    }
  }

  const handleDownloadCopy = () => {
    setSaveError(null)
    const result = downloadProjectCopy(project, devices)
    void applySaveResult(result)
  }

  const handleImportClick = async () => {
    if (!nativeFileDialogs) {
      importInputRef.current?.click()
      return
    }

    setImportError(null)

    try {
      const opened = await openProjectFromJson()

      if (!opened) {
        return
      }

      setStoredProject(normalizeStoredProject(opened))
      skipFileAutosaveRef.current = true
      setSaveInfo('Projekt wczytany — zmiany będą zapisywane do tego pliku.')
      await refreshFileLinkState()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Nie udało się wczytać pliku.')
    }
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) {
      return
    }

    setImportError(null)

    try {
      const parsed = await readProjectFromFile(file)
      setStoredProject(normalizeStoredProject(parsed))
      skipFileAutosaveRef.current = true
      await refreshFileLinkState()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Nie udało się wczytać pliku.')
    }
  }

  return (
    <main className="app-shell">
      <header className="hero-card no-print">
        <div className="hero-intro">
          <p className="eyebrow">Bilans energii</p>
          <label className="hero-title-field">
            Tytuł projektu
            <input
              value={project.name}
              onChange={(event) => setProject({ ...project, name: event.target.value })}
            />
          </label>
          <p className="hero-description">
            Skonfiguruj strefy, odbiorniki, współczynniki jednoczesności i scenariusze pracy.
            Aplikacja wyliczy moce oraz przygotuje arkusz z wynikiem.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => void handleExport()}>
            Zapisz JSON
          </button>
          <button className="secondary" type="button" onClick={() => void handleImportClick()}>
            Wczytaj JSON
          </button>
          {!devProjectServer ? (
            <>
              {canOverwriteProjectFile() ? (
                <button className="secondary" type="button" onClick={() => void handleLinkFile()}>
                  Powiąż plik
                </button>
              ) : null}
              <button className="secondary" type="button" onClick={handleDownloadCopy}>
                Pobierz kopię
              </button>
            </>
          ) : null}
          <input
            ref={importInputRef}
            accept="application/json"
            type="file"
            className="hidden-file-input"
            onChange={(event) => {
              void handleImport(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        <div className="hero-meta">
          <label className="project-file-name-field">
            Plik JSON
            <input
              value={project.exportFileName ?? ''}
              placeholder={getPreferredExportFileName(project)}
              onChange={(event) => {
                const fileName = event.target.value.trim() || null
                setProject(withExportFileName(project, fileName))

                if (fileName) {
                  setProjectFilePath(fileName)
                  setProjectFilePathState(
                    devProjectServer ? getDevProjectDisplayPath(fileName) : fileName,
                  )
                }
              }}
            />
          </label>
          {projectFilePath ? (
            <p className="project-file-path">
              {devProjectServer ? (
                <>
                  Zapis deweloperski (npm run dev): <strong>{projectFilePath}</strong>
                </>
              ) : projectFileLinked ? (
                <>
                  Powiązany plik — zmiany nadpisują: <strong>{projectFilePath}</strong>
                </>
              ) : (
                <>
                  Docelowy plik: <strong>{projectFilePath}</strong> — uruchom przez npm run dev albo
                  powiąż plik w Chrome/Edge.
                </>
              )}
            </p>
          ) : null}
          {saveInfo ? <p className="info-text">{saveInfo}</p> : null}
          {saveError ? <p className="error-text">{saveError}</p> : null}
          {importError ? <p className="error-text">{importError}</p> : null}
          <p className="autosave-note">
            {devProjectServer
              ? 'npm run dev: każda zmiana zapisuje JSON w folderze projects/ w katalogu projektu (ten sam plik, bez kopii -2).'
              : 'Uruchom npm run dev, aby zapisywać pliki w projects/. W przeglądarce bez serwera — tylko autozapis lokalny lub „Pobierz kopię”.'}
          </p>
        </div>
      </header>

      <section className="quick-summary no-print" aria-label="Szybkie podsumowanie">
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

      <div className="layout no-print">
        <ProjectForm project={project} onChange={setProject} />
        <DeviceTable devices={devices} project={project} onChange={setDevices} />
        <ResultsView balance={balance} />
      </div>

      <PrintReport balance={balance} devices={devices} />
    </main>
  )
}

export default App
