import { exclusionReason } from './import'
import { referralRewardCents } from './money'
import { isInMonth } from './month'
import { createQueueIndex, readiness, type QueueIndex, type Readiness } from './queue'
import { makeId, type Lead, type Referral, type ReferralPayment, type Referrer, type Sale, type Workspace } from './types'

export type ReferralStatus = 'needs_link' | 'not_in_list' | 'age_review' | 'excluded' | 'not_interested' | 'sale_missing'
  | 'awaiting_sale' | 'credit_vetting' | 'pending_confirmation' | 'declined' | 'needs_price' | 'ready' | 'paid' | 'paid_review'

export interface ReferralState {
  referral: Referral
  referrer: Referrer
  sale: Sale | undefined
  lead: Lead | undefined
  leadReadiness: Readiness | undefined
  status: ReferralStatus
  /** Only an activated, priced, unpaid referral has a payable amount. */
  dueCents: number
  payment: ReferralPayment | undefined
}

/** A declined attempt must not hide a newer open or completed sale for the same customer. */
export function referralSale(workspace: Workspace, referral: Referral): Sale | undefined {
  if (!referral.accountNumber) return undefined
  const sales = workspace.sales.filter(sale => sale.lead.accountNumber === referral.accountNumber)
  const newest = (items: Sale[]) => [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return newest(sales.filter(sale => sale.stage !== 'declined')) ?? newest(sales)
}

export function activePayment(referral: Referral): ReferralPayment | undefined {
  return referral.payments.find(payment => payment.voidedAt === null)
}

export interface PaymentReviewComparison {
  currentRewardCents: number
  paidCents: number
  /** Positive means a possible shortfall; negative means a possible overpayment. */
  differenceCents: number
}

/** Compare only the activation recorded in the payment snapshot. This does not create an amount due. */
export function paymentReviewComparison(state: ReferralState): PaymentReviewComparison | null {
  const { referral, sale, payment, status } = state
  if (status !== 'paid_review' || !payment || !sale || sale.id !== payment.saleId
    || sale.stage !== 'activated' || sale.activatedAt !== payment.activatedAt
    || referral.accountNumber !== payment.accountNumber || sale.lead.accountNumber !== payment.accountNumber
    || sale.packagePriceCents === null) return null
  const currentRewardCents = referralRewardCents(sale.packagePriceCents)
  if (currentRewardCents === null) return null
  return { currentRewardCents, paidCents: payment.amountCents, differenceCents: currentRewardCents - payment.amountCents }
}

export interface ReferralIndex {
  referrers: Map<string, Referrer>
  sales: Map<string, Sale>
  leads: Map<string, Lead>
  queue: QueueIndex
}

/** Build once for a list so large workspaces don't rescan every sale and lead per referral. */
export function createReferralIndex(workspace: Workspace): ReferralIndex {
  const sales = new Map<string, Sale>()
  for (const sale of workspace.sales) {
    const account = sale.lead.accountNumber
    const previous = sales.get(account)
    if (!previous || (previous.stage === 'declined' && sale.stage !== 'declined')
      || ((previous.stage === 'declined') === (sale.stage === 'declined') && sale.updatedAt > previous.updatedAt)) sales.set(account, sale)
  }
  const leads = new Map(workspace.leads.map(lead => [lead.accountNumber, lead]))
  for (const callback of workspace.callbacks) if (!leads.has(callback.lead.accountNumber)) leads.set(callback.lead.accountNumber, callback.lead)
  return { sales, leads, referrers: new Map(workspace.referrers.map(referrer => [referrer.id, referrer])), queue: createQueueIndex(workspace) }
}

/** Derive eligibility from the current sale, never from a manual referral status. */
export function referralState(workspace: Workspace, referral: Referral, now: Date, index?: ReferralIndex): ReferralState {
  const referrer = (index ? index.referrers.get(referral.referrerId) : workspace.referrers.find(item => item.id === referral.referrerId))!
  const account = referral.accountNumber
  const sale = index ? (account ? index.sales.get(account) : undefined) : referralSale(workspace, referral)
  const lead = account ? (index ? index.leads.get(account) : workspace.leads.find(item => item.accountNumber === account)
    ?? workspace.callbacks.find(item => item.lead.accountNumber === account)?.lead) ?? sale?.lead : undefined
  const payment = activePayment(referral)
  const base = { referral, referrer, sale, lead, leadReadiness: undefined as Readiness | undefined, payment, dueCents: 0 }

  if (payment) {
    // Keep what was actually paid even if the underlying activation is changed or deleted.
    const matches = sale?.id === payment.saleId && sale.stage === 'activated'
      && sale.activatedAt === payment.activatedAt && sale.packagePriceCents === payment.packagePriceCents
      && sale.packageName === payment.packageName && referral.accountNumber === payment.accountNumber
    return { ...base, status: matches ? 'paid' : 'paid_review' }
  }
  if (!referral.accountNumber) return { ...base, status: 'needs_link' }
  if (sale) {
    if (sale.stage === 'credit_vetting' || sale.stage === 'pending_confirmation' || sale.stage === 'declined') return { ...base, status: sale.stage }
    if (sale.packagePriceCents === null) return { ...base, status: 'needs_price' }
    const reward = referralRewardCents(sale.packagePriceCents)
    return reward === null ? { ...base, status: 'needs_price' } : { ...base, status: 'ready', dueCents: reward }
  }
  const profile = workspace.profiles[referral.accountNumber]
  if (profile?.excludedReason) return { ...base, status: 'excluded' }
  if (profile?.doNotCall) return { ...base, status: 'not_interested' }
  if (!lead) return { ...base, status: 'not_in_list' }
  const leadState = readiness(workspace, lead, now, index?.queue)
  if (leadState === 'age_review' || leadState === 'excluded' || leadState === 'not_interested') return { ...base, leadReadiness: leadState, status: leadState }
  if (leadState === 'sale_recorded') return { ...base, leadReadiness: leadState, status: 'sale_missing' }
  return { ...base, leadReadiness: leadState, status: 'awaiting_sale' }
}

export interface ReferralDetails {
  referrerId: string
  customerName: string
  customerContact: string
  accountNumber: string | null
}

const validName = (value: string) => !!value.trim() && value.trim().length <= 120
const validContact = (value: string) => value.trim().length <= 160

export const MAX_REFERRER_NOTE = 400

export interface ReferrerDetails {
  name: string
  contact: string
  note: string
}

const validNote = (value: string) => value.trim().length <= MAX_REFERRER_NOTE

/** Accepts the richer details object, and still the older (name, contact, now) call shape. */
export function addReferrer(workspace: Workspace, input: ReferrerDetails | string, contactOrNow: string | Date, maybeNow?: Date): Workspace {
  const resolved: ReferrerDetails = typeof input === 'string'
    ? { name: input, contact: contactOrNow as string, note: '' }
    : input
  const now = (typeof input === 'string' ? maybeNow : contactOrNow) as Date
  if (!validName(resolved.name) || !validContact(resolved.contact) || !validNote(resolved.note)) return workspace
  const referrer: Referrer = {
    id: makeId(), name: resolved.name.trim(), contact: resolved.contact.trim(), note: resolved.note.trim(),
    createdAt: now.toISOString(), archivedAt: null,
  }
  return { ...workspace, referrers: [...workspace.referrers, referrer] }
}

export function editReferrer(workspace: Workspace, id: string, details: ReferrerDetails | string, contact?: string): Workspace {
  const target = workspace.referrers.find(referrer => referrer.id === id)
  if (!target) return workspace
  const resolved: ReferrerDetails = typeof details === 'string'
    ? { name: details, contact: contact ?? '', note: target.note }
    : details
  if (!validName(resolved.name) || !validContact(resolved.contact) || !validNote(resolved.note)) return workspace
  return { ...workspace, referrers: workspace.referrers.map(referrer => referrer.id === id ? {
    ...referrer, name: resolved.name.trim(), contact: resolved.contact.trim(), note: resolved.note.trim(),
  } : referrer) }
}

/** Hiding a referrer keeps every referral and payment; it is a view, not a deletion. */
export function setReferrerArchived(workspace: Workspace, id: string, archived: boolean, now: Date): Workspace {
  const target = workspace.referrers.find(referrer => referrer.id === id)
  if (!target || (target.archivedAt !== null) === archived) return workspace
  return { ...workspace, referrers: workspace.referrers.map(referrer => referrer.id === id ? { ...referrer, archivedAt: archived ? now.toISOString() : null } : referrer) }
}

export function removeReferrer(workspace: Workspace, id: string): Workspace {
  if (workspace.referrals.some(referral => referral.referrerId === id) || !workspace.referrers.some(referrer => referrer.id === id)) return workspace
  return { ...workspace, referrers: workspace.referrers.filter(referrer => referrer.id !== id) }
}

export interface ReferrerSummary {
  referrer: Referrer
  /** Referrals attributed to this person, all time. */
  referrals: number
  /** Referrals not yet paid or closed. */
  inProgress: number
  awaitingActivation: number
  readyToPay: number
  dueCents: number
  /** Rewards earned by activations in the selected month. */
  earnedThisMonthCents: number
  earnedThisMonthCount: number
  paidThisMonthCents: number
  paidThisMonthCount: number
  paidToDateCents: number
  paidToDateCount: number
  /** Money paid against an activation that has since changed and needs a look. */
  reviewCount: number
  lastPaidAt: string | null
  lastReferralAt: string | null
}

/**
 * One pass over every referral produces both the tracker rows and the per-person
 * ledger, so totals and rows are always derived from the same state.
 */
export function referrerLedger(workspace: Workspace, states: ReferralState[], month: Date): ReferrerSummary[] {
  const summaries = new Map<string, ReferrerSummary>()
  const reserve = (referrer: Referrer) => summaries.get(referrer.id) ?? {
    referrer, referrals: 0, inProgress: 0, awaitingActivation: 0, readyToPay: 0, dueCents: 0,
    earnedThisMonthCents: 0, earnedThisMonthCount: 0, paidThisMonthCents: 0, paidThisMonthCount: 0,
    paidToDateCents: 0, paidToDateCount: 0, reviewCount: 0, lastPaidAt: null, lastReferralAt: null,
  }
  for (const referrer of workspace.referrers) summaries.set(referrer.id, reserve(referrer))
  for (const state of states) {
    const entry = reserve(state.referrer)
    summaries.set(state.referrer.id, entry)
    entry.referrals++
    if (entry.lastReferralAt === null || state.referral.createdAt > entry.lastReferralAt) entry.lastReferralAt = state.referral.createdAt
    if (!['ready', 'paid', 'paid_review', 'declined'].includes(state.status)) entry.inProgress++
    if (['awaiting_sale', 'not_in_list', 'age_review', 'needs_link', 'excluded', 'not_interested', 'sale_missing'].includes(state.status)) entry.awaitingActivation++
    if (state.status === 'ready') { entry.readyToPay++; entry.dueCents += state.dueCents }
    if (state.status === 'paid_review') entry.reviewCount++
    // Money earned in the month, whether or not it has been paid yet.
    if (state.sale?.stage === 'activated' && state.sale.packagePriceCents !== null
      && isInMonth(state.sale.activatedAt, month)) {
      const reward = referralRewardCents(state.sale.packagePriceCents)
      if (reward !== null) { entry.earnedThisMonthCents += reward; entry.earnedThisMonthCount++ }
    }
    for (const payment of state.referral.payments) {
      if (payment.voidedAt !== null) continue
      entry.paidToDateCents += payment.amountCents
      entry.paidToDateCount++
      if (entry.lastPaidAt === null || payment.paidAt > entry.lastPaidAt) entry.lastPaidAt = payment.paidAt
      if (isInMonth(payment.paidAt, month)) { entry.paidThisMonthCents += payment.amountCents; entry.paidThisMonthCount++ }
    }
  }
  return [...summaries.values()].sort((a, b) => {
    if (a.referrer.archivedAt !== b.referrer.archivedAt) return a.referrer.archivedAt ? 1 : -1
    return b.dueCents - a.dueCents
      || b.earnedThisMonthCents - a.earnedThisMonthCents
      || b.paidToDateCents - a.paidToDateCents
      || a.referrer.name.localeCompare(b.referrer.name)
  })
}

export interface ReferrerActivity {
  kind: 'referral' | 'ready' | 'paid' | 'review'
  at: string
  referral: Referral
  amountCents: number
}

/** A short, honest timeline for one person: what came in, what became payable, what was paid. */
export function referrerActivity(states: ReferralState[], limit = 6): ReferrerActivity[] {
  const events: ReferrerActivity[] = []
  for (const state of states) {
    events.push({ kind: 'referral', at: state.referral.createdAt, referral: state.referral, amountCents: 0 })
    if (state.sale?.stage === 'activated' && state.sale.activatedAt) {
      events.push({ kind: state.status === 'paid_review' ? 'review' : 'ready', at: state.sale.activatedAt, referral: state.referral, amountCents: state.status === 'paid' ? 0 : state.dueCents })
    }
    for (const payment of state.referral.payments) {
      if (payment.voidedAt !== null) continue
      events.push({ kind: 'paid', at: payment.paidAt, referral: state.referral, amountCents: payment.amountCents })
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

export interface LedgerTotals {
  dueCents: number
  dueCount: number
  earnedThisMonthCents: number
  paidThisMonthCents: number
  paidThisMonthCount: number
  paidToDateCents: number
  openReferrals: number
  reviewCount: number
  peopleOwed: number
  activeReferrers: number
}

export function ledgerTotals(summaries: ReferrerSummary[]): LedgerTotals {
  const totals: LedgerTotals = {
    dueCents: 0, dueCount: 0, earnedThisMonthCents: 0, paidThisMonthCents: 0, paidThisMonthCount: 0,
    paidToDateCents: 0, openReferrals: 0, reviewCount: 0, peopleOwed: 0, activeReferrers: 0,
  }
  for (const summary of summaries) {
    totals.dueCents += summary.dueCents
    totals.dueCount += summary.readyToPay
    totals.earnedThisMonthCents += summary.earnedThisMonthCents
    totals.paidThisMonthCents += summary.paidThisMonthCents
    totals.paidThisMonthCount += summary.paidThisMonthCount
    totals.paidToDateCents += summary.paidToDateCents
    totals.openReferrals += summary.inProgress
    totals.reviewCount += summary.reviewCount
    if (summary.dueCents > 0) totals.peopleOwed++
    if (!summary.referrer.archivedAt && summary.referrals > 0) totals.activeReferrers++
  }
  return totals
}

/** One attributed referral per account. Name-only referrals can be linked later. */
export function saveReferral(workspace: Workspace, details: ReferralDetails, now: Date, id?: string): Workspace {
  const previous = id ? workspace.referrals.find(referral => referral.id === id) : undefined
  const accountNumber = details.accountNumber?.trim().toUpperCase() || null
  if ((id && !previous) || !workspace.referrers.some(referrer => referrer.id === details.referrerId)
    || !validName(details.customerName) || !validContact(details.customerContact)
    || (accountNumber !== null && !/^5-\d+$/.test(accountNumber))
    || (accountNumber !== null && workspace.referrals.some(referral => referral.id !== id && referral.accountNumber === accountNumber))) return workspace
  // A recorded payment cannot be silently reassigned. Corrected snapshots retain their original identity.
  if (previous && activePayment(previous) && (previous.referrerId !== details.referrerId || previous.accountNumber !== accountNumber)) return workspace
  const referral: Referral = {
    id: previous?.id ?? makeId(), referrerId: details.referrerId, customerName: details.customerName.trim(),
    customerContact: details.customerContact.trim(), accountNumber, createdAt: previous?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(), payments: previous?.payments ?? [],
  }
  return { ...workspace, referrals: previous ? workspace.referrals.map(item => item.id === id ? referral : item) : [referral, ...workspace.referrals] }
}

export function removeReferral(workspace: Workspace, id: string): Workspace {
  const referral = workspace.referrals.find(item => item.id === id)
  // Avoid losing financial history or making the same customer payable again by mistake.
  if (!referral || referral.payments.length) return workspace
  return { ...workspace, referrals: workspace.referrals.filter(item => item.id !== id) }
}

/** Put a referred customer in the normal queue, never bypassing age or contact protections. */
export function addReferralToLeads(workspace: Workspace, id: string, now: Date): Workspace {
  const referral = workspace.referrals.find(item => item.id === id)
  const account = referral?.accountNumber
  if (!referral || !account || workspace.leads.some(lead => lead.accountNumber === account)
    || workspace.sales.some(sale => sale.lead.accountNumber === account)
    || workspace.profiles[account]?.excludedReason || workspace.profiles[account]?.doNotCall) return workspace
  const existing = workspace.callbacks.find(callback => callback.lead.accountNumber === account)?.lead
  const lead: Lead = existing ?? {
    accountNumber: account, name: referral.customerName, customerId: '', sourceStatus: 'Unknown',
    listDate: null, importedAt: now.toISOString(), ageVerified: false,
  }
  if (exclusionReason(lead, now)) return workspace
  return { ...workspace, leads: [...workspace.leads, lead] }
}

export interface PaymentExpectation {
  referrerId: string
  referrerName: string
  referrerContact: string
  customerName: string
  accountNumber: string
  saleId: string
  activatedAt: string
  packageName: string
  packagePriceCents: number
  amountCents: number
}

/** Record a manual payment once, rechecking the facts shown in the confirmation dialog. */
export function markReferralPaid(workspace: Workspace, id: string, now: Date, expected?: PaymentExpectation): Workspace {
  const referral = workspace.referrals.find(item => item.id === id)
  if (!referral) return workspace
  const state = referralState(workspace, referral, now)
  const sale = state.sale
  if (state.status !== 'ready' || !sale || sale.packagePriceCents === null || !sale.activatedAt || !referral.accountNumber) return workspace
  if (expected && (expected.referrerId !== referral.referrerId || expected.referrerName !== state.referrer.name
    || expected.referrerContact !== state.referrer.contact || expected.customerName !== referral.customerName
    || expected.accountNumber !== referral.accountNumber || expected.saleId !== sale.id
    || expected.activatedAt !== sale.activatedAt || expected.packageName !== sale.packageName
    || expected.packagePriceCents !== sale.packagePriceCents || expected.amountCents !== state.dueCents)) return workspace
  const payment: ReferralPayment = {
    id: makeId(), paidAt: now.toISOString(), voidedAt: null, saleId: sale.id, accountNumber: referral.accountNumber,
    customerName: referral.customerName, referrerName: state.referrer.name, packageName: sale.packageName,
    packagePriceCents: sale.packagePriceCents, activatedAt: sale.activatedAt, amountCents: state.dueCents,
  }
  return { ...workspace, referrals: workspace.referrals.map(item => item.id === id ? { ...item, updatedAt: now.toISOString(), payments: [...item.payments, payment] } : item) }
}

/** Correct an erroneous mark only; this does not reverse a real-world transfer. */
export function voidReferralPayment(workspace: Workspace, referralId: string, paymentId: string, now: Date): Workspace {
  const referral = workspace.referrals.find(item => item.id === referralId)
  if (!referral || !referral.payments.some(payment => payment.id === paymentId && payment.voidedAt === null)) return workspace
  return { ...workspace, referrals: workspace.referrals.map(item => item.id === referralId ? {
    ...item, updatedAt: now.toISOString(), payments: item.payments.map(payment => payment.id === paymentId ? { ...payment, voidedAt: now.toISOString() } : payment),
  } : item) }
}
