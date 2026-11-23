import { ageFromCustomerId, localDayKey } from './dates'
import { referralRewardCents } from './money'
import {
  addMonths, daysInMonth, isSameMonth, monthBounds, monthKey, monthShort, monthsBetween, recentMonths, startOfMonth,
} from './months'
import type { Lead, Sale, Workspace } from './types'

/**
 * Monthly performance, derived entirely from the local workspace.
 *
 * Activations are attributed to the month they actually activated in, not to the month
 * the sale was first typed in. A sale recorded in September but confirmed in October
 * counts as October business, while still being visible as a September sale in the funnel.
 */

export type MonthComparison = { direction: 'up' | 'down' | 'flat'; text: string }

export interface MonthCallStats {
  attempts: number
  customers: number
  reached: number
  noAnswer: number
  notInterested: number
  callback: number
  sale: number
  contactRate: number
  saleRate: number
  /** Average attempts per working day with activity, not per calendar day. */
  perActiveDay: number
  activeDays: number
}

export interface MonthPipelineStats {
  /** Sales first recorded this month, whatever stage they are in now. */
  recorded: number
  /** Activations dated inside this month. */
  activated: number
  att: number
  nonAtt: number
  declined: number
  /** Activated sales that are missing a price, so their value cannot be reported. */
  activatedWithoutPrice: number
  /** Activated sales with a price, summed. */
  activatedValueCents: number
  averageDaysToActivate: number | null
  /** Decided sales recorded this month: the activation rate of this month's intake. */
  activationRate: number
}

export interface MonthValueStats {
  /** Remaining reward value of referrals that activated this month without a recorded payment. */
  referralDueCents: number
  /** Reward value of referrals that activated this month and are already marked paid. */
  referralPaidCents: number
}

export interface DayPoint {
  key: string
  day: number
  isWeekend: boolean
  isToday: boolean
  isFuture: boolean
  attempts: number
  activations: number
}

export interface MonthSummary {
  month: Date
  key: string
  label: string
  short: string
  isCurrent: boolean
  isFuture: boolean
  calls: MonthCallStats
  pipeline: MonthPipelineStats
  value: MonthValueStats
  totalActivated: number
}

export interface MonthPerformance {
  months: MonthSummary[]
  current: MonthSummary
  /** Always present: an empty summary when the workspace has no earlier month. */
  previous: MonthSummary
  /** Every month that has any record, oldest first, for the trend table. */
  history: MonthSummary[]
  daysLeft: number
  /** Straight-line projection of the current month's activations. */
  projectedActivations: number | null
  target: { activations: number | null; reachedAt: Date | null }
  days: DayPoint[]
  hasActivity: boolean
}

const dayKey = (value: Date | string) => localDayKey(value instanceof Date ? value : new Date(value))
const inMonth = (value: string | null, month: Date): boolean => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && isSameMonth(date, month)
}
/**
 * A record from a later month than the current one can only come from a device clock that is
 * ahead, so it is held out of this month's numbers. Within the current month nothing is hidden:
 * the workspace clock refreshes every 30 seconds, and an activation logged moments ago should
 * count immediately rather than waiting for the next tick.
 */
const notAfterMonth = (value: string, now: Date): boolean => {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && startOfMonth(date).getTime() <= startOfMonth(now).getTime()
}
const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

function monthCallStats(workspace: Workspace, month: Date, now: Date): MonthCallStats {
  const stats: MonthCallStats = {
    attempts: 0, customers: 0, reached: 0, noAnswer: 0, notInterested: 0, callback: 0,
    sale: 0, contactRate: 0, saleRate: 0, perActiveDay: 0, activeDays: 0,
  }
  const customers = new Set<string>()
  const days = new Set<string>()
  for (const [account, profile] of Object.entries(workspace.profiles)) {
    for (const attempt of profile.attempts) {
      if (!inMonth(attempt.at, month) || !notAfterMonth(attempt.at, now)) continue
      stats.attempts++
      customers.add(account)
      days.add(dayKey(attempt.at))
      if (attempt.outcome === 'no_answer') stats.noAnswer++
      else if (attempt.outcome === 'not_interested') stats.notInterested++
      else if (attempt.outcome === 'callback') stats.callback++
      else if (attempt.outcome === 'sale') stats.sale++
    }
  }
  stats.customers = customers.size
  stats.activeDays = days.size
  stats.reached = stats.notInterested + stats.callback + stats.sale
  stats.contactRate = share(stats.reached, stats.attempts)
  stats.saleRate = share(stats.sale, stats.reached)
  stats.perActiveDay = stats.activeDays ? stats.attempts / stats.activeDays : 0
  return stats
}

function monthSales(workspace: Workspace, month: Date, now: Date): Sale[] {
  return workspace.sales.filter(sale => inMonth(sale.createdAt, month) && notAfterMonth(sale.createdAt, now))
}

function monthActivations(workspace: Workspace, month: Date, now: Date): Sale[] {
  return workspace.sales.filter(sale => sale.stage === 'activated' && !!sale.activatedAt
    && inMonth(sale.activatedAt, month) && notAfterMonth(sale.activatedAt, now))
}

function pipelineStats(sales: Sale[], activations: Sale[]): MonthPipelineStats {
  const decided = sales.filter(sale => sale.stage === 'activated' || sale.stage === 'declined').length
  const durations = activations
    .map(sale => (new Date(sale.activatedAt!).getTime() - new Date(sale.createdAt).getTime()) / 86_400_000)
    .filter(days => days >= 0)
  const priced = activations.filter(sale => sale.packagePriceCents !== null)
  return {
    recorded: sales.length,
    activated: activations.length,
    att: activations.filter(sale => sale.activationType === 'ATT').length,
    nonAtt: activations.filter(sale => sale.activationType === 'Non-ATT').length,
    declined: sales.filter(sale => sale.stage === 'declined').length,
    activatedWithoutPrice: activations.length - priced.length,
    activatedValueCents: priced.reduce((total, sale) => total + (sale.packagePriceCents ?? 0), 0),
    averageDaysToActivate: durations.length ? durations.reduce((total, days) => total + days, 0) / durations.length : null,
    activationRate: share(sales.filter(sale => sale.stage === 'activated').length, decided),
  }
}

/** Referral rewards follow the activation month, because that is when the reward was earned. */
function valueStats(workspace: Workspace, activations: Sale[]): MonthValueStats {
  const activatedIds = new Set(activations.map(sale => sale.id))
  const activatedAccounts = new Set(activations.map(sale => sale.lead.accountNumber))
  let referralDueCents = 0
  let referralPaidCents = 0
  for (const referral of workspace.referrals) {
    if (!referral.accountNumber || !activatedAccounts.has(referral.accountNumber)) continue
    const active = referral.payments.find(payment => payment.voidedAt === null)
    if (active) {
      if (activatedIds.has(active.saleId)) referralPaidCents += active.amountCents
      continue
    }
    const sale = activations.find(item => item.lead.accountNumber === referral.accountNumber)
    if (!sale || sale.packagePriceCents === null) continue
    referralDueCents += referralRewardCents(sale.packagePriceCents) ?? 0
  }
  return { referralDueCents, referralPaidCents }
}

function summariseMonth(workspace: Workspace, month: Date, now: Date): MonthSummary {
  const sales = monthSales(workspace, month, now)
  const activations = monthActivations(workspace, month, now)
  const pipeline = pipelineStats(sales, activations)
  return {
    month: startOfMonth(month),
    key: monthKey(month),
    label: new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(month),
    short: monthShort(month),
    isCurrent: isSameMonth(month, now),
    isFuture: startOfMonth(month).getTime() > startOfMonth(now).getTime(),
    calls: monthCallStats(workspace, month, now),
    pipeline,
    value: valueStats(workspace, activations),
    totalActivated: pipeline.activated,
  }
}

function safeTarget(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 10_000 ? value : null
}

export function monthTrend(current: number, previous: number): MonthComparison {
  if (previous === 0 && current === 0) return { direction: 'flat', text: 'no change' }
  if (previous === 0) return { direction: 'up', text: 'first month' }
  const delta = (current - previous) / previous
  if (Math.abs(delta) < 0.005) return { direction: 'flat', text: 'no change' }
  return { direction: delta > 0 ? 'up' : 'down', text: `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}% vs last month` }
}

export function monthlyPerformance(workspace: Workspace, now: Date, trendMonths = 6): MonthPerformance {
  const currentMonth = startOfMonth(now)
  const previousMonth = addMonths(currentMonth, -1)

  // The window only needs to reach back far enough for the comparison and the trend.
  const trend = recentMonths(now, trendMonths).map(month => summariseMonth(workspace, month, now))
  const current = summariseMonth(workspace, currentMonth, now)
  const previous = summariseMonth(workspace, previousMonth, now)

  // History: every month that has a call, a sale or an activation, oldest first.
  let earliest: Date | null = null
  const consider = (value: string | null) => {
    if (!value) return
    const date = new Date(value)
    if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) return
    const month = startOfMonth(date)
    if (!earliest || month.getTime() < earliest.getTime()) earliest = month
  }
  for (const profile of Object.values(workspace.profiles)) for (const attempt of profile.attempts) consider(attempt.at)
  for (const sale of workspace.sales) { consider(sale.createdAt); consider(sale.activatedAt) }
  const history = earliest ? monthsBetween(earliest, currentMonth).map(month => summariseMonth(workspace, month, now)) : [current]

  const days = buildDays(workspace, currentMonth, now)

  const total = daysInMonth(currentMonth)
  const elapsed = isSameMonth(currentMonth, now) ? now.getDate() : total
  const projectedActivations = elapsed >= 3 && current.pipeline.activated > 0 ? (current.pipeline.activated / elapsed) * total : null

  const targetValue = safeTarget(workspace.settings.monthlyActivationTarget)
  const reachedAt = targetValue === null ? null : reachedDate(workspace, currentMonth, now, targetValue)

  return {
    months: trend,
    current,
    previous,
    history,
    daysLeft: Math.max(0, daysInMonth(currentMonth) - now.getDate()),
    projectedActivations,
    target: { activations: targetValue, reachedAt },
    days,
    hasActivity: history.some(month => month.calls.attempts > 0 || month.pipeline.recorded > 0 || month.pipeline.activated > 0),
  }
}

/** The day the target was crossed, so the month has a dated milestone rather than a vague count. */
function reachedDate(workspace: Workspace, month: Date, now: Date, target: number): Date | null {
  const activations = monthActivations(workspace, month, now)
    .map(sale => new Date(sale.activatedAt!))
    .sort((a, b) => a.getTime() - b.getTime())
  return activations.length >= target ? activations[target - 1] : null
}

function buildDays(workspace: Workspace, month: Date, now: Date): DayPoint[] {
  const todayKey = localDayKey(now)
  const points: DayPoint[] = []
  const total = daysInMonth(month)
  const attempts = new Map<string, number>()
  for (const profile of Object.values(workspace.profiles)) {
    for (const attempt of profile.attempts) {
      if (!inMonth(attempt.at, month)) continue
      const key = dayKey(attempt.at)
      attempts.set(key, (attempts.get(key) ?? 0) + 1)
    }
  }
  const activations = new Map<string, number>()
  for (const sale of monthActivations(workspace, month, now)) {
    const key = dayKey(sale.activatedAt!)
    activations.set(key, (activations.get(key) ?? 0) + 1)
  }
  for (let day = 1; day <= total; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day)
    const key = localDayKey(date)
    points.push({
      key, day,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: key === todayKey,
      isFuture: date.getTime() > now.getTime() && key !== todayKey,
      attempts: attempts.get(key) ?? 0,
      activations: activations.get(key) ?? 0,
    })
  }
  return points
}

/** Activations grouped by calendar month, newest first, for the Activations page. */
export interface ActivationGroup {
  key: string
  month: Date
  label: string
  count: number
  att: number
  nonAtt: number
  valueCents: number
  withoutPrice: number
  isCurrent: boolean
}

export function groupActivationsByMonth(workspace: Workspace, now: Date): ActivationGroup[] {
  const groups = new Map<string, ActivationGroup>()
  const activations = workspace.sales.filter(sale => sale.stage === 'activated' && sale.activatedAt)
  for (const sale of activations) {
    const date = new Date(sale.activatedAt!)
    if (Number.isNaN(date.getTime()) || !notAfterMonth(sale.activatedAt!, now)) continue
    const key = monthKey(date)
    const group = groups.get(key) ?? {
      key, month: startOfMonth(date), label: new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(date),
      count: 0, att: 0, nonAtt: 0, valueCents: 0, withoutPrice: 0, isCurrent: isSameMonth(date, now),
    }
    group.count++
    if (sale.activationType === 'ATT') group.att++
    else if (sale.activationType === 'Non-ATT') group.nonAtt++
    if (sale.packagePriceCents === null) group.withoutPrice++
    else group.valueCents += sale.packagePriceCents
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.month.getTime() - a.month.getTime())
}

export interface DeadlineLead {
  lead: Lead
  age: number | null
  attempts30: number
  lastAttemptAt: string | null
  callbackAt: string | null
  daysSinceListed: number | null
}

/**
 * Leads whose 5- ID puts them at 58 or 59: the customer is still callable now but will
 * age out of the calling pool on their next birthday. Each day spent on them is a day
 * that cannot be spent on them later.
 */
export function deadlineLeads(workspace: Workspace, now: Date, limit = 6): DeadlineLead[] {
  const seen = new Map<string, Lead>()
  const consider = (lead: Lead) => { if (!seen.has(lead.accountNumber)) seen.set(lead.accountNumber, lead) }
  for (const lead of workspace.leads) consider(lead)
  for (const callback of workspace.callbacks) consider(callback.lead)

  const rows: DeadlineLead[] = []
  for (const lead of seen.values()) {
    const age = ageFromCustomerId(lead.customerId, now)
    if (age !== 58 && age !== 59) continue
    const profile = workspace.profiles[lead.accountNumber]
    if (profile?.excludedReason || profile?.doNotCall) continue
    if (workspace.sales.some(sale => sale.lead.accountNumber === lead.accountNumber && sale.stage !== 'declined')) continue
    const attempts = (profile?.attempts ?? []).filter(attempt => now.getTime() - new Date(attempt.at).getTime() <= 30 * 86_400_000)
    const lastAttemptAt = attempts.length ? attempts[attempts.length - 1].at : null
    const callback = workspace.callbacks.find(item => item.lead.accountNumber === lead.accountNumber)
    const listed = lead.listDate ? new Date(lead.listDate) : null
    rows.push({
      lead, age,
      attempts30: attempts.length,
      lastAttemptAt: lastAttemptAt && new Date(lastAttemptAt) <= now ? lastAttemptAt : null,
      callbackAt: callback && new Date(callback.dueAt) <= now ? callback.dueAt : null,
      daysSinceListed: listed && !Number.isNaN(listed.getTime()) ? Math.max(0, Math.floor((now.getTime() - listed.getTime()) / 86_400_000)) : null,
    })
  }
  return rows
    .sort((a, b) => (b.age ?? 0) - (a.age ?? 0)
      || (b.callbackAt ? 1 : 0) - (a.callbackAt ? 1 : 0)
      || (a.lastAttemptAt ? new Date(a.lastAttemptAt).getTime() : 0) - (b.lastAttemptAt ? new Date(b.lastAttemptAt).getTime() : 0)
      || b.attempts30 - a.attempts30)
    .slice(0, limit)
}

export function isMonthKey(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}$/.test(value)
}

export { monthBounds }
