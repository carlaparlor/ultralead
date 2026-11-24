/**
 * Local calendar-month helpers. Months are the reporting unit for performance, so
 * every boundary is a local midnight rather than a UTC instant or a rolling window.
 */

export function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

/** The first instant of the next month; windows use it as an exclusive end. */
export function startOfNextMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 1)
}

export function addMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds())
}

export function daysInMonth(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
}

/** A stable sortable key such as `2026-11`, safe across time zones. */
export function monthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function monthLabel(value: Date): string {
  return new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(value)
}

export function monthShort(value: Date): string {
  return new Intl.DateTimeFormat('en-ZA', { month: 'short' }).format(value)
}

/** `1 Nov – 30 Nov 2026`, cut at today for the month in progress. */
export function monthRangeLabel(from: Date, now: Date): string {
  const last = isSameMonth(from, now) ? now.getDate() : daysInMonth(from)
  return `${formatDayMonth(from)} – ${last} ${monthShort(from)} ${from.getFullYear()}`
}

function formatDayMonth(value: Date): string {
  return `${value.getDate()} ${monthShort(value)}`
}

/** Oldest first, ending with the month that contains `now`. */
export function recentMonths(now: Date, count: number): Date[] {
  const months: Date[] = []
  for (let index = count - 1; index >= 0; index--) months.push(new Date(now.getFullYear(), now.getMonth() - index, 1))
  return months
}

/** Months between two dates, oldest first, never negative. */
export function monthsBetween(from: Date, to: Date): Date[] {
  const months: Date[] = []
  let cursor = startOfMonth(from)
  const last = startOfMonth(to)
  while (cursor.getTime() <= last.getTime() && months.length < 240) {
    months.push(cursor)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return months
}

/** Inclusive start and exclusive end for a calendar month. */
export function monthBounds(value: Date): { from: Date; to: Date } {
  return { from: startOfMonth(value), to: startOfNextMonth(value) }
}
