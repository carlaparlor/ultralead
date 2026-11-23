/**
 * Calendar-month windows in the browser's local time.
 *
 * Every monthly figure in the app (monthly review, referrer ledger, activation
 * totals) is measured through these helpers, so two screens can never disagree
 * about where a month starts or which days belong to it.
 */
export interface MonthWindow {
  /** Stable key such as 2026-11, suitable for React keys and tests. */
  key: string
  /** "November 2026". */
  label: string
  start: Date
  /**
   * End of the measured span: the first instant of the next month, or "now" for
   * the current month. `endInclusive` is true for the current month so work logged
   * in this exact instant is counted rather than falling one millisecond outside.
   */
  end: Date
  endInclusive: boolean
  /** Exclusive end of the comparable stretch of the previous month. */
  compareStart: Date
  compareEnd: Date
  isCurrent: boolean
  /** Days in the calendar month, including days still to come. */
  days: number
  /** Days measured so far: the current day for this month, the whole month otherwise. */
  daysElapsed: number
}

export function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

export function startOfNextMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 1)
}

export function monthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(value: Date): string {
  return new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(value)
}

export function monthShortLabel(value: Date): string {
  return new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric' }).format(value)
}

export function daysInMonth(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
}

/** Shift by whole months, always landing on the first day at local midnight. */
export function shiftMonth(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1)
}

export function isInMonth(value: string | Date | null | undefined, anchor: Date): boolean {
  if (!value) return false
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth()
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function monthWindow(anchor: Date, now: Date): MonthWindow {
  const start = startOfMonth(anchor)
  const next = startOfNextMonth(anchor)
  const isCurrent = isSameMonth(anchor, now)
  const compareStart = shiftMonth(start, -1)
  // A half-finished month is compared with the same stretch of last month,
  // never with a full month that would make it look worse than it is.
  const compareEnd = isCurrent
    ? new Date(
      compareStart.getFullYear(), compareStart.getMonth(), Math.min(now.getDate(), daysInMonth(compareStart)),
      now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds(),
    )
    : start
  return {
    key: monthKey(anchor), label: monthLabel(anchor), start,
    end: isCurrent ? now : next,
    endInclusive: isCurrent,
    compareStart, compareEnd, isCurrent,
    days: daysInMonth(anchor),
    daysElapsed: isCurrent ? now.getDate() : daysInMonth(anchor),
  }
}
