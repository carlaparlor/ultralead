import { createDemoWorkspace } from './demo'
import { createEmptyWorkspace, pruneExcluded } from './workspace'
import type { Workspace } from './types'

export const STORAGE_KEY = 'ultralead-plus.workspace.v1'
const RECOVERY_KEY = 'ultralead-plus.unreadable-backup'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isDate = (value: unknown): boolean => isString(value) && !Number.isNaN(Date.parse(value))
const isNullableDate = (value: unknown): boolean => value === null || isDate(value)
const hasUnique = (items: unknown[], key: (item: Record<string, unknown>) => unknown): boolean => {
  const values = items.filter(isObject).map(key)
  return values.length === items.length && new Set(values).size === items.length
}

function isLead(value: unknown): boolean {
  if (!isObject(value)) return false
  return isString(value.accountNumber) && /^5-\d+$/.test(value.accountNumber)
    && isString(value.name) && !!value.name.trim() && isString(value.customerId)
    && (value.customerId === '' || /^\d{13}$/.test(value.customerId))
    && isString(value.sourceStatus) && (value.listDate === null || isString(value.listDate))
    && isDate(value.importedAt) && typeof value.ageVerified === 'boolean'
}

/** Reject malformed or foreign files instead of partially overwriting a workspace. */
export function isWorkspace(value: unknown): value is Workspace {
  if (!isObject(value) || value.version !== 1 || typeof value.isDemo !== 'boolean' || !isDate(value.createdAt)
    || !isString(value.deviceSeed) || !value.deviceSeed || !Array.isArray(value.leads)
    || !Array.isArray(value.callbacks) || !Array.isArray(value.sales) || !Array.isArray(value.activity)
    || !Array.isArray(value.packages) || !isObject(value.profiles) || !isObject(value.settings)
    || typeof value.settings.autoCopy !== 'boolean') return false
  if (!value.leads.every(isLead) || !hasUnique(value.leads, lead => lead.accountNumber)) return false
  if (!value.callbacks.every(item => isObject(item) && isString(item.id) && isLead(item.lead) && isDate(item.dueAt) && isDate(item.createdAt) && isString(item.note))
    || !hasUnique(value.callbacks, item => (item.lead as Record<string, unknown>).accountNumber)) return false
  if (!value.sales.every(item => isObject(item) && isString(item.id) && isLead(item.lead) && isString(item.packageName) && !!item.packageName.trim()
    && (item.activationType === null || ['ATT', 'Non-ATT'].includes(String(item.activationType)))
    && (item.stage !== 'activated' || item.activationType !== null)
    && ['credit_vetting', 'pending_confirmation', 'activated', 'declined'].includes(String(item.stage))
    && isDate(item.createdAt) && isDate(item.updatedAt) && isNullableDate(item.activatedAt)
    && (item.stage !== 'activated' || isDate(item.activatedAt))) || !hasUnique(value.sales, item => item.id)) return false
  if (!value.activity.every(item => isObject(item) && isString(item.id) && isDate(item.at) && isString(item.accountNumber) && isString(item.name) && isString(item.description))) return false
  if (!value.packages.every(isString)) return false
  for (const [account, profile] of Object.entries(value.profiles)) {
    if (!/^5-\d+$/.test(account) || !isObject(profile) || !isString(profile.notes) || typeof profile.doNotCall !== 'boolean'
      || !(profile.excludedReason === null || ['active', 'archived', 'age_60_plus'].includes(String(profile.excludedReason)))
      || !isNullableDate(profile.queueResetAt) || !Array.isArray(profile.attempts)
      || !profile.attempts.every(attempt => isObject(attempt) && isString(attempt.id) && isDate(attempt.at)
        && ['no_answer', 'not_interested', 'callback', 'sale'].includes(String(attempt.outcome)))) return false
  }
  return true
}

export interface LoadResult { workspace: Workspace; warning: string | null; canSave: boolean }

export function loadWorkspace(storage: Storage, now = new Date()): LoadResult {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { workspace: createDemoWorkspace(now), warning: null, canSave: true }
    const parsed: unknown = JSON.parse(raw)
    if (!isWorkspace(parsed)) throw new Error('Invalid workspace')
    return { workspace: pruneExcluded(parsed, now), warning: null, canSave: true }
  } catch {
    // Preserve unreadable data before a clean workspace is ever written over it.
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (raw) storage.setItem(RECOVERY_KEY, raw)
      return { workspace: createEmptyWorkspace(now), warning: 'Saved data could not be read. A recovery copy was kept in this browser; restore a backup if you have one.', canSave: true }
    } catch {
      return { workspace: createEmptyWorkspace(now), warning: 'Browser storage is unavailable. Changes may not be saved; export a backup before leaving.', canSave: false }
    }
  }
}

export function parseBackup(raw: string): Workspace | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isWorkspace(parsed) ? parsed : null
  } catch { return null }
}

/** Storage boundary: another repository (IndexedDB or a shared API) can implement this contract. */
export interface WorkspaceRepository {
  load(now?: Date): LoadResult
  save(workspace: Workspace): void
}

export function createLocalWorkspaceRepository(storage: Storage): WorkspaceRepository {
  return {
    load: now => loadWorkspace(storage, now),
    save: workspace => storage.setItem(STORAGE_KEY, JSON.stringify(workspace)),
  }
}
