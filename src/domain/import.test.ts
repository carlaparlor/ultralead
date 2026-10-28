import { describe, expect, it } from 'vitest'
import { parseLeads } from './import'
import { applyImport, recordNotInterested, saveCallback, saveNotes } from './workspace'
import { createDemoWorkspace } from './demo'
import { makeLead, NOW, workspaceWith } from './testFixtures'
import { readiness } from './queue'

describe('lead import', () => {
  it('reads the supplied tab-separated format and filters Active rows', () => {
    const preview = parseLeads('Ezrela Milza\t \t \tActive\tConsumer\t5-36192598740307\t8406778994089\t2026-09-01\n\nMbiza Butezi\t \t \tProspect\tConsumer\t5-36192669817268\t9908169875084\t2026-09-01', NOW)
    expect(preview.totalRows).toBe(2)
    expect(preview.excluded.map(row => row.reason)).toEqual(['active'])
    expect(preview.leads).toMatchObject([{ name: 'Mbiza Butezi', accountNumber: '5-36192669817268', customerId: '9908169875084', listDate: '2026-09-01', sourceStatus: 'Prospect' }])
    expect(preview.needsAgeReview).toBe(0)
  })
  it('filters Active, Archived, explicit 60+ and known customers aged 60 or older', () => {
    const preview = parseLeads([
      'A A active Consumer 5-1 9001010000000 2026-01-01',
      'B B ARCHIVED Consumer 5-2 9001010000000 2026-01-01',
      'C C 60+ Consumer 5-3 9001010000000 2026-01-01',
      'D D Prospect Consumer 5-4 6610280000000 2026-01-01',
      'E E Prospect Consumer 5-5 6610290000000 2026-01-01',
    ].join('\n'), NOW)
    expect(preview.excluded.map(row => row.reason)).toEqual(['active', 'archived', 'age_60_plus', 'age_60_plus'])
    expect(preview.leads.map(row => row.accountNumber)).toEqual(['5-5'])
  })
  it('does not confuse a status-like word in a name for the actual later status', () => {
    const preview = parseLeads('Active Smith Prospect Consumer 5-8 9001010000000', NOW)
    expect(preview.leads[0]).toMatchObject({ name: 'Active Smith', sourceStatus: 'Prospect' })
    expect(preview.excluded).toHaveLength(0)
  })
  it('handles large batches without duplicating accounts', () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `Person ${i} ${i % 2 ? 'Active' : 'Prospect'} Consumer 5-${i + 1} 9001010000000`).join('\n')
    const preview = parseLeads(rows, NOW)
    const next = applyImport(workspaceWith(), preview, 'replace', NOW)
    expect(next.leads).toHaveLength(1500)
    expect(Object.keys(next.profiles)).toHaveLength(1500)
  })
  it('holds missing or impossible IDs for review, but reports malformed rows', () => {
    const preview = parseLeads('No ID Prospect Consumer 5-1 2026-01-01\nBad Date Prospect Consumer 5-2 8406778994089 2026-01-01\nMissing Account Prospect Consumer\n5-999 9001010000000', NOW)
    expect(preview.leads).toHaveLength(2)
    expect(preview.needsAgeReview).toBe(2)
    expect(preview.invalidRows).toEqual([{ line: 3, reason: 'Missing a 5- account number.' }, { line: 4, reason: 'Missing a customer name.' }])
  })
  it.each([
    ['Jane Prospect Consumer 5-1 9001010000000\nJane Active Consumer 5-1 9001010000000'],
    ['Jane Active Consumer 5-1 9001010000000\nJane Prospect Consumer 5-1 9001010000000'],
  ])('deduplicates and lets an excluded row win conflicts regardless of order', input => {
    const preview = parseLeads(input, NOW)
    expect(preview.duplicates).toBe(1)
    expect(preview.leads).toHaveLength(0)
    expect(preview.excluded).toHaveLength(1)
  })
  it('replaces the daily list while keeping callbacks, sales and notes', () => {
    const previous = makeLead('5-1')
    let workspace = workspaceWith(previous)
    workspace = saveNotes(workspace, previous.accountNumber, 'Remember this')
    workspace = saveCallback(workspace, previous, new Date(NOW.getTime() + 3600000).toISOString(), 'Call later', NOW)
    const preview = parseLeads('New Person Prospect Consumer 5-2 9001010000000 2026-10-28', NOW)
    const next = applyImport(workspace, preview, 'replace', NOW)
    expect(next.leads.map(item => item.accountNumber)).toEqual(['5-2'])
    expect(next.callbacks[0].lead.accountNumber).toBe('5-1')
    expect(next.profiles['5-1'].notes).toBe('Remember this')
  })
  it('removes matching leads and callbacks on an excluded import without erasing history', () => {
    const old = makeLead('5-1')
    let workspace = saveNotes(workspaceWith(old), '5-1', 'History kept')
    workspace = saveCallback(workspace, old, NOW.toISOString(), '', NOW)
    const preview = parseLeads('Old Person Active Consumer 5-1 9001010000000', NOW)
    const next = applyImport(workspace, preview, 'append', NOW)
    expect(next.leads).toHaveLength(0)
    expect(next.callbacks).toHaveLength(0)
    expect(next.profiles['5-1'].notes).toBe('History kept')
    expect(next.profiles['5-1'].excludedReason).toBe('active')
  })
  it('preserves a not-interested decision across re-imports', () => {
    const old = makeLead('5-1')
    const workspace = recordNotInterested(workspaceWith(old), old, NOW)
    const next = applyImport(workspace, parseLeads('Old Person Prospect Consumer 5-1 9001010000000', NOW), 'replace', NOW)
    expect(readiness(next, next.leads[0], NOW)).toBe('not_interested')
  })
  it('replaces every sample record on the first real import, even in append mode', () => {
    const demo = createDemoWorkspace(NOW)
    const next = applyImport(demo, parseLeads('Real Person Prospect Consumer 5-1 9001010000000', NOW), 'append', NOW)
    expect(next.isDemo).toBe(false)
    expect(next.leads.map(item => item.accountNumber)).toEqual(['5-1'])
    expect(next.sales).toEqual([])
    expect(next.callbacks).toEqual([])
    expect(next.profiles).toEqual({})
  })
})
