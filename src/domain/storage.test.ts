import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoWorkspace } from './demo'
import { createLocalWorkspaceRepository, isWorkspace, LEGACY_STORAGE_KEY, loadWorkspace, parseBackup, STORAGE_KEY } from './storage'
import { makeLead, NOW, workspaceWith } from './testFixtures'

describe('storage and backups', () => {
  beforeEach(() => localStorage.clear())
  it('starts with a visibly marked demo only when no data is saved', () => {
    expect(loadWorkspace(localStorage, NOW).workspace.isDemo).toBe(true)
    const empty = workspaceWith()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty))
    expect(loadWorkspace(localStorage, NOW).workspace.isDemo).toBe(false)
  })
  it('round-trips a valid backup and refuses malformed, duplicate or foreign data', () => {
    const ws = createDemoWorkspace(NOW)
    expect(parseBackup(JSON.stringify(ws))).toEqual(ws)
    expect(parseBackup('{invalid')).toBeNull()
    expect(parseBackup(JSON.stringify({ ...ws, version: 99 }))).toBeNull()
    expect(isWorkspace({ ...ws, leads: [...ws.leads, ws.leads[0]] })).toBe(false)
    expect(isWorkspace({ ...ws, sales: [{ ...ws.sales[0], activationType: 'other' }] })).toBe(false)
    // A completed activation must carry its type; an unactivated sale must not invent one.
    const activated = ws.sales.find(sale => sale.stage === 'activated')!
    expect(isWorkspace({ ...ws, sales: [{ ...activated, activationType: null }] })).toBe(false)
    const pending = ws.sales.find(sale => sale.stage !== 'activated')!
    expect(isWorkspace({ ...ws, sales: [{ ...pending, activationType: null }] })).toBe(true)
  })
  it('migrates existing version-1 workspaces and backups without inventing prices or referrals', () => {
    const current = createDemoWorkspace(NOW)
    const { referrals: _referrals, referrers: _referrers, ...core } = current
    const legacy = { ...core, version: 1, sales: current.sales.map(({ packagePriceCents: _price, ...sale }) => sale) }
    const restored = parseBackup(JSON.stringify(legacy))!
    expect(restored.version).toBe(2)
    expect(restored.sales).toHaveLength(legacy.sales.length)
    expect(restored.sales.every(sale => sale.packagePriceCents === null)).toBe(true)
    expect(restored.referrals).toEqual([])
    expect(restored.referrers).toEqual([])
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy))
    const repository = createLocalWorkspaceRepository(localStorage)
    const loaded = repository.load(NOW)
    expect(loaded.warning).toBeNull()
    expect(loaded.workspace.sales[0].packagePriceCents).toBeNull()
    repository.save(loaded.workspace)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(2)
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    // A stale older tab can change its old key without overwriting the upgraded workspace.
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...legacy, leads: [] }))
    expect(loadWorkspace(localStorage, NOW).workspace.leads).toEqual(loaded.workspace.leads)
    expect(parseBackup(JSON.stringify({ ...legacy, leads: [legacy.leads[0], legacy.leads[0]] }))).toBeNull()
  })
  it('does not remove the old workspace if saving the migrated copy fails', () => {
    const current = workspaceWith(makeLead('5-22'))
    const { referrals: _referrals, referrers: _referrers, ...core } = current
    const oldValue = JSON.stringify({ ...core, version: 1 })
    localStorage.setItem(LEGACY_STORAGE_KEY, oldValue)
    const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: () => { throw new Error('quota') }, removeItem: (key: string) => localStorage.removeItem(key) } as unknown as Storage
    const repository = createLocalWorkspaceRepository(storage)
    const loaded = repository.load(NOW)
    expect(loaded.migratedFromLegacy).toBe(true)
    expect(() => repository.save(loaded.workspace)).toThrow('quota')
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(oldValue)
  })
  it('does not delete an old copy when a newer workspace is unreadable', () => {
    const current = workspaceWith()
    const { referrals: _referrals, referrers: _referrers, ...core } = current
    const oldValue = JSON.stringify({ ...core, version: 1 })
    localStorage.setItem(LEGACY_STORAGE_KEY, oldValue)
    localStorage.setItem(STORAGE_KEY, '{corrupt')
    const repository = createLocalWorkspaceRepository(localStorage)
    const result = repository.load(NOW)
    expect(result.warning).toContain('recovery copy')
    repository.save(result.workspace)
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(oldValue)
  })
  it('validates referral links, prices, and payment snapshots in backups', () => {
    const ws = createDemoWorkspace(NOW)
    expect(isWorkspace(ws)).toBe(true)
    expect(isWorkspace({ ...ws, sales: [{ ...ws.sales[0], packagePriceCents: 200.5 }] })).toBe(false)
    expect(isWorkspace({ ...ws, referrals: [{ ...ws.referrals[0], referrerId: 'missing' }] })).toBe(false)
    expect(isWorkspace({ ...ws, referrals: [ws.referrals[0], { ...ws.referrals[0], id: 'duplicate-account' }] })).toBe(false)
    const paid = ws.referrals.find(referral => referral.payments.length)!
    expect(isWorkspace({ ...ws, referrals: [{ ...paid, payments: [{ ...paid.payments[0], amountCents: 2000 }] }] })).toBe(false)
    expect(isWorkspace({ ...ws, referrals: [{ ...paid, accountNumber: '5-999' }] })).toBe(false)
    expect(isWorkspace({ ...ws, referrals: [{ ...paid, payments: [paid.payments[0], { ...paid.payments[0], id: 'another-payment' }] }] })).toBe(false)
    const withoutSale = { ...ws, sales: ws.sales.filter(sale => sale.id !== paid.payments[0].saleId) }
    expect(parseBackup(JSON.stringify(withoutSale))).toEqual(withoutSale)
    expect(parseBackup(JSON.stringify(ws))).toEqual(ws)
  })
  it('preserves unreadable storage in a recovery key instead of silently overwriting it', () => {
    localStorage.setItem(STORAGE_KEY, '{corrupt')
    const result = loadWorkspace(localStorage, NOW)
    expect(result.workspace.isDemo).toBe(false)
    expect(result.warning).toContain('recovery copy')
    expect(localStorage.getItem('ultralead-plus.unreadable-backup')).toBe('{corrupt')
  })
  it('cleans expired leads when loading a valid saved workspace', () => {
    const lead = makeLead('5-1', { customerId: '6610290000000' })
    const ws = workspaceWith(lead)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    expect(loadWorkspace(localStorage, new Date(2026, 9, 29, 10)).workspace.leads).toEqual([])
  })
  it('reports unavailable storage instead of crashing', () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage
    const result = loadWorkspace(storage, NOW)
    expect(result.canSave).toBe(false)
    expect(result.warning).toContain('unavailable')
  })
})
