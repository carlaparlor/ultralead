import { useEffect, useState } from 'react'
import { createLocalWorkspaceRepository, parseBackup, STORAGE_KEY } from '../domain/storage'
import { createEmptyWorkspace } from '../domain/workspace'
import { pruneExcluded } from '../domain/workspace'
import type { Workspace } from '../domain/types'

export function useWorkspace() {
  const [repository] = useState(() => {
    try { return createLocalWorkspaceRepository(window.localStorage) } catch { return null }
  })
  const [initial] = useState(() => repository?.load() ?? {
    workspace: createEmptyWorkspace(), warning: 'Browser storage is unavailable. Changes may not be saved; export a backup before leaving.', canSave: false,
  })
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace)
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.warning)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setWorkspace(previous => pruneExcluded(previous, now))
  }, [now])

  // Keep another tab on the same browser/origin reasonably up to date. Concurrent
  // edits still use last-write-wins; this is not multi-user coordination.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      const incoming = parseBackup(event.newValue)
      if (incoming) setWorkspace(pruneExcluded(incoming, new Date()))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!initial.canSave) return
    try {
      repository?.save(workspace)
    } catch {
      setStorageWarning('Browser storage is full or unavailable. Changes may not be saved; export a backup before leaving.')
    }
  }, [workspace, initial.canSave, repository])

  return { workspace, setWorkspace, now, setNow, storageWarning }
}
