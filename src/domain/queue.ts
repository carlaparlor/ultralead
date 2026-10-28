import { isSameLocalDay, localDayKey } from './dates'
import { exclusionReason, needsAgeReview } from './import'
import type { Callback, CallAttempt, Lead, Workspace } from './types'

export const RETRY_DELAY_MS = 2 * 60 * 60 * 1000
export const DAILY_NO_ANSWER_LIMIT = 3

export type Readiness = 'ready' | 'callback_due' | 'callback_scheduled' | 'age_review' | 'excluded' | 'not_interested' | 'in_pipeline' | 'sale_recorded' | 'cooldown' | 'daily_limit'

export interface QueueItem {
  lead: Lead
  callback: Callback | null
  attemptsToday: number
}

export function effectiveAttempts(workspace: Workspace, account: string): CallAttempt[] {
  const profile = workspace.profiles[account]
  if (!profile) return []
  const reset = profile.queueResetAt ? new Date(profile.queueResetAt).getTime() : -Infinity
  return profile.attempts.filter(attempt => new Date(attempt.at).getTime() > reset)
}

export function attemptsToday(workspace: Workspace, account: string, now: Date): number {
  return effectiveAttempts(workspace, account).filter(attempt => isSameLocalDay(new Date(attempt.at), now)).length
}

export interface QueueIndex {
  callbacks: Map<string, Callback>
  sales: Map<string, 'in_pipeline' | 'sale_recorded'>
}

/** Build once when rendering a batch; avoids scanning every sale and callback for every lead. */
export function createQueueIndex(workspace: Workspace): QueueIndex {
  const callbacks = new Map<string, Callback>()
  const sales = new Map<string, 'in_pipeline' | 'sale_recorded'>()
  for (const callback of workspace.callbacks) if (!callbacks.has(callback.lead.accountNumber)) callbacks.set(callback.lead.accountNumber, callback)
  for (const sale of workspace.sales) {
    const account = sale.lead.accountNumber
    const state = sale.stage === 'credit_vetting' || sale.stage === 'pending_confirmation' ? 'in_pipeline' : 'sale_recorded'
    if (!sales.has(account) || state === 'in_pipeline') sales.set(account, state)
  }
  return { callbacks, sales }
}

export function readiness(workspace: Workspace, lead: Lead, now: Date, index?: QueueIndex): Readiness {
  const profile = workspace.profiles[lead.accountNumber]
  if (exclusionReason(lead, now) || profile?.excludedReason) return 'excluded'
  if (profile?.doNotCall) return 'not_interested'
  const saleState = index ? index.sales.get(lead.accountNumber) : createQueueIndex(workspace).sales.get(lead.accountNumber)
  if (saleState) return saleState

  const attempts = effectiveAttempts(workspace, lead.accountNumber)
  const last = attempts[attempts.length - 1]
  if (last?.outcome === 'sale') return 'sale_recorded'
  if (needsAgeReview(lead, now)) return 'age_review'
  const noAnswersToday = attempts.filter(attempt => attempt.outcome === 'no_answer' && isSameLocalDay(new Date(attempt.at), now)).length
  if (noAnswersToday >= DAILY_NO_ANSWER_LIMIT) return 'daily_limit'
  const callback = index ? index.callbacks.get(lead.accountNumber) : workspace.callbacks.find(item => item.lead.accountNumber === lead.accountNumber)
  if (callback) return new Date(callback.dueAt).getTime() <= now.getTime() ? 'callback_due' : 'callback_scheduled'
  if (last?.outcome === 'no_answer' && new Date(last.at).getTime() + RETRY_DELAY_MS > now.getTime()) return 'cooldown'
  return 'ready'
}

/** Small deterministic hash: unique workspace salt + local day avoids everyone starting at row one. */
export function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function getSmartQueue(workspace: Workspace, now: Date): QueueItem[] {
  const byAccount = new Map(workspace.leads.map(lead => [lead.accountNumber, lead]))
  const index = createQueueIndex(workspace)
  const due: QueueItem[] = []
  const dueAccounts = new Set<string>()
  for (const callback of workspace.callbacks) {
    const lead = byAccount.get(callback.lead.accountNumber) ?? callback.lead
    if (!dueAccounts.has(lead.accountNumber) && readiness(workspace, lead, now, index) === 'callback_due') {
      due.push({ lead, callback, attemptsToday: attemptsToday(workspace, lead.accountNumber, now) })
      dueAccounts.add(lead.accountNumber)
    }
  }
  due.sort((a, b) => new Date(a.callback!.dueAt).getTime() - new Date(b.callback!.dueAt).getTime() || a.lead.accountNumber.localeCompare(b.lead.accountNumber))
  const salt = `${workspace.deviceSeed}:${localDayKey(now)}:`
  const fresh = workspace.leads
    .filter(lead => !dueAccounts.has(lead.accountNumber) && readiness(workspace, lead, now, index) === 'ready')
    .map(lead => ({ lead, callback: null, attemptsToday: attemptsToday(workspace, lead.accountNumber, now) }))
    .sort((a, b) => a.attemptsToday - b.attemptsToday || hashString(salt + a.lead.accountNumber) - hashString(salt + b.lead.accountNumber) || a.lead.accountNumber.localeCompare(b.lead.accountNumber))
  return [...due, ...fresh]
}

export function findLead(workspace: Workspace, account: string): Lead | undefined {
  return workspace.leads.find(lead => lead.accountNumber === account)
    ?? workspace.callbacks.find(callback => callback.lead.accountNumber === account)?.lead
}
