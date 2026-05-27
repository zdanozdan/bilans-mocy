import type { Device, ProjectConfig } from '../domain/types'
import {
  checkDevProjectServer,
  getDevProjectDisplayPath,
  isDevProjectServerCached,
  listDevProjectFiles,
  loadProjectFromDevServer,
  saveProjectToDevServer,
} from './devProjectFile'
import {
  clearStoredWebFileHandle,
  ensureWritePermission,
  restoreWebFileHandle,
  storeWebFileHandle,
} from './projectFileHandleStore'

export interface StoredProject {
  project: ProjectConfig
  devices: Device[]
}

export type SaveProjectMode =
  | 'overwrite'
  | 'download'
  | 'cancelled'
  | 'skipped'
  | 'needs_link'
  | 'dev_server'

export interface SaveProjectResult {
  path: string | null
  created: boolean
  mode: SaveProjectMode
  message?: string
}

const PROJECT_FILE_PATH_KEY = 'bilans-energii.projectFilePath'

const jsonPickerTypes = [
  {
    description: 'Projekt JSON',
    accept: { 'application/json': ['.json'] },
  },
]

let webFileHandle: FileSystemFileHandle | null = null

type JsonFilePickerOptions = {
  suggestedName?: string
  multiple?: boolean
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}

type FilePickerWindow = Window & {
  showSaveFilePicker: (options: JsonFilePickerOptions) => Promise<FileSystemFileHandle>
  showOpenFilePicker: (options: JsonFilePickerOptions) => Promise<FileSystemFileHandle[]>
}

const getFilePickerWindow = (): FilePickerWindow | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const pickerWindow = window as Window & Partial<FilePickerWindow>

  if (
    typeof pickerWindow.showSaveFilePicker !== 'function' ||
    typeof pickerWindow.showOpenFilePicker !== 'function'
  ) {
    return null
  }

  return pickerWindow as FilePickerWindow
}

export const hasNativeFilePicker = (): boolean => getFilePickerWindow() !== null

export const canOverwriteProjectFile = (): boolean =>
  isDevProjectServerCached() || hasNativeFilePicker()

export { checkDevProjectServer, loadProjectFromDevServer } from './devProjectFile'

export const usesDevProjectStorage = async (): Promise<boolean> => checkDevProjectServer()

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-')
    .replace(/^-|-$/g, '')

const defaultFileName = (project: ProjectConfig) =>
  `${sanitizeFileName(project.name) || 'bilans-energii'}.json`

export const getPreferredExportFileName = (project: ProjectConfig): string => {
  const fromProject = project.exportFileName?.trim()

  if (fromProject) {
    return fromProject.endsWith('.json') ? fromProject : `${fromProject}.json`
  }

  return getProjectFilePath() ?? defaultFileName(project)
}

export const withExportFileName = (
  project: ProjectConfig,
  fileName: string | null,
): ProjectConfig => ({
  ...project,
  exportFileName: fileName ?? undefined,
})

export const getProjectFilePath = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(PROJECT_FILE_PATH_KEY)
}

export const setProjectFilePath = (path: string | null) => {
  if (typeof window === 'undefined') {
    return
  }

  if (path) {
    window.localStorage.setItem(PROJECT_FILE_PATH_KEY, path)
  } else {
    window.localStorage.removeItem(PROJECT_FILE_PATH_KEY)
  }
}

export const clearWebFileHandle = () => {
  webFileHandle = null
  void clearStoredWebFileHandle()
}

const isStoredProject = (value: unknown): value is StoredProject =>
  typeof value === 'object' &&
  value !== null &&
  'project' in value &&
  typeof (value as StoredProject).project === 'object' &&
  Array.isArray((value as StoredProject).devices)

const parseProjectPayload = (raw: string): StoredProject => {
  const parsed: unknown = JSON.parse(raw)

  if (!isStoredProject(parsed)) {
    throw new Error('Niepoprawny format pliku JSON.')
  }

  return parsed
}

const serializeProject = (project: ProjectConfig, devices: Device[]) =>
  JSON.stringify({ project, devices }, null, 2)

const buildPayload = (project: ProjectConfig, devices: Device[]) => {
  const preferredName = getPreferredExportFileName(project)
  return {
    preferredName,
    payload: serializeProject(withExportFileName(project, preferredName), devices),
  }
}

const needsLinkResult = (project: ProjectConfig, message: string): SaveProjectResult => ({
  path: getPreferredExportFileName(project),
  created: false,
  mode: 'needs_link',
  message,
})

export async function supportsNativeProjectFiles(): Promise<boolean> {
  return (await checkDevProjectServer()) || hasNativeFilePicker()
}

export const isProjectFileLinked = async (): Promise<boolean> => {
  if (await checkDevProjectServer()) {
    return true
  }

  return Boolean(await resolveWebFileHandle())
}

async function saveViaDevServer(
  project: ProjectConfig,
  devices: Device[],
): Promise<SaveProjectResult> {
  const fileName = getPreferredExportFileName(project)
  const projectForSave = withExportFileName(project, fileName)
  const result = await saveProjectToDevServer(fileName, projectForSave, devices)

  setProjectFilePath(fileName)

  return {
    path: result.path,
    created: false,
    mode: 'dev_server',
    message: `Zapisano na dysku: ${result.path}`,
  }
}

const rememberWebFileHandle = async (handle: FileSystemFileHandle) => {
  webFileHandle = handle
  setProjectFilePath(handle.name)
  await storeWebFileHandle(handle)
}

const resolveWebFileHandle = async (): Promise<FileSystemFileHandle | null> => {
  if (webFileHandle) {
    return webFileHandle
  }

  const restored = await restoreWebFileHandle()

  if (restored) {
    webFileHandle = restored
  }

  return webFileHandle
}

const writeToWebFileHandle = async (handle: FileSystemFileHandle, payload: string) => {
  const canWrite = await ensureWritePermission(handle)

  if (!canWrite) {
    throw new Error('Brak uprawnień do zapisu pliku. Użyj „Powiąż plik” i wybierz projekt ponownie.')
  }

  const writable = await handle.createWritable()
  await writable.write(payload)
  await writable.close()
  await rememberWebFileHandle(handle)
}

/** Jawne pobranie kopii — na Macu może utworzyć plik -2, -3 w Pobranych. */
export function downloadProjectCopy(project: ProjectConfig, devices: Device[]): SaveProjectResult {
  const { preferredName, payload } = buildPayload(project, devices)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = preferredName
  link.click()
  URL.revokeObjectURL(url)

  setProjectFilePath(preferredName)

  return {
    path: preferredName,
    created: true,
    mode: 'download',
    message:
      'Pobrano kopię do folderu Pobrane. Aby nadpisywać jeden plik, użyj Chrome/Edge i „Powiąż plik”.',
  }
}

async function saveToLinkedFile(
  project: ProjectConfig,
  devices: Device[],
): Promise<SaveProjectResult> {
  const { preferredName, payload } = buildPayload(project, devices)
  const existingHandle = await resolveWebFileHandle()

  if (!existingHandle) {
    return needsLinkResult(
      project,
      'Plik nie jest powiązany. Kliknij „Powiąż plik” i wybierz ten JSON na dysku (np. wysogotowo-mikran.json).',
    )
  }

  await writeToWebFileHandle(existingHandle, payload)

  return {
    path: existingHandle.name || preferredName,
    created: false,
    mode: 'overwrite',
    message: 'Zapisano do powiązanego pliku.',
  }
}

/** Wybierz istniejący plik JSON i zapisz do niego (nadpisanie, bez pobierania kopii). */
export async function linkAndSaveProjectFile(
  project: ProjectConfig,
  devices: Device[],
): Promise<SaveProjectResult> {
  const pickerWindow = getFilePickerWindow()

  if (!pickerWindow) {
    return needsLinkResult(
      project,
      'Safari i Firefox nie pozwalają zapisać bezpośrednio na dysk. Użyj Chrome lub Edge, kliknij „Powiąż plik” i wybierz swój JSON. Dane są też w autozapisie przeglądarki.',
    )
  }

  try {
    const [handle] = await pickerWindow.showOpenFilePicker({
      multiple: false,
      types: jsonPickerTypes,
    })
    const { payload } = buildPayload(withExportFileName(project, handle.name), devices)
    await writeToWebFileHandle(handle, payload)

    return {
      path: handle.name,
      created: false,
      mode: 'overwrite',
      message: 'Plik powiązany — kolejne zmiany będą go nadpisywać (bez kopii -2, -3).',
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { path: null, created: false, mode: 'cancelled' }
    }

    throw error instanceof Error ? error : new Error('Nie udało się powiązać pliku.')
  }
}

export async function saveProjectToJson(
  project: ProjectConfig,
  devices: Device[],
  options?: { silent?: boolean },
): Promise<SaveProjectResult> {
  try {
    if (await checkDevProjectServer()) {
      return await saveViaDevServer(project, devices)
    }

    const linked = await isProjectFileLinked()

    if (!linked) {
      if (options?.silent) {
        return { path: getPreferredExportFileName(project), created: false, mode: 'skipped' }
      }

      if (!hasNativeFilePicker()) {
        return needsLinkResult(
          project,
          'Użyj Chrome lub Edge i przycisk „Powiąż plik”, aby zapisywać do jednego JSON na dysku.',
        )
      }

      return needsLinkResult(
        project,
        'Najpierw powiąż plik przyciskiem „Powiąż plik” (wybierz istniejący JSON).',
      )
    }

    return await saveToLinkedFile(project, devices)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { path: null, created: false, mode: 'cancelled' }
    }

    throw error instanceof Error ? error : new Error('Nie udało się zapisać pliku.')
  }
}

export async function openProjectFromJson(): Promise<StoredProject | null> {
  if (await checkDevProjectServer()) {
    const files = await listDevProjectFiles()

    if (files.length === 0) {
      throw new Error(
        `Brak plików w folderze ${getDevProjectDisplayPath('')}. Zapisz projekt lub skopiuj JSON do projects/.`,
      )
    }

    const currentName = getProjectFilePath()
    const defaultPick = files.find((file) => file === currentName) ?? files[0]
    const picked =
      files.length === 1
        ? files[0]
        : window.prompt(
            `Wybierz plik z folderu projects/:\n${files.join('\n')}`,
            defaultPick,
          )

    if (!picked || !files.includes(picked)) {
      return null
    }

    const loaded = await loadProjectFromDevServer(picked)

    if (!loaded) {
      throw new Error(`Nie znaleziono pliku projects/${picked}`)
    }

    setProjectFilePath(picked)

    return {
      ...loaded,
      project: withExportFileName(loaded.project, picked),
    }
  }

  const pickerWindow = getFilePickerWindow()

  if (!pickerWindow) {
    return null
  }

  const [handle] = await pickerWindow.showOpenFilePicker({
    multiple: false,
    types: jsonPickerTypes,
  })

  const file = await handle.getFile()
  const raw = await file.text()
  await rememberWebFileHandle(handle)
  const parsed = parseProjectPayload(raw)

  return {
    ...parsed,
    project: withExportFileName(parsed.project, handle.name),
  }
}

export async function readProjectFromFile(file: File): Promise<StoredProject> {
  const parsed = parseProjectPayload(await file.text())
  const fileName = file.name.endsWith('.json') ? file.name : `${file.name}.json`

  if (await checkDevProjectServer()) {
    const projectForSave = withExportFileName(parsed.project, fileName)
    await saveProjectToDevServer(fileName, projectForSave, parsed.devices)
    setProjectFilePath(fileName)

    return {
      project: projectForSave,
      devices: parsed.devices,
    }
  }

  if (hasNativeFilePicker()) {
    clearWebFileHandle()
    setProjectFilePath(null)
    throw new Error(
      'Przeciągnięcie pliku nie powiązuje go do zapisu. Użyj „Powiąż plik” lub „Wczytaj JSON” w Chrome/Edge.',
    )
  }

  clearWebFileHandle()
  setProjectFilePath(file.name)

  return {
    ...parsed,
    project: withExportFileName(parsed.project, file.name),
  }
}

export const hydrateProjectFileHandle = async (): Promise<boolean> => {
  if (await checkDevProjectServer()) {
    return true
  }

  const handle = await resolveWebFileHandle()

  if (!handle) {
    return false
  }

  return ensureWritePermission(handle)
}
