const DB_NAME = 'bilans-energii'
const STORE = 'file-handles'
const HANDLE_KEY = 'project'

type WritableFileHandle = FileSystemFileHandle & {
  queryPermission: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
  })

export const storeWebFileHandle = async (handle: FileSystemFileHandle) => {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const restoreWebFileHandle = async (): Promise<FileSystemFileHandle | null> => {
  const db = await openDb()
  const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(HANDLE_KEY)
    request.onsuccess = () => resolve((request.result as FileSystemFileHandle | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })

  if (!handle) {
    return null
  }

  const permission = await (handle as WritableFileHandle).queryPermission({ mode: 'readwrite' })

  if (permission === 'denied') {
    return null
  }

  return handle
}

export const ensureWritePermission = async (
  handle: FileSystemFileHandle,
): Promise<boolean> => {
  const writableHandle = handle as WritableFileHandle
  const current = await writableHandle.queryPermission({ mode: 'readwrite' })

  if (current === 'granted') {
    return true
  }

  if (current === 'denied') {
    return false
  }

  return (await writableHandle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export const clearStoredWebFileHandle = async () => {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
