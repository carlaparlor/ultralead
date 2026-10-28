import { describe, expect, it } from 'vitest'
import { ageFromCustomerId, formatListDate, localDayKey, relativeDue, toDateTimeLocal } from './dates'
import { NOW } from './testFixtures'

describe('customer age', () => {
  it('calculates age on either side of a birthday, including the 60th', () => {
    expect(ageFromCustomerId('6610290000000', NOW)).toBe(59)
    expect(ageFromCustomerId('6610280000000', NOW)).toBe(60)
    expect(ageFromCustomerId('6610270000000', NOW)).toBe(60)
    expect(ageFromCustomerId('9908169875084', NOW)).toBe(27)
  })
  it('quarantines missing, malformed, impossible and future dates', () => {
    expect(ageFromCustomerId('', NOW)).toBeNull()
    expect(ageFromCustomerId('8406778994089', NOW)).toBeNull()
    expect(ageFromCustomerId('9913320000000', NOW)).toBeNull()
    expect(ageFromCustomerId('9902290000000', NOW)).toBeNull()
    expect(ageFromCustomerId('2612310000000', NOW)).toBeNull()
    expect(ageFromCustomerId('900101', NOW)).toBeNull()
  })
  it('handles a genuine leap day and two-digit centuries', () => {
    expect(ageFromCustomerId('0002290000000', NOW)).toBe(26)
    expect(ageFromCustomerId('6801010000000', NOW)).toBe(58)
  })
})

describe('local date formatting', () => {
  it('does not interpret list dates as UTC timestamps', () => {
    expect(localDayKey(NOW)).toBe('2026-10-28')
    expect(toDateTimeLocal(NOW)).toBe('2026-10-28T10:00')
    expect(formatListDate('2026-09-01')).toContain('Sep')
    expect(formatListDate('2026-02-31')).toBe('—')
    expect(formatListDate(null)).toBe('—')
  })
  it('formats due and future callbacks in local time', () => {
    expect(relativeDue(new Date(NOW.getTime() - 23 * 60000).toISOString(), NOW)).toBe('23m overdue')
    expect(relativeDue(new Date(NOW.getTime() + 60 * 60000).toISOString(), NOW)).toContain('Today')
    expect(relativeDue('invalid', NOW)).toBe('Invalid date')
  })
})
