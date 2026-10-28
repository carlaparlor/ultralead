import { describe, expect, it } from 'vitest'
import { analyse, change, pointsChange, rangeStart } from './analytics'
import { makeLead, NOW, workspaceWith } from './testFixtures'
import { emptyProfile, type Workspace } from './types'

/** Builds a workspace with attempts and sales at explicit times, relative to NOW. */
function scenario(): Workspace {
  const a = makeLead('5-1', { name: 'Alpha' }), b = makeLead('5-2', { name: 'Beta' }), c = makeLead('5-3', { name: 'Gamma' })
  const daysAgo = (days: number, hour = 10) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, hour).toISOString()
  const base = workspaceWith(a, b, c)
  const sale = (id: string, lead = a, stage: 'credit_vetting' | 'pending_confirmation' | 'activated' | 'declined', createdAt: string, activatedAt: string | null, type: 'ATT' | 'Non-ATT' | null, packageName = 'Everyday 20GB') => ({
    id, lead, packageName, activationType: type, stage, createdAt, updatedAt: activatedAt ?? createdAt, activatedAt,
  })
  return {
    ...base,
    profiles: {
      // Alpha: no answer, then a callback, then a sale (3 attempts today)
      '5-1': { ...emptyProfile(), attempts: [
        { id: 't1', at: daysAgo(0, 9), outcome: 'no_answer' },
        { id: 't2', at: daysAgo(0, 9), outcome: 'callback' },
        { id: 't3', at: daysAgo(0, 9), outcome: 'sale' },
        // An older conversation outside a 7-day window
        { id: 't4', at: daysAgo(20), outcome: 'not_interested' },
      ] },
      // Beta: one no answer today, two more last week
      '5-2': { ...emptyProfile(), attempts: [
        { id: 't5', at: daysAgo(0, 8), outcome: 'no_answer' },
        { id: 't6', at: daysAgo(10), outcome: 'no_answer' },
      ] },
      // Gamma: silent, no attempts
      '5-3': emptyProfile(),
    },
    sales: [
      sale('s1', a, 'activated', daysAgo(3), daysAgo(1), 'ATT'),
      sale('s2', b, 'declined', daysAgo(5), null, null, 'Home Connect'),
      sale('s3', c, 'pending_confirmation', daysAgo(2), null, null, 'Everyday 20GB'),
      sale('s4', a, 'activated', daysAgo(40), daysAgo(38), 'Non-ATT', 'Solo 20GB'),
    ],
  }
}

describe('insights analysis', () => {
  it('counts only the attempts inside the chosen window', () => {
    const ws = scenario()
    expect(analyse(ws, 'today', NOW).calls.attempts).toBe(4)
    expect(analyse(ws, 'week', NOW).calls.attempts).toBe(4)
    expect(analyse(ws, 'all', NOW).calls.attempts).toBe(6)
    expect(analyse(ws, 'all', NOW).calls).toMatchObject({ noAnswer: 3, notInterested: 1, callback: 1, sale: 1, customers: 2 })
  })

  it('derives contact and conversion rates from outcomes', () => {
    const today = analyse(scenario(), 'today', NOW)
    // 4 attempts, 2 reached a person (callback + sale)
    expect(today.contactRate).toBeCloseTo(0.5)
    expect(today.conversionRate).toBeCloseTo(0.5)
    expect(today.calls.customers).toBe(2)
  })

  it('builds one bucket per period and stacks outcomes into them', () => {
    const ws = scenario()
    const today = analyse(ws, 'today', NOW)
    expect(today.series).toHaveLength(8)
    expect(today.series.reduce((total, point) => total + point.attempts, 0)).toBe(4)
    const week = analyse(ws, 'week', NOW)
    expect(week.series).toHaveLength(7)
    expect(week.series.reduce((total, point) => total + point.attempts, 0)).toBe(4)
    // Activations are counted in the bucket they happened in
    expect(week.series.reduce((total, point) => total + point.activations, 0)).toBe(1)
    const all = analyse(ws, 'all', NOW)
    expect(all.series.length).toBeGreaterThan(0)
    expect(all.series.length).toBeLessThanOrEqual(12)
    expect(all.series.reduce((total, point) => total + point.attempts, 0)).toBe(6)
  })

  it('reports the funnel, activation rate and days to activate', () => {
    const funnel = analyse(scenario(), 'week', NOW).funnel
    expect(funnel.recorded).toBe(3)
    expect(funnel.activated).toBe(1)
    expect(funnel.declined).toBe(1)
    expect(funnel.awaitingConfirmation).toBe(1)
    // Decided sales only: one activated, one declined
    expect(funnel.activationRate).toBeCloseTo(0.5)
    expect(funnel.steps.map(step => step.value)).toEqual([3, 2, 1])
    // 3 days from sale to activation
    expect(analyse(scenario(), 'week', NOW).daysToActivate).toBeCloseTo(2, 1)
  })

  it('splits activations by type and ranks packages', () => {
    const week = analyse(scenario(), 'week', NOW)
    expect(week.att).toEqual({ att: 1, nonAtt: 0 })
    // All time also picks up the 38-day-old non-ATT activation.
    const all = analyse(scenario(), 'all', NOW)
    expect(all.att).toEqual({ att: 1, nonAtt: 1 })
    expect(all.packages[0]).toMatchObject({ name: 'Everyday 20GB', sales: 2, activated: 1 })
    expect(all.packages.map(item => item.name)).toEqual(['Everyday 20GB', 'Home Connect', 'Solo 20GB'])
  })

  it('compares with the previous window of the same length', () => {
    const week = analyse(scenario(), 'week', NOW)
    expect(week.previous).not.toBeNull()
    // Only the 10-day-old attempt falls in the previous seven days.
    expect(week.previous!.calls).toBe(1)
    expect(analyse(scenario(), 'all', NOW).previous).toBeNull()
  })

  it('starts windows on local midnight and reports no activity for an empty workspace', () => {
    const start = rangeStart('week', NOW)!
    expect(start.getHours()).toBe(0)
    expect(rangeStart('all', NOW)).toBeNull()
    const empty = analyse(workspaceWith(), 'week', NOW)
    expect(empty.hasActivity).toBe(false)
    expect(empty.contactRate).toBe(0)
    expect(empty.daysToActivate).toBeNull()
  })

  it('formats relative change without dividing by zero', () => {
    expect(change(5, 0)).toEqual({ direction: 'up', text: 'new' })
    expect(change(0, 0)).toEqual({ direction: 'flat', text: 'no change' })
    expect(change(6, 5)).toEqual({ direction: 'up', text: '+20%' })
    expect(change(4, 5).direction).toBe('down')
    expect(pointsChange(0.5, 0.4)).toEqual({ direction: 'up', text: '+10 pts' })
    expect(pointsChange(0.5, 0.5).direction).toBe('flat')
  })
})
