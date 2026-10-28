export type ExclusionReason = 'active' | 'archived' | 'age_60_plus'
export type CallOutcome = 'no_answer' | 'not_interested' | 'callback' | 'sale'
export type SaleStage = 'credit_vetting' | 'pending_confirmation' | 'activated' | 'declined'
export type ActivationType = 'ATT' | 'Non-ATT'

/** A lead is a snapshot of one row in the daily calling list. */
export interface Lead {
  accountNumber: string
  name: string
  customerId: string
  sourceStatus: string
  listDate: string | null
  importedAt: string
  /** Only applies to a row whose age cannot be read from its ID. */
  ageVerified: boolean
}

export interface CallAttempt {
  id: string
  at: string
  outcome: CallOutcome
}

/** Kept independently of the daily lead list, keyed by account number. */
export interface CustomerProfile {
  notes: string
  attempts: CallAttempt[]
  doNotCall: boolean
  excludedReason: ExclusionReason | null
  /** Older attempts remain visible but no longer hold a lead out of the queue. */
  queueResetAt: string | null
}

export interface Callback {
  id: string
  lead: Lead
  dueAt: string
  note: string
  createdAt: string
}

export interface Sale {
  id: string
  lead: Lead
  packageName: string
  /**
   * Only known once the sale has actually activated. It stays null through credit
   * vetting and confirmation, because the ATT/non-ATT split is a result, not a guess.
   */
  activationType: ActivationType | null
  stage: SaleStage
  createdAt: string
  updatedAt: string
  activatedAt: string | null
}

export interface Activity {
  id: string
  at: string
  accountNumber: string
  name: string
  description: string
}

export interface Workspace {
  version: 1
  isDemo: boolean
  createdAt: string
  deviceSeed: string
  leads: Lead[]
  profiles: Record<string, CustomerProfile>
  callbacks: Callback[]
  sales: Sale[]
  activity: Activity[]
  packages: string[]
  settings: {
    autoCopy: boolean
  }
}

export type ClearCategory = 'leads' | 'callbacks' | 'pipeline' | 'activations' | 'history'
export type View = 'overview' | 'leads' | 'callbacks' | 'pipeline' | 'activations' | 'insights' | 'settings'

export function makeId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

export function emptyProfile(): CustomerProfile {
  return { notes: '', attempts: [], doNotCall: false, excludedReason: null, queueResetAt: null }
}
