import { exclusionReason, type ImportPreview } from './import'
import { RETRY_DELAY_MS } from './queue'
import { emptyProfile, makeId, type ActivationType, type Activity, type CallOutcome, type Callback, type ClearCategory, type CustomerProfile, type Lead, type Sale, type SaleStage, type Workspace } from './types'

export function createEmptyWorkspace(now = new Date()): Workspace {
  return {
    version: 1, isDemo: false, createdAt: now.toISOString(), deviceSeed: makeId(),
    leads: [], profiles: {}, callbacks: [], sales: [], activity: [], packages: [],
    settings: { autoCopy: true },
  }
}

function withProfile(workspace: Workspace, account: string, update: (profile: CustomerProfile) => CustomerProfile): Workspace {
  const profile = workspace.profiles[account] ?? emptyProfile()
  return { ...workspace, profiles: { ...workspace.profiles, [account]: update(profile) } }
}

function addActivity(workspace: Workspace, lead: Lead, description: string, now: Date): Workspace {
  const event: Activity = { id: makeId(), at: now.toISOString(), accountNumber: lead.accountNumber, name: lead.name, description }
  return { ...workspace, activity: [event, ...workspace.activity].slice(0, 300) }
}

function addAttempt(workspace: Workspace, lead: Lead, outcome: CallOutcome, now: Date): Workspace {
  return withProfile(workspace, lead.accountNumber, profile => {
    // A call logged in the same millisecond as a reset must still count.
    const reset = profile.queueResetAt ? new Date(profile.queueResetAt).getTime() : -Infinity
    const at = new Date(Math.max(now.getTime(), reset + 1)).toISOString()
    return { ...profile, attempts: [...profile.attempts, { id: makeId(), at, outcome }] }
  })
}

export function saveNotes(workspace: Workspace, account: string, notes: string): Workspace {
  return withProfile(workspace, account, profile => ({ ...profile, notes }))
}

export function applyImport(workspace: Workspace, preview: ImportPreview, mode: 'replace' | 'append', now: Date): Workspace {
  // The first real import must never mingle with the illustrative sample workspace.
  const base = workspace.isDemo ? { ...createEmptyWorkspace(now), deviceSeed: workspace.deviceSeed, settings: workspace.settings } : workspace
  const excludedAccounts = new Set(preview.excluded.map(item => item.lead.accountNumber))
  const list = new Map<string, Lead>()
  if (mode === 'append') {
    for (const lead of base.leads) if (!excludedAccounts.has(lead.accountNumber)) list.set(lead.accountNumber, lead)
  }
  for (const lead of preview.leads) list.set(lead.accountNumber, lead)
  const profiles = { ...base.profiles }
  for (const item of preview.excluded) {
    const account = item.lead.accountNumber
    profiles[account] = { ...(profiles[account] ?? emptyProfile()), excludedReason: item.reason }
  }
  for (const lead of preview.leads) {
    // A later eligible CRM row can supersede an old Active/Archived status.
    const profile = profiles[lead.accountNumber]
    if (profile?.excludedReason) profiles[lead.accountNumber] = { ...profile, excludedReason: null }
  }
  return {
    ...base, profiles,
    leads: [...list.values()],
    callbacks: base.callbacks.filter(callback => !excludedAccounts.has(callback.lead.accountNumber)),
  }
}

/** Remove newly ineligible leads and callbacks, e.g. when a customer's 60th birthday arrives. */
export function pruneExcluded(workspace: Workspace, now: Date): Workspace {
  const excluded = new Map<string, NonNullable<ReturnType<typeof exclusionReason>>>()
  for (const lead of [...workspace.leads, ...workspace.callbacks.map(callback => callback.lead)]) {
    const reason = exclusionReason(lead, now)
    if (reason) excluded.set(lead.accountNumber, reason)
  }
  if (!excluded.size) return workspace
  const profiles = { ...workspace.profiles }
  for (const [account, reason] of excluded) {
    profiles[account] = { ...(profiles[account] ?? emptyProfile()), excludedReason: reason }
  }
  return {
    ...workspace, profiles,
    leads: workspace.leads.filter(lead => !excluded.has(lead.accountNumber)),
    callbacks: workspace.callbacks.filter(callback => !excluded.has(callback.lead.accountNumber)),
  }
}

export function verifyAge(workspace: Workspace, account: string): Workspace {
  return {
    ...workspace,
    leads: workspace.leads.map(lead => lead.accountNumber === account ? { ...lead, ageVerified: true } : lead),
    callbacks: workspace.callbacks.map(callback => callback.lead.accountNumber === account ? { ...callback, lead: { ...callback.lead, ageVerified: true } } : callback),
  }
}

export function resetToQueue(workspace: Workspace, account: string, now: Date): Workspace {
  return withProfile(workspace, account, profile => {
    // Also cover an earlier attempt whose clock was ahead of the current device time.
    const latest = profile.attempts.reduce((time, attempt) => Math.max(time, new Date(attempt.at).getTime()), now.getTime())
    return { ...profile, doNotCall: false, queueResetAt: new Date(latest).toISOString() }
  })
}

export function recordNoAnswer(workspace: Workspace, lead: Lead, now: Date): Workspace {
  let next = addAttempt(workspace, lead, 'no_answer', now)
  next = {
    ...next,
    callbacks: next.callbacks.map(callback => callback.lead.accountNumber === lead.accountNumber
      ? { ...callback, dueAt: new Date(now.getTime() + RETRY_DELAY_MS).toISOString() }
      : callback),
  }
  return addActivity(next, lead, 'No answer · retry spaced out', now)
}

export function recordNotInterested(workspace: Workspace, lead: Lead, now: Date): Workspace {
  let next = addAttempt(workspace, lead, 'not_interested', now)
  next = withProfile(next, lead.accountNumber, profile => ({ ...profile, doNotCall: true }))
  next = { ...next, callbacks: next.callbacks.filter(callback => callback.lead.accountNumber !== lead.accountNumber) }
  return addActivity(next, lead, 'Not interested · removed from queue', now)
}

export function saveCallback(workspace: Workspace, lead: Lead, dueAt: string, note: string, now: Date, recordCall = true): Workspace {
  if (Number.isNaN(new Date(dueAt).getTime())) return workspace
  const previous = workspace.callbacks.find(callback => callback.lead.accountNumber === lead.accountNumber)
  const callback: Callback = {
    id: previous?.id ?? makeId(), lead, dueAt: new Date(dueAt).toISOString(), note: note.trim(), createdAt: previous?.createdAt ?? now.toISOString(),
  }
  let next = recordCall ? addAttempt(workspace, lead, 'callback', now) : workspace
  next = { ...next, callbacks: [...next.callbacks.filter(item => item.lead.accountNumber !== lead.accountNumber), callback] }
  return addActivity(next, lead, recordCall ? 'Callback scheduled' : 'Callback updated', now)
}

function addPackage(packages: string[], name: string): string[] {
  return packages.some(item => item.toLowerCase() === name.toLowerCase()) ? packages : [...packages, name]
}

export function recordSale(workspace: Workspace, lead: Lead, packageName: string, activationType: ActivationType, now: Date): Workspace {
  const trimmed = packageName.trim()
  if (!trimmed || (activationType !== 'ATT' && activationType !== 'Non-ATT')) return workspace
  // One open or completed sale per account prevents accidental double counting.
  if (workspace.sales.some(sale => sale.lead.accountNumber === lead.accountNumber && sale.stage !== 'declined')) return workspace
  const sale: Sale = {
    id: makeId(), lead, packageName: trimmed, activationType, stage: 'credit_vetting',
    createdAt: now.toISOString(), updatedAt: now.toISOString(), activatedAt: null,
  }
  let next = addAttempt(workspace, lead, 'sale', now)
  next = {
    ...next,
    sales: [sale, ...next.sales],
    callbacks: next.callbacks.filter(callback => callback.lead.accountNumber !== lead.accountNumber),
    packages: addPackage(next.packages, trimmed),
  }
  return addActivity(next, lead, 'Sale recorded · credit vetting', now)
}

const transitions: Record<SaleStage, SaleStage[]> = {
  credit_vetting: ['pending_confirmation', 'declined'],
  pending_confirmation: ['activated', 'credit_vetting'],
  activated: ['pending_confirmation'],
  declined: ['credit_vetting'],
}

export function updateSaleStage(workspace: Workspace, saleId: string, stage: SaleStage, now: Date): Workspace {
  const sale = workspace.sales.find(item => item.id === saleId)
  if (!sale || !transitions[sale.stage].includes(stage)) return workspace
  // Reopening a declined record must not create two simultaneous sales for one account.
  if (stage === 'credit_vetting' && workspace.sales.some(item => item.id !== saleId && item.lead.accountNumber === sale.lead.accountNumber && item.stage !== 'declined')) return workspace
  const descriptions: Record<SaleStage, string> = {
    credit_vetting: 'Moved to credit vetting', pending_confirmation: 'Vetting approved · awaiting confirmation',
    activated: 'Activation completed', declined: 'Credit vetting declined',
  }
  const updated: Sale = { ...sale, stage, updatedAt: now.toISOString(), activatedAt: stage === 'activated' ? now.toISOString() : null }
  return addActivity({ ...workspace, sales: workspace.sales.map(item => item.id === saleId ? updated : item) }, sale.lead, descriptions[stage], now)
}

export function editSale(workspace: Workspace, saleId: string, packageName: string, activationType: ActivationType, now: Date): Workspace {
  const trimmed = packageName.trim()
  if (!trimmed || (activationType !== 'ATT' && activationType !== 'Non-ATT') || !workspace.sales.some(sale => sale.id === saleId)) return workspace
  return {
    ...workspace,
    sales: workspace.sales.map(sale => sale.id === saleId ? { ...sale, packageName: trimmed, activationType, updatedAt: now.toISOString() } : sale),
    packages: addPackage(workspace.packages, trimmed),
  }
}

export function removeLead(workspace: Workspace, account: string): Workspace {
  return { ...workspace, leads: workspace.leads.filter(lead => lead.accountNumber !== account) }
}
export function removeCallback(workspace: Workspace, id: string): Workspace {
  return { ...workspace, callbacks: workspace.callbacks.filter(callback => callback.id !== id) }
}
export function removeSale(workspace: Workspace, id: string): Workspace {
  return { ...workspace, sales: workspace.sales.filter(sale => sale.id !== id) }
}

export function clearCategory(workspace: Workspace, category: ClearCategory): Workspace {
  switch (category) {
    case 'leads': return { ...workspace, leads: [] }
    case 'callbacks': return { ...workspace, callbacks: [] }
    case 'pipeline': return { ...workspace, sales: workspace.sales.filter(sale => sale.stage === 'activated') }
    case 'activations': return { ...workspace, sales: workspace.sales.filter(sale => sale.stage !== 'activated') }
    case 'history': return { ...workspace, profiles: {}, activity: [] }
  }
}
