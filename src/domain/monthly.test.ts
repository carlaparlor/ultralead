import { describe, expect, it } from 'vitest'
import { emptyProfile, type CallAttempt, type Workspace } from './types'
import { createEmptyWorkspace, recordSale, updateSaleStage } from './workspace'
import { makeLead } from './testFixtures'
import { groupActivationsByMonth, isMonthKey, monthTrend, monthlyInsights, monthlyPerformance } from './monthly'

const NOW = new Date(2026, 10, 18, 12, 0, 0) // 18 November 2026

/** A lead whose activation (and sale) is dated in the given month. */
function activated(account: string, month: Date, options: { type?: 'ATT' | 'Non-ATT'; price?: number | null; name?: string } = {}) {
  const lead = makeLead(account, { name: options.name ?? `Person ${account}` })
  let workspace: Workspace = { ...createEmptyWorkspace(NOW), leads: [lead] }
  workspace = recordSale(workspace, lead, 'Package', month, options.price === undefined ? 20_000 : options.price)
  const id = workspace.sales[0].id
  workspace = updateSaleStage(workspace, id, 'pending_confirmation', month)
  return updateSaleStage(workspace, id, 'activated', month, options.type ?? 'ATT')
}

function merge(...workspaces: Workspace[]): Workspace {
  const first = workspaces[0]
  return workspaces.reduce((all, next) => ({
    ...all,
    leads: [...all.leads.filter(lead => !next.leads.some(item => item.accountNumber === lead.accountNumber)), ...next.leads],
    sales: [...all.sales.filter(sale => !next.sales.some(item => item.id === sale.id)), ...next.sales],
    profiles: { ...all.profiles, ...next.profiles },
  }), first)
}

const withAttempt = (workspace: Workspace, account: string, at: Date, outcome: CallAttempt['outcome'] = 'no_answer'): Workspace => {
  const profile = workspace.profiles[account] ?? emptyProfile()
  return {
    ...workspace,
    profiles: {
      ...workspace.profiles,
      [account]: { ...profile, attempts: [...profile.attempts, { id: `a-${at.getTime()}-${outcome}`, at: at.toISOString(), outcome }] },
    },
  }
}

describe('monthTrend', () => {
  it('names a first month instead of a meaningless percentage', () => {
    expect(monthTrend(3, 0)).toEqual({ direction: 'up', text: 'first month' })
    expect(monthTrend(0, 0)).toEqual({ direction: 'flat', text: 'no change' })
  })

  it('reports the change against last month and treats noise as no change', () => {
    expect(monthTrend(6, 3).text).toBe('+100% vs last month')
    expect(monthTrend(2, 4).text).toBe('-50% vs last month')
    expect(monthTrend(2000, 1999).text).toBe('no change')
  })
})

describe('monthlyPerformance', () => {
  it('counts the month in progress separately from the months before it', () => {
    const workspace = merge(
      activated('5-1', new Date(2026, 9, 4)), // October
      activated('5-2', new Date(2026, 10, 2)), // November
      activated('5-3', new Date(2026, 10, 9), { type: 'Non-ATT', price: 400_00 }),
    )
    const performance = monthlyPerformance(workspace, NOW)
    expect(performance.current.key).toBe('2026-11')
    expect(performance.current.pipeline.activated).toBe(2)
    expect(performance.current.pipeline.att).toBe(1)
    expect(performance.current.pipeline.nonAtt).toBe(1)
    expect(performance.current.pipeline.activatedValueCents).toBe(600_00)
    expect(performance.previous.pipeline.activated).toBe(1)
    // The trend window is the six months ending with the month in progress.
    expect(performance.months.map(month => month.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(performance.history.map(month => month.key)).toEqual(['2026-10', '2026-11'])
  })

  it('attributes an activation to the month it happened, not the month the sale was recorded', () => {
    const lead = makeLead('5-9', { name: 'Slow Deal' })
    let workspace: Workspace = { ...createEmptyWorkspace(NOW), leads: [lead] }
    workspace = recordSale(workspace, lead, 'Package', new Date(2026, 9, 30), 20_000)
    const id = workspace.sales[0].id
    workspace = updateSaleStage(workspace, id, 'pending_confirmation', new Date(2026, 9, 30))
    workspace = updateSaleStage(workspace, id, 'activated', new Date(2026, 10, 3), 'ATT')
    const performance = monthlyPerformance(workspace, NOW)
    expect(performance.previous.pipeline.activated).toBe(0)
    expect(performance.current.pipeline.activated).toBe(1)
    expect(performance.current.pipeline.recorded).toBe(0) // the sale itself was recorded in October
  })

  it('holds future-dated attempts out of the month and ignores months after this one', () => {
    const workspace = withAttempt(withAttempt(activated('5-1', new Date(2026, 10, 2)), '5-1', new Date(2026, 10, 10)), '5-1', new Date(2026, 11, 2))
    const performance = monthlyPerformance(workspace, NOW)
    // The recorded sale and the 10 November call count; the 2 December call does not.
    expect(performance.current.calls.attempts).toBe(2)
    expect(performance.months.some(month => month.key === '2026-12')).toBe(false)
  })

  it('counts an activation made moments ago even before the workspace clock ticks', () => {
    const workspace = activated('5-1', new Date(2026, 10, 18, 11, 59, 59))
    expect(monthlyPerformance(workspace, NOW).current.pipeline.activated).toBe(1)
  })

  it('projects only once there is enough of the month to project from', () => {
    const workspace = activated('5-1', new Date(2026, 10, 2))
    const early = monthlyPerformance(workspace, new Date(2026, 10, 2))
    expect(early.projectedActivations).toBeNull()
    expect(monthlyPerformance(workspace, NOW).projectedActivations).toBeGreaterThan(0)
  })

  it('averages over active months only, best month excludes the one in progress', () => {
    const workspace = merge(
      activated('5-1', new Date(2026, 8, 5)),
      activated('5-2', new Date(2026, 8, 6)),
      activated('5-3', new Date(2026, 9, 5)),
      activated('5-4', new Date(2026, 10, 5)),
    )
    const performance = monthlyPerformance(workspace, NOW)
    expect(performance.activationsPerActiveMonth).toBeCloseTo(3 / 2, 5)
    expect(performance.best?.month.key).toBe('2026-09')
    expect(performance.streak).toBe(3)
  })

  it('measures a target against this month only', () => {
    const settings = { ...createEmptyWorkspace(NOW).settings, monthlyActivationTarget: 2 }
    const one = { ...merge(activated('5-1', new Date(2026, 10, 5)), activated('5-6', new Date(2026, 9, 5))), settings }
    const two = { ...merge(one, activated('5-2', new Date(2026, 10, 6))), settings }
    // Last month's activation does not count towards this month's target.
    expect(monthlyPerformance(one, NOW).target).toEqual({ activations: 2, reachedAt: null })
    expect(monthlyPerformance(two, NOW).target.reachedAt?.getDate()).toBe(6)
    expect(monthlyPerformance({ ...one, settings: { ...settings, monthlyActivationTarget: null } }, NOW).target).toEqual({ activations: null, reachedAt: null })
  })

  it('reports no activity for an empty workspace without inventing numbers', () => {
    const performance = monthlyPerformance(createEmptyWorkspace(NOW), NOW)
    expect(performance.hasActivity).toBe(false)
    expect(performance.current.pipeline.activated).toBe(0)
    expect(performance.previous.key).toBe('2026-10')
    expect(performance.best).toBeNull()
    expect(performance.packages).toEqual([])
    expect(performance.days).toHaveLength(30)
    expect(performance.months.every(month => month.pipeline.activated === 0)).toBe(true)
  })
})

describe('monthlyInsights', () => {
  it('points at what is happening rather than offering generic advice', () => {
    const workspace = { ...merge(activated('5-1', new Date(2026, 9, 4)), activated('5-2', new Date(2026, 10, 5))), settings: { ...createEmptyWorkspace(NOW).settings, monthlyActivationTarget: 3 } }
    const insights = monthlyInsights(monthlyPerformance(workspace, NOW))
    expect(insights.length).toBeGreaterThan(0)
    expect(insights.map(insight => insight.id)).toContain('target-gap')
    expect(insights.every(insight => insight.detail.length > 0)).toBe(true)
  })
})

describe('groupActivationsByMonth', () => {
  it('groups newest month first with its own ATT and value subtotals', () => {
    const workspace = merge(
      activated('5-1', new Date(2026, 9, 4)),
      activated('5-2', new Date(2026, 10, 2), { type: 'ATT', price: 20_000 }),
      activated('5-3', new Date(2026, 10, 9), { type: 'Non-ATT', price: null }),
    )
    const groups = groupActivationsByMonth(workspace, NOW)
    expect(groups.map(group => group.key)).toEqual(['2026-11', '2026-10'])
    expect(groups[0]).toMatchObject({ count: 2, att: 1, nonAtt: 1, withoutPrice: 1, valueCents: 20_000, isCurrent: true })
    expect(groups[0].label).toBe('November 2026')
    expect(groups[1]).toMatchObject({ count: 1, isCurrent: false })
  })

  it('leaves out sales that never activated and activations dated after this month', () => {
    const lead = makeLead('5-7')
    let workspace: Workspace = { ...createEmptyWorkspace(NOW), leads: [lead] }
    workspace = recordSale(workspace, lead, 'Package', new Date(2026, 10, 2), 20_000)
    expect(workspace.sales[0].stage).not.toBe('activated')
    workspace = merge(workspace, activated('5-8', new Date(2026, 11, 2)))
    expect(groupActivationsByMonth(workspace, NOW)).toEqual([])
  })
})

describe('isMonthKey', () => {
  it('only accepts a year and month', () => {
    expect(isMonthKey('2026-11')).toBe(true)
    expect(isMonthKey('2026-1')).toBe(false)
    expect(isMonthKey(null)).toBe(false)
  })
})
