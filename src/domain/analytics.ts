import { dayOfMonthLabel } from './dates'
import { referralRewardCents } from './money'
import { monthWindow, shiftMonth, startOfMonth, type MonthWindow } from './month'
import { createReferralIndex, referralState } from './referrals'
import type { CallOutcome, Sale, Workspace } from './types'

/**
 * The monthly review is deliberately narrow: what was sold and activated this
 * calendar month, what it is worth, and what you still owe a referrer. Everything
 * is derived from the same records the rest of the app writes, so two screens can
 * never disagree and nothing drifts out of date.
 */
export interface DayPoint {
  key: string
  /** Day of the month, 1-based. */
  day: number
  label: string
  calls: number
  noAnswer: number
  notInterested: number
  callback: number
  sale: number
  activations: number
}

export interface MonthTotals {
  calls: number
  reached: number
  contactRate: number
  customers: number
  sales: number
  salesValueCents: number
  unpricedSales: number
  activations: number
  activationValueCents: number
  /** Completed activations with no price, which can earn no reward and add no value. */
  unpricedActivations: number
  att: number
  nonAtt: number
  declined: number
  declinedValueCents: number
  openSales: number
  openValueCents: number
  daysToActivate: number | null
}

export interface MonthReview {
  window: MonthWindow
  hasActivity: boolean
  totals: MonthTotals
  /** Sales recorded divided by conversations reached. */
  conversionRate: number
  /** Completed activations divided by decided sales (activated + declined). */
  activationRate: number
  activeDays: number
  callsPerActiveDay: number
  bestDay: { day: number; label: string; calls: number } | null
  daily: DayPoint[]
  rewards: {
    /** Rewards that this month's activations will earn their referrer. */
    earnedCents: number
    /** Owed to a referrer right now, regardless of when it was earned. */
    dueCents: number
    dueCount: number
    /** Payments recorded in this month. */
    paidCents: number
    paidCount: number
  }
  /** The same span of the month before, so a half-finished month is never compared with a full one. */
  previous: MonthTotals
  /** Completed activations still needed to reach the optional monthly target. */
  target: { value: number; remaining: number; share: number } | null
}

const emptyTotals = (): MonthTotals => ({
  calls: 0, reached: 0, contactRate: 0, customers: 0, sales: 0, salesValueCents: 0, unpricedSales: 0,
  activations: 0, activationValueCents: 0, unpricedActivations: 0, att: 0, nonAtt: 0, declined: 0, declinedValueCents: 0,
  openSales: 0, openValueCents: 0, daysToActivate: null,
})

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)
const answeredOutcomes: CallOutcome[] = ['not_interested', 'callback', 'sale']

interface AttemptRow { account: string; at: string; outcome: CallOutcome }

function inSpan(value: string | null | undefined, from: Date, to: Date, inclusive = false): boolean {
  if (!value) return false
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return false
  return time >= from.getTime() && (inclusive ? time <= to.getTime() : time < to.getTime())
}

function attemptsIn(workspace: Workspace, from: Date, to: Date, inclusive = false): AttemptRow[] {
  const rows: AttemptRow[] = []
  for (const [account, profile] of Object.entries(workspace.profiles)) {
    for (const attempt of profile.attempts) if (inSpan(attempt.at, from, to, inclusive)) rows.push({ account, at: attempt.at, outcome: attempt.outcome })
  }
  return rows
}

function salesIn(workspace: Workspace, from: Date, to: Date, inclusive = false): Sale[] {
  return workspace.sales.filter(sale => inSpan(sale.createdAt, from, to, inclusive))
}

function activationsIn(workspace: Workspace, from: Date, to: Date, inclusive = false): Sale[] {
  return workspace.sales.filter(sale => sale.stage === 'activated' && inSpan(sale.activatedAt, from, to, inclusive))
}

const knownPrice = (sale: Sale) => (sale.packagePriceCents === null ? null : sale.packagePriceCents)
const sumPrices = (sales: Sale[]) => sales.reduce((total, sale) => total + (knownPrice(sale) ?? 0), 0)

function attemptTotals(rows: AttemptRow[]): { calls: number; reached: number; customers: number } {
  const customers = new Set<string>()
  let reached = 0
  for (const row of rows) {
    customers.add(row.account)
    if (answeredOutcomes.includes(row.outcome)) reached++
  }
  return { calls: rows.length, reached, customers: customers.size }
}

/** One month's numbers, all measured inside the window's span. */
function totalsIn(workspace: Workspace, window: MonthWindow): MonthTotals {
  const { start: from, end: to, endInclusive: inclusive } = window
  const totals = emptyTotals()
  const attemptRows = attemptsIn(workspace, from, to, inclusive)
  const attempts = attemptTotals(attemptRows)
  totals.calls = attempts.calls
  totals.reached = attempts.reached
  totals.customers = attempts.customers
  totals.contactRate = share(attempts.reached, attempts.calls)

  const recorded = salesIn(workspace, from, to, inclusive)
  totals.sales = recorded.length
  totals.salesValueCents = sumPrices(recorded)
  totals.unpricedSales = recorded.filter(sale => sale.packagePriceCents === null).length
  for (const sale of recorded) {
    if (sale.stage === 'declined') {
      totals.declined++
      totals.declinedValueCents += knownPrice(sale) ?? 0
    } else if (sale.stage !== 'activated') {
      // Still in vetting or awaiting confirmation: money that could still land.
      totals.openSales++
      totals.openValueCents += knownPrice(sale) ?? 0
    }
  }

  const activated = activationsIn(workspace, from, to, inclusive)
  totals.activations = activated.length
  totals.activationValueCents = sumPrices(activated)
  totals.unpricedActivations = activated.filter(sale => sale.packagePriceCents === null).length
  totals.att = activated.filter(sale => sale.activationType === 'ATT').length
  totals.nonAtt = activated.filter(sale => sale.activationType === 'Non-ATT').length

  const durations = activated
    .map(sale => (new Date(sale.activatedAt!).getTime() - new Date(sale.createdAt).getTime()) / 86_400_000)
    .filter(days => days >= 0)
  totals.daysToActivate = durations.length ? durations.reduce((total, days) => total + days, 0) / durations.length : null
  return totals
}

function dailyPoints(workspace: Workspace, window: MonthWindow, now: Date): DayPoint[] {
  const points: DayPoint[] = []
  const lastDay = window.isCurrent ? now.getDate() : window.days
  const rows = attemptsIn(workspace, window.start, window.end, window.endInclusive)
  for (let day = 1; day <= lastDay; day++) {
    points.push({ key: `${window.key}-${day}`, day, label: String(day), calls: 0, noAnswer: 0, notInterested: 0, callback: 0, sale: 0, activations: 0 })
  }
  const bucket = (value: string) => {
    const date = new Date(value)
    return points[date.getDate() - 1]
  }
  for (const row of rows) {
    const point = bucket(row.at)
    if (!point) continue
    point.calls++
    if (row.outcome === 'no_answer') point.noAnswer++
    else if (row.outcome === 'not_interested') point.notInterested++
    else if (row.outcome === 'callback') point.callback++
    else if (row.outcome === 'sale') point.sale++
  }
  for (const sale of workspace.sales) {
    if (sale.stage !== 'activated' || !sale.activatedAt || !inSpan(sale.activatedAt, window.start, window.end, window.endInclusive)) continue
    const point = bucket(sale.activatedAt)
    if (point) point.activations++
  }
  return points
}

/**
 * Referral money for a month, using the same derived states as the referrer ledger
 * so the two pages can never disagree about what is earned, owed or paid.
 */
function rewardTotals(workspace: Workspace, window: MonthWindow, now: Date) {
  const index = createReferralIndex(workspace)
  let earnedCents = 0
  let dueCents = 0
  let dueCount = 0
  let paidCents = 0
  let paidCount = 0
  for (const referral of workspace.referrals) {
    const state = referralState(workspace, referral, now, index)
    if (state.status === 'ready') {
      dueCents += state.dueCents
      dueCount++
    }
    // Money earned in the month, whether or not it has been paid yet.
    if (state.sale?.stage === 'activated' && state.sale.packagePriceCents !== null
      && inSpan(state.sale.activatedAt, window.start, window.end, window.endInclusive)) {
      const reward = referralRewardCents(state.sale.packagePriceCents)
      if (reward !== null) earnedCents += reward
    }
    for (const payment of referral.payments) {
      if (payment.voidedAt !== null || !inSpan(payment.paidAt, window.start, window.end, window.endInclusive)) continue
      paidCents += payment.amountCents
      paidCount++
    }
  }
  return { earnedCents, dueCents, dueCount, paidCents, paidCount }
}

export function reviewMonth(workspace: Workspace, anchor: Date, now: Date): MonthReview {
  const window = monthWindow(anchor, now)
  const totals = totalsIn(workspace, window)
  const daily = dailyPoints(workspace, window, now)
  const activeDays = daily.filter(point => point.calls > 0).length
  const best = daily.reduce<DayPoint | null>((best, point) => (point.calls > (best?.calls ?? 0) ? point : best), null)
  const decided = totals.activations + totals.declined
  // The comparison span is always a closed past stretch, so it is never inclusive at "now".
  const previous = totalsIn(workspace, { ...window, start: window.compareStart, end: window.compareEnd, endInclusive: false })
  const targetValue = workspace.settings.monthlyTarget ?? null
  const hasActivity = totals.calls > 0 || totals.sales > 0 || totals.activations > 0
    || workspace.referrals.some(referral => referral.payments.some(payment => inSpan(payment.paidAt, window.start, window.end, window.endInclusive)))
  return {
    window, hasActivity, totals,
    conversionRate: share(totals.sales, totals.reached),
    activationRate: share(totals.activations, decided),
    activeDays,
    callsPerActiveDay: activeDays ? totals.calls / activeDays : 0,
    bestDay: best ? { day: best.day, label: dayOfMonthLabel(best.day, window.start), calls: best.calls } : null,
    daily,
    rewards: rewardTotals(workspace, window, now),
    previous,
    target: targetValue === null || targetValue <= 0
      ? null
      : { value: targetValue, remaining: Math.max(0, targetValue - totals.activations), share: Math.min(1, totals.activations / targetValue) },
  }
}

export interface MonthOption { key: string; label: string; anchor: Date }

/** The current month plus the months before it that hold any recorded work. */
export function recentMonths(workspace: Workspace, now: Date, limit = 12): MonthOption[] {
  const earliest = earliestRecord(workspace)
  const months: MonthOption[] = []
  const thisMonth = startOfMonth(now)
  for (let index = 0; index < limit; index++) {
    const anchor = shiftMonth(thisMonth, -index)
    const next = shiftMonth(thisMonth, -index + 1)
    // Stop once a whole month lies before the first thing ever recorded.
    if (index > 0 && (earliest === null || earliest.getTime() >= next.getTime())) break
    months.push({ key: `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`, label: monthWindow(anchor, now).label, anchor })
  }
  return months
}

function earliestRecord(workspace: Workspace): Date | null {
  let earliest: Date | null = null
  const consider = (value: string | null | undefined) => {
    if (!value) return
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return
    if (!earliest || date.getTime() < earliest.getTime()) earliest = date
  }
  for (const profile of Object.values(workspace.profiles)) for (const attempt of profile.attempts) consider(attempt.at)
  for (const sale of workspace.sales) { consider(sale.createdAt); consider(sale.activatedAt) }
  for (const referral of workspace.referrals) for (const payment of referral.payments) consider(payment.paidAt)
  return earliest
}

/** Relative change between two months, rendered as a short note next to a figure. */
export function change(current: number, previous: number): { direction: 'up' | 'down' | 'flat'; text: string } {
  if (previous === 0 && current === 0) return { direction: 'flat', text: 'no change' }
  if (previous === 0) return { direction: 'up', text: 'new' }
  const delta = (current - previous) / previous
  if (Math.abs(delta) < 0.005) return { direction: 'flat', text: 'no change' }
  return { direction: delta > 0 ? 'up' : 'down', text: `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%` }
}

export function pointsChange(current: number, previous: number): { direction: 'up' | 'down' | 'flat'; text: string } {
  const delta = (current - previous) * 100
  if (Math.abs(delta) < 0.5) return { direction: 'flat', text: 'no change' }
  return { direction: delta > 0 ? 'up' : 'down', text: `${delta > 0 ? '+' : ''}${Math.round(delta)} pts` }
}
