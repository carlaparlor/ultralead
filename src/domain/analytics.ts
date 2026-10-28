import type { CallOutcome, Sale, Workspace } from './types'

/** Rolling windows measured from the local day, so "today" matches the calling desk. */
export type AnalysisRange = 'today' | 'week' | 'month' | 'all'

export const RANGE_LABELS: Record<AnalysisRange, string> = {
  today: 'TODAY', week: '7 DAYS', month: '30 DAYS', all: 'ALL TIME',
}

const RANGE_DAYS: Record<Exclude<AnalysisRange, 'all'>, number> = { today: 1, week: 7, month: 30 }

export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function addLocalDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days, value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds())
}

/** The window's inclusive start. `all` has no start. */
export function rangeStart(range: AnalysisRange, now: Date): Date | null {
  if (range === 'all') return null
  return addLocalDays(startOfLocalDay(now), -(RANGE_DAYS[range] - 1))
}

export interface CallTally {
  attempts: number
  noAnswer: number
  notInterested: number
  callback: number
  sale: number
  customers: number
}

export interface SeriesPoint {
  key: string
  label: string
  from: Date
  to: Date
  attempts: number
  noAnswer: number
  notInterested: number
  callback: number
  sale: number
  activations: number
}

export interface FunnelStep { label: string; value: number; share: number }

export interface Analysis {
  range: AnalysisRange
  from: Date | null
  calls: CallTally
  answered: number
  /** Calls that reached a conversation, as a share of all attempts. */
  contactRate: number
  /** Sales recorded, as a share of conversations. */
  conversionRate: number
  salesRecorded: number
  activations: number
  series: SeriesPoint[]
  bucketLabel: string
  funnel: { recorded: number; inVetting: number; awaitingConfirmation: number; activated: number; declined: number; activationRate: number; steps: FunnelStep[] }
  daysToActivate: number | null
  att: { att: number; nonAtt: number }
  packages: { name: string; sales: number; activated: number }[]
  previous: { calls: number; sales: number; activations: number; contactRate: number } | null
  hasActivity: boolean
}

const emptyTally = (): CallTally => ({ attempts: 0, noAnswer: 0, notInterested: 0, callback: 0, sale: 0, customers: 0 })

function inWindow(value: string, from: Date | null, to: Date): boolean {
  const time = new Date(value).getTime()
  if (Number.isNaN(time) || time > to.getTime()) return false
  return from === null || time >= from.getTime()
}

interface AttemptRow { account: string; at: string; outcome: CallOutcome }

function attemptsIn(workspace: Workspace, from: Date | null, to: Date): AttemptRow[] {
  const rows: AttemptRow[] = []
  for (const [account, profile] of Object.entries(workspace.profiles)) {
    for (const attempt of profile.attempts) {
      if (inWindow(attempt.at, from, to)) rows.push({ account, at: attempt.at, outcome: attempt.outcome })
    }
  }
  return rows
}

function tally(rows: AttemptRow[]): CallTally {
  const calls = emptyTally()
  const customers = new Set<string>()
  for (const row of rows) {
    calls.attempts++
    customers.add(row.account)
    if (row.outcome === 'no_answer') calls.noAnswer++
    else if (row.outcome === 'not_interested') calls.notInterested++
    else if (row.outcome === 'callback') calls.callback++
    else if (row.outcome === 'sale') calls.sale++
  }
  calls.customers = customers.size
  return calls
}

const answeredCount = (calls: CallTally) => calls.notInterested + calls.callback + calls.sale
const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

/** Buckets: hourly blocks for today, days for a week or a month, weeks for all time. */
function buildBuckets(range: AnalysisRange, now: Date, earliest: Date | null): { from: Date; to: Date; label: string }[] {
  const buckets: { from: Date; to: Date; label: string }[] = []
  const end = now
  if (range === 'today') {
    const day = startOfLocalDay(now)
    for (let hour = 0; hour < 24; hour += 3) {
      buckets.push({
        from: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour),
        to: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour + 3),
        label: `${String(hour).padStart(2, '0')}`,
      })
    }
    return buckets
  }
  if (range === 'week' || range === 'month') {
    const days = RANGE_DAYS[range]
    for (let index = days - 1; index >= 0; index--) {
      const day = addLocalDays(startOfLocalDay(now), -index)
      const next = addLocalDays(startOfLocalDay(now), -index + 1)
      buckets.push({
        from: day,
        to: next,
        label: new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(day),
      })
    }
    return buckets
  }
  // All time: twelve weekly blocks ending now, trimmed to the first week with data.
  for (let index = 11; index >= 0; index--) {
    const to = index === 0 ? end : new Date(end.getTime() - index * 7 * 86_400_000)
    const from = new Date(to.getTime() - 7 * 86_400_000)
    buckets.push({ from, to, label: new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(from) })
  }
  if (earliest) {
    while (buckets.length > 1 && buckets[0].to.getTime() <= earliest.getTime()) buckets.shift()
  }
  return buckets
}

function bucketise(rows: AttemptRow[], sales: Sale[], buckets: { from: Date; to: Date; label: string }[]): SeriesPoint[] {
  return buckets.map((bucket, index) => {
    const point: SeriesPoint = {
      key: `${index}-${bucket.label}`, label: bucket.label, from: bucket.from, to: bucket.to,
      attempts: 0, noAnswer: 0, notInterested: 0, callback: 0, sale: 0, activations: 0,
    }
    for (const row of rows) {
      const time = new Date(row.at).getTime()
      if (time < bucket.from.getTime() || time >= bucket.to.getTime()) continue
      point.attempts++
      if (row.outcome === 'no_answer') point.noAnswer++
      else if (row.outcome === 'not_interested') point.notInterested++
      else if (row.outcome === 'callback') point.callback++
      else if (row.outcome === 'sale') point.sale++
    }
    for (const sale of sales) {
      if (!sale.activatedAt) continue
      const time = new Date(sale.activatedAt).getTime()
      if (time >= bucket.from.getTime() && time < bucket.to.getTime()) point.activations++
    }
    return point
  })
}

function earliestAttempt(workspace: Workspace): Date | null {
  let earliest: Date | null = null
  for (const profile of Object.values(workspace.profiles)) {
    for (const attempt of profile.attempts) {
      const time = new Date(attempt.at)
      if (Number.isNaN(time.getTime())) continue
      if (!earliest || time.getTime() < earliest.getTime()) earliest = time
    }
  }
  return earliest
}

export function analyse(workspace: Workspace, range: AnalysisRange, now: Date): Analysis {
  const from = rangeStart(range, now)
  const rows = attemptsIn(workspace, from, now)
  const calls = tally(rows)
  const answered = answeredCount(calls)

  const salesInRange = workspace.sales.filter(sale => inWindow(sale.createdAt, from, now))
  const activationsInRange = workspace.sales.filter(sale => sale.activatedAt !== null && inWindow(sale.activatedAt, from, now))

  const activated = salesInRange.filter(sale => sale.stage === 'activated').length
  const declined = salesInRange.filter(sale => sale.stage === 'declined').length
  const awaitingConfirmation = salesInRange.filter(sale => sale.stage === 'pending_confirmation').length
  const inVetting = salesInRange.filter(sale => sale.stage === 'credit_vetting').length
  const decided = activated + declined

  const durations = activationsInRange
    .filter(sale => sale.activatedAt)
    .map(sale => (new Date(sale.activatedAt!).getTime() - new Date(sale.createdAt).getTime()) / 86_400_000)
    .filter(days => days >= 0)

  const packageMap = new Map<string, { name: string; sales: number; activated: number }>()
  for (const sale of workspace.sales) {
    if (!inWindow(sale.createdAt, from, now)) continue
    const entry = packageMap.get(sale.packageName.toLowerCase()) ?? { name: sale.packageName, sales: 0, activated: 0 }
    entry.sales++
    if (sale.stage === 'activated') entry.activated++
    packageMap.set(sale.packageName.toLowerCase(), entry)
  }

  const att = activationsInRange.filter(sale => sale.activationType === 'ATT').length
  const nonAtt = activationsInRange.filter(sale => sale.activationType === 'Non-ATT').length

  const earliest = earliestAttempt(workspace)
  const series = bucketise(rows, workspace.sales, buildBuckets(range, now, earliest))

  // Comparison window: the same length immediately before this one.
  let previous: Analysis['previous'] = null
  if (range !== 'all') {
    const days = RANGE_DAYS[range]
    const previousFrom = addLocalDays(from!, -days)
    const previousTo = new Date(from!.getTime() - 1)
    const previousCalls = tally(attemptsIn(workspace, previousFrom, previousTo))
    previous = {
      calls: previousCalls.attempts,
      sales: workspace.sales.filter(sale => inWindow(sale.createdAt, previousFrom, previousTo)).length,
      activations: workspace.sales.filter(sale => sale.activatedAt && inWindow(sale.activatedAt, previousFrom, previousTo)).length,
      contactRate: share(answeredCount(previousCalls), previousCalls.attempts),
    }
  }

  const steps: FunnelStep[] = [
    { label: 'Sales recorded', value: salesInRange.length, share: 1 },
    { label: 'Vetting approved', value: awaitingConfirmation + activated, share: share(awaitingConfirmation + activated, salesInRange.length) },
    { label: 'Activated', value: activated, share: share(activated, salesInRange.length) },
  ]

  return {
    range, from, calls, answered,
    contactRate: share(answered, calls.attempts),
    conversionRate: share(calls.sale, answered),
    salesRecorded: salesInRange.length,
    activations: activationsInRange.length,
    series,
    bucketLabel: range === 'today' ? 'EVERY 3 HOURS' : range === 'all' ? 'LAST 12 WEEKS' : range === 'week' ? 'LAST 7 DAYS' : 'LAST 30 DAYS',
    funnel: {
      recorded: salesInRange.length, inVetting, awaitingConfirmation, activated, declined,
      activationRate: share(activated, decided), steps,
    },
    daysToActivate: durations.length ? durations.reduce((total, days) => total + days, 0) / durations.length : null,
    att: { att, nonAtt },
    packages: [...packageMap.values()].sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name)),
    previous,
    hasActivity: calls.attempts > 0 || salesInRange.length > 0 || activationsInRange.length > 0,
  }
}

/** Percentage-point or relative change, rendered as a small trend note. */
export function change(current: number, previous: number): { direction: 'up' | 'down' | 'flat'; text: string } {
  if (previous === 0 && current === 0) return { direction: 'flat', text: 'no change' }
  if (previous === 0) return { direction: 'up', text: 'new' }
  const delta = (current - previous) / previous
  if (Math.abs(delta) < 0.005) return { direction: 'flat', text: 'no change' }
  return {
    direction: delta > 0 ? 'up' : 'down',
    text: `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`,
  }
}

export function pointsChange(current: number, previous: number): { direction: 'up' | 'down' | 'flat'; text: string } {
  const delta = (current - previous) * 100
  if (Math.abs(delta) < 0.5) return { direction: 'flat', text: 'no change' }
  return { direction: delta > 0 ? 'up' : 'down', text: `${delta > 0 ? '+' : ''}${Math.round(delta)} pts` }
}
