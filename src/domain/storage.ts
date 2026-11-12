import { createDemoWorkspace } from './demo'
import { isPackagePrice, referralRewardCents } from './money'
import { createEmptyWorkspace, pruneExcluded } from './workspace'
import type { Workspace } from './types'

// A separate key prevents an older tab from overwriting the new referral/payment data.
export const STORAGE_KEY = 'ultralead-plus.workspace.v2'
export const LEGACY_STORAGE_KEY = 'ultralead-plus.workspace.v1'
const RECOVERY_KEY = 'ultralead-plus.unreadable-backup'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNonEmpty = (value: unknown): value is string => isString(value) && !!value.trim()
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

/** The original validation is also used before migrating a version-1 backup. */
function hasValidCore(value: unknown, version: 1 | 2): value is Record<string, unknown> {
  if (!isObject(value) || value.version !== version || typeof value.isDemo !== 'boolean' || !isDate(value.createdAt)
    || !isString(value.deviceSeed) || !value.deviceSeed || !Array.isArray(value.leads)
    || !Array.isArray(value.callbacks) || !Array.isArray(value.sales) || !Array.isArray(value.activity)
    || !Array.isArray(value.packages) || !isObject(value.profiles) || !isObject(value.settings)
    || typeof value.settings.autoCopy !== 'boolean') return false
  if (!value.leads.every(isLead) || !hasUnique(value.leads, lead => lead.accountNumber)) return false
  if (!value.callbacks.every(item => isObject(item) && isString(item.id) && isLead(item.lead) && isDate(item.dueAt) && isDate(item.createdAt) && isString(item.note))
    || !hasUnique(value.callbacks, item => (item.lead as Record<string, unknown>).accountNumber)) return false
  if (!value.sales.every(item => isObject(item) && isString(item.id) && isLead(item.lead) && isString(item.packageName) && !!item.packageName.trim()
    && (version === 1 || item.packagePriceCents === null || isPackagePrice(item.packagePriceCents))
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

/** Reject malformed or foreign files instead of partially overwriting a workspace. */
export function isWorkspace(value: unknown): value is Workspace {
  if (!hasValidCore(value, 2) || !Array.isArray(value.referrers) || !Array.isArray(value.referrals)) return false
  if (!value.referrers.every(item => isObject(item) && isNonEmpty(item.id) && isNonEmpty(item.name) && item.name.trim().length <= 120
    && isString(item.contact) && item.contact.length <= 160 && isDate(item.createdAt)) || !hasUnique(value.referrers, item => item.id)) return false
  const referrerIds = new Set(value.referrers.map(item => (item as Record<string, unknown>).id))
  const linkedAccounts = new Set<string>()
  const paymentIds = new Set<string>()
  if (!hasUnique(value.referrals, item => item.id)) return false
  for (const referral of value.referrals) {
    if (!isObject(referral) || !isNonEmpty(referral.id) || !referrerIds.has(referral.referrerId)
      || !isNonEmpty(referral.customerName) || referral.customerName.trim().length > 120
      || !isString(referral.customerContact) || referral.customerContact.length > 160
      || !(referral.accountNumber === null || (isString(referral.accountNumber) && /^5-\d+$/.test(referral.accountNumber)))
      || !isDate(referral.createdAt) || !isDate(referral.updatedAt) || !Array.isArray(referral.payments)) return false
    if (isString(referral.accountNumber)) {
      if (linkedAccounts.has(referral.accountNumber)) return false
      linkedAccounts.add(referral.accountNumber)
    }
    let currentPayments = 0
    for (const payment of referral.payments) {
      if (!isObject(payment) || !isNonEmpty(payment.id) || paymentIds.has(payment.id) || !isDate(payment.paidAt)
        || !isNullableDate(payment.voidedAt) || !isNonEmpty(payment.saleId) || !isString(payment.accountNumber)
        || !/^5-\d+$/.test(payment.accountNumber) || (payment.voidedAt === null && payment.accountNumber !== referral.accountNumber)
        || !isNonEmpty(payment.customerName) || !isNonEmpty(payment.referrerName) || !isNonEmpty(payment.packageName)
        || !isPackagePrice(payment.packagePriceCents) || !isDate(payment.activatedAt)
        || payment.amountCents !== referralRewardCents(payment.packagePriceCents)) return false
      paymentIds.add(payment.id)
      if (payment.voidedAt === null) currentPayments++
    }
    if (currentPayments > 1) return false
  }
  return true
}

/** Validate first, then migrate old records with an unknown price rather than guessing. */
export function decodeWorkspace(value: unknown): Workspace | null {
  if (isWorkspace(value)) return value
  if (!hasValidCore(value, 1)) return null
  const migrated = {
    ...value, version: 2,
    sales: (value.sales as Record<string, unknown>[]).map(sale => ({ ...sale, packagePriceCents: null })),
    referrers: [], referrals: [],
  }
  return isWorkspace(migrated) ? migrated : null
}

export interface LoadResult { workspace: Workspace; warning: string | null; canSave: boolean; migratedFromLegacy?: boolean }

export function loadWorkspace(storage: Storage, now = new Date()): LoadResult {
  try {
    const current = storage.getItem(STORAGE_KEY)
    const raw = current ?? storage.getItem(LEGACY_STORAGE_KEY)
    if (raw === null) return { workspace: createDemoWorkspace(now), warning: null, canSave: true }
    const workspace = decodeWorkspace(JSON.parse(raw) as unknown)
    if (!workspace) throw new Error('Invalid workspace')
    return { workspace: pruneExcluded(workspace, now), warning: null, canSave: true, migratedFromLegacy: current === null }
  } catch {
    // Preserve unreadable data before a clean workspace is ever written over it.
    try {
      const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY)
      if (raw !== null) storage.setItem(RECOVERY_KEY, raw)
      return { workspace: createEmptyWorkspace(now), warning: 'Saved data could not be read. A recovery copy was kept in this browser; restore a backup if you have one.', canSave: true }
    } catch {
      return { workspace: createEmptyWorkspace(now), warning: 'Browser storage is unavailable. Changes may not be saved; export a backup before leaving.', canSave: false }
    }
  }
}

export function parseBackup(raw: string): Workspace | null {
  try { return decodeWorkspace(JSON.parse(raw) as unknown) } catch { return null }
}

/** Storage boundary: another repository (IndexedDB or a shared API) can implement this contract. */
export interface WorkspaceRepository {
  load(now?: Date): LoadResult
  save(workspace: Workspace): void
}

export function createLocalWorkspaceRepository(storage: Storage): WorkspaceRepository {
  let migratedFromLegacy = false
  return {
    load: now => {
      const result = loadWorkspace(storage, now)
      migratedFromLegacy = !!result.migratedFromLegacy
      return result
    },
    save: workspace => {
      // Only remove a successfully read old copy after the upgraded workspace has been saved.
      storage.setItem(STORAGE_KEY, JSON.stringify(workspace))
      if (migratedFromLegacy) {
        storage.removeItem(LEGACY_STORAGE_KEY)
        migratedFromLegacy = false
      }
    },
  }
}
