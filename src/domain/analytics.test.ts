import { describe, expect, it } from 'vitest'
import { change, pointsChange, recentMonths, reviewMonth } from './analytics'
import { monthWindow, shiftMonth, startOfMonth } from './month'
import { addReferrer, markReferralPaid, saveReferral } from './referrals'
import { makeLead, NOW, workspaceWith } from './testFixtures'
import { emptyProfile, type Sale, type Workspace } from './types'
import { recordSale, updateSaleStage } from './workspace'

/** NOW is 28 October 2026, 10:00 local, so "this month" is a partial 28-day-old October. */
const OCTOBER = startOfMonth(NOW)
const dayIn = (month: Date, day: number, hour = 10) => new Date(month.getFullYear(), month.getMonth(), day, hour)
const lastMonth = shiftMonth(OCTOBER, -1)

/** TIMESTAMP because testFixtures pins NOW to an explicit instant. */
function saleOf(id: string, lead = makeLead('5-1'), stage: Sale['stage'] = 'activated', createdAt = dayIn(OCTOBER, 5), activatedAt: string | null = dayIn(OCTOBER, 8).toISOString(), type: Sale['activationType'] = 'ATT', packageName = 'Everyday 20GB', packagePriceCents: number | null = 19_900): Sale {
  return {
    id, lead, packageName, packagePriceCents, activationType: type, stage,
    createdAt: createdAt.toISOString(), updatedAt: activatedAt ? new Date(activatedAt).toISOString() : createdAt.toISOString(), activatedAt,
  }
}

/** A month with calls, an activation, a decline, an open sale and referral money. */
function scenario(): Workspace {
  const a = makeLead('5-1', { name: 'Alpha' }), b = makeLead('5-2', { name: 'Beta' }), c = makeLead('5-3', { name: 'Gamma' }), d = makeLead('5-4', { name: 'Delta' })
  const base = workspaceWith(a, b, c, d)
  const at = (month: Date, day: number, hour: number) => dayIn(month, day, hour).toISOString()
  return {
    ...base,
    profiles: {
      // Alpha: two calls this month, one conversation
      '5-1': { ...emptyProfile(), attempts: [
        { id: 't1', at: at(OCTOBER, 2, 9), outcome: 'no_answer' },
        { id: 't2', at: at(OCTOBER, 2, 11), outcome: 'callback' },
      ] },
      // Beta: a sale conversation on a second day
      '5-2': { ...emptyProfile(), attempts: [{ id: 't3', at: at(OCTOBER, 9, 9), outcome: 'sale' }] },
      // Gamma: last month only
      '5-3': { ...emptyProfile(), attempts: [{ id: 't4', at: at(lastMonth, 20, 9), outcome: 'not_interested' }] },
      '5-4': emptyProfile(),
    },
    sales: [
      // Activation and its sale both in this month
      saleOf('s1', a, 'activated', dayIn(OCTOBER, 3), at(OCTOBER, 6, 12), 'ATT', 'Everyday 20GB', 19_900),
      // Sale this month, declined
      saleOf('s2', b, 'declined', dayIn(OCTOBER, 10), null, null, 'Home Connect', 29_900),
      // Sale this month still awaiting confirmation
      saleOf('s3', c, 'pending_confirmation', dayIn(OCTOBER, 12), null, null, 'Unlimited Connect', 24_900),
      // Sale made last month, activated this month: the activation belongs to October
      saleOf('s4', d, 'activated', dayIn(lastMonth, 26), at(OCTOBER, 4, 15), 'Non-ATT', 'Solo 20GB', 14_900),
      // Last month entirely
      saleOf('s5', a, 'activated', dayIn(lastMonth, 3), at(lastMonth, 9, 10), 'ATT', 'Everyday 20GB', 19_900),
    ],
  }
}

describe('calendar month windows', () => {
  it('runs from local midnight on the 1st to now, and compares with the same stretch last month', () => {
    const window = monthWindow(OCTOBER, NOW)
    expect(window.key).toBe('2026-10')
    expect(window.label).toBe('October 2026')
    expect(window.start).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0))
    expect(window.end).toEqual(NOW)
    expect(window.isCurrent).toBe(true)
    expect(window.days).toBe(31)
    expect(window.daysElapsed).toBe(28)
    // 1–28 September at the same time of day, not the whole of September.
    expect(window.compareStart).toEqual(new Date(2026, 8, 1))
    expect(window.compareEnd).toEqual(new Date(2026, 8, 28, 10, 0, 0, 0))
  })

  it('measures a past month in full against the whole month before it', () => {
    const past = monthWindow(shiftMonth(OCTOBER, -1), NOW)
    expect(past.isCurrent).toBe(false)
    expect(past.start).toEqual(new Date(2026, 8, 1))
    expect(past.end).toEqual(new Date(2026, 9, 1))
    expect(past.daysElapsed).toBe(30)
    expect(past.compareStart).toEqual(new Date(2026, 7, 1))
    expect(past.compareEnd).toEqual(new Date(2026, 8, 1))
    // A past month is compared with the whole month before it, even when that month is shorter.
    expect(monthWindow(new Date(2026, 2, 1), NOW).compareEnd).toEqual(new Date(2026, 2, 1))
  })
})

describe('monthly review', () => {
  it('counts only this calendar month, including activations of older sales', () => {
    const review = reviewMonth(scenario(), OCTOBER, NOW)
    expect(review.totals.calls).toBe(3)
    expect(review.totals.reached).toBe(2)
    expect(review.totals.customers).toBe(2)
    expect(review.totals.contactRate).toBeCloseTo(2 / 3)
    expect(review.totals.sales).toBe(3) // s1, s2, s3 were recorded this month
    expect(review.totals.activations).toBe(2) // s1 and s4 activated this month
    expect(review.totals.att).toBe(1)
    expect(review.totals.nonAtt).toBe(1)
    // s4 was sold last month, so its value counts toward this month's activated business, not its sales.
    expect(review.totals.activationValueCents).toBe(19_900 + 14_900)
    expect(review.totals.salesValueCents).toBe(19_900 + 29_900 + 24_900)
  })

  it('separates open, declined and unpriced work instead of blending it', () => {
    const workspace = scenario()
    let review = reviewMonth(workspace, OCTOBER, NOW)
    expect(review.totals.openSales).toBe(1)
    expect(review.totals.openValueCents).toBe(24_900)
    expect(review.totals.declined).toBe(1)
    expect(review.totals.declinedValueCents).toBe(29_900)
    expect(review.totals.unpricedSales).toBe(0)
    expect(review.totals.unpricedActivations).toBe(0)
    // An activation without a price is still an activation, but adds nothing to the value.
    const lead = makeLead('5-9', { name: 'Unpriced' })
    const unpriced = { ...workspace, leads: [...workspace.leads, lead], sales: [...workspace.sales, saleOf('s9', lead, 'activated', dayIn(OCTOBER, 7), dayIn(OCTOBER, 9).toISOString(), 'ATT', 'Mystery', null)] }
    review = reviewMonth(unpriced, OCTOBER, NOW)
    expect(review.totals.activations).toBe(3)
    expect(review.totals.activationValueCents).toBe(19_900 + 14_900)
    expect(review.totals.unpricedActivations).toBe(1)
  })

  it('builds one point per elapsed day and never counts future days', () => {
    const review = reviewMonth(scenario(), OCTOBER, NOW)
    expect(review.daily).toHaveLength(28)
    expect(review.daily[0].day).toBe(1)
    expect(review.daily.at(-1)!.day).toBe(28)
    expect(review.daily.reduce((total, point) => total + point.calls, 0)).toBe(3)
    expect(review.daily.reduce((total, point) => total + point.activations, 0)).toBe(2)
    expect(review.activeDays).toBe(2)
    expect(review.callsPerActiveDay).toBeCloseTo(1.5)
    // 2 October had two calls, so it is the busiest day; the label is a real date in the month.
    expect(review.bestDay).toMatchObject({ day: 2, calls: 2 })
    expect(review.bestDay!.label).toMatch(/2 Oct/)
  })

  it('derives conversion, activation rate and days to activate', () => {
    const review = reviewMonth(scenario(), OCTOBER, NOW)
    // 3 sales from 2 conversations is deliberately not capped: every sale is counted.
    expect(review.conversionRate).toBeCloseTo(1.5)
    // One activated, one declined this month; the older sale that activated does not double count.
    expect(review.activationRate).toBeCloseTo(2 / 3)
    // Measured in exact hours, including the sale's own time of day.
    const hours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 86_400_000
    expect(review.totals.daysToActivate).toBeCloseTo((hours(dayIn(OCTOBER, 3), dayIn(OCTOBER, 6, 12)) + hours(dayIn(lastMonth, 26), dayIn(OCTOBER, 4, 15))) / 2, 2)
  })

  it('compares with the same stretch of the previous month, never with a full one', () => {
    const review = reviewMonth(scenario(), OCTOBER, NOW)
    // 20 September has one attempt; the rest of September's work is outside that stretch.
    expect(review.previous.calls).toBe(1)
    // s4 (26 September) and s5 (3 September) were both recorded inside 1–28 September,
    // and s5 activated on 9 September, also inside the comparable stretch.
    expect(review.previous.sales).toBe(2)
    expect(review.previous.activations).toBe(1)
    expect(review.previous.contactRate).toBe(1) // the one September call was a conversation
  })

  it('computes an optional target and hides the reward money that is not due', () => {
    const withTarget = { ...scenario(), settings: { autoCopy: true, monthlyTarget: 5 } }
    expect(reviewMonth(withTarget, OCTOBER, NOW).target).toEqual({ value: 5, remaining: 3, share: 2 / 5 })
    const wild = { ...withTarget, settings: { autoCopy: true, monthlyTarget: 1 } }
    expect(reviewMonth(wild, OCTOBER, NOW).target).toMatchObject({ remaining: 0, share: 1 })
    expect(reviewMonth(scenario(), OCTOBER, NOW).target).toBeNull()
  })

  it('reports the same reward money the referrer ledger does', () => {
    const lead = makeLead('5-1', { name: 'Alpha' })
    let workspace: Workspace = { ...scenario(), leads: [lead] }
    workspace = addReferrer(workspace, { name: 'Nandi', contact: '', note: '' }, NOW)
    workspace = saveReferral(workspace, { referrerId: workspace.referrers[0].id, customerName: 'Alpha', customerContact: '', accountNumber: '5-1' }, NOW)
    const review = reviewMonth(workspace, OCTOBER, NOW)
    // Alpha's 19,900 package earns R20 and is due until it is paid.
    expect(review.rewards).toMatchObject({ earnedCents: 2_000, dueCents: 2_000, dueCount: 1, paidCents: 0 })
    const paid = markReferralPaid(workspace, workspace.referrals[0].id, NOW)
    expect(reviewMonth(paid, OCTOBER, NOW).rewards).toMatchObject({ dueCents: 0, paidCents: 2_000, paidCount: 1 })
  })

  it('reports no activity for an empty month and offers only months that hold work', () => {
    const empty = reviewMonth(workspaceWith(), OCTOBER, NOW)
    expect(empty.hasActivity).toBe(false)
    expect(empty.totals.calls).toBe(0)
    expect(empty.bestDay).toBeNull()
    expect(empty.daily.every(point => point.calls === 0)).toBe(true)

    const months = recentMonths(scenario(), NOW)
    expect(months[0].key).toBe('2026-10')
    expect(months.map(item => item.key)).toEqual(['2026-10', '2026-09'])
    // An empty workspace still offers this month.
    expect(recentMonths(workspaceWith(), NOW).map(item => item.key)).toEqual(['2026-10'])
  })

  it('formats relative change without dividing by zero', () => {
    expect(change(5, 0)).toEqual({ direction: 'up', text: 'new' })
    expect(change(0, 0)).toEqual({ direction: 'flat', text: 'no change' })
    expect(change(6, 5)).toEqual({ direction: 'up', text: '+20%' })
    expect(change(4, 5).direction).toBe('down')
    expect(pointsChange(0.5, 0.4)).toEqual({ direction: 'up', text: '+10 pts' })
    expect(pointsChange(0.5, 0.5).direction).toBe('flat')
  })

  it('keeps the review honest about a sale recorded and activated in different months', () => {
    // A sale recorded last month and activated this month must not appear twice.
    const review = reviewMonth(scenario(), OCTOBER, NOW)
    const totals = review.totals
    expect(totals.sales + review.previous.activations).toBeGreaterThan(0)
    const recount = reviewMonth({ ...scenario(), sales: scenario().sales.filter(sale => sale.id !== 's4') }, OCTOBER, NOW)
    expect(recount.totals.activations).toBe(totals.activations - 1)
    // ...and the money follows the activation, not the sale date.
    expect(recount.totals.activationValueCents).toBe(totals.activationValueCents - 14_900)
    expect(recount.totals.sales).toBe(totals.sales)
  })
})

describe('monthly review with an unsold month', () => {
  it('still shows a month that only has referral payments', () => {
    let workspace: Workspace = { ...workspaceWith(), referrals: [], referrers: [] }
    workspace = addReferrer(workspace, { name: 'Simon', contact: '', note: '' }, NOW)
    workspace = saveReferral(workspace, { referrerId: workspace.referrers[0].id, customerName: 'Paid Person', customerContact: '', accountNumber: null }, NOW)
    expect(reviewMonth(workspace, OCTOBER, NOW).hasActivity).toBe(false)
    expect(recordSale(workspace, makeLead('5-5'), 'Any', NOW)).not.toBe(workspace)
    expect(updateSaleStage).toBeTypeOf('function')
  })
})
