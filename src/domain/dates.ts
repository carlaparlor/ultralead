/** SA-style IDs encode YYMMDD; a missing or impossible date is deliberately unknown. */
export function ageFromCustomerId(id: string, now: Date): number | null {
  if (!/^\d{13}$/.test(id)) return null
  const yy = Number(id.slice(0, 2))
  const month = Number(id.slice(2, 4))
  const day = Number(id.slice(4, 6))
  const currentYear = now.getFullYear()
  const century = Math.floor(currentYear / 100) * 100
  const year = yy <= currentYear % 100 ? century + yy : century - 100 + yy
  const birth = new Date(year, month - 1, day)
  if (month < 1 || month > 12 || day < 1 || birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null
  let age = currentYear - year
  if (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day)) age--
  return age >= 0 ? age : null
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function toDateTimeLocal(date: Date): string {
  return `${localDayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-ZA', options).format(date)
}

export function formatListDate(value: string | null): string {
  // A list date is a calendar date, not a UTC timestamp.
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—'
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '—'
  return formatDate(date)
}

export function formatTime(value: string | Date): string {
  return formatDate(value, { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDayKey(a) === localDayKey(b)
}

export function relativeDue(value: string, now: Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  const diff = date.getTime() - now.getTime()
  const minutes = Math.abs(Math.round(diff / 60000))
  if (diff <= 0) {
    if (minutes < 1) return 'Due now'
    if (minutes < 60) return `${minutes}m overdue`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h overdue`
    return 'Overdue'
  }
  if (isSameLocalDay(date, now)) return `Today, ${formatTime(date)}`
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (isSameLocalDay(date, tomorrow)) return `Tomorrow, ${formatTime(date)}`
  return `${formatDate(date, { day: 'numeric', month: 'short' })}, ${formatTime(date)}`
}
