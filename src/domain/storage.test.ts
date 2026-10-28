import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoWorkspace } from './demo'
import { isWorkspace, loadWorkspace, parseBackup, STORAGE_KEY } from './storage'
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
