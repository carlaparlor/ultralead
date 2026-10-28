import { describe, expect, it } from 'vitest'
import { clearCategory, editSale, recordNoAnswer, recordNotInterested, recordSale, removeCallback, removeLead, removeSale, saveCallback, saveNotes, updateSaleStage } from './workspace'
import { makeLead, NOW, workspaceWith } from './testFixtures'

describe('sales lifecycle', () => {
  it('requires a package and goes from sale through vetting and confirmation to activation', () => {
    const lead = makeLead('5-1')
    let ws = workspaceWith(lead)
    expect(recordSale(ws, lead, ' ', NOW)).toBe(ws)
    ws = recordSale(ws, lead, ' New deal ', NOW)
    const id = ws.sales[0].id
    // ATT vs non-ATT is unknown until the activation happens.
    expect(ws.sales[0]).toMatchObject({ stage: 'credit_vetting', packageName: 'New deal', activationType: null, activatedAt: null })
    expect(ws.packages).toEqual(['New deal'])
    expect(updateSaleStage(ws, id, 'activated', NOW, 'ATT')).toBe(ws) // can't bypass confirmation
    ws = updateSaleStage(ws, id, 'pending_confirmation', NOW)
    expect(ws.sales[0].stage).toBe('pending_confirmation')
    expect(ws.sales[0].activationType).toBeNull()
    // An activation cannot be completed without recording its type.
    expect(updateSaleStage(ws, id, 'activated', NOW)).toBe(ws)
    expect(updateSaleStage(ws, id, 'activated', NOW, 'Non-ATT')).not.toBe(ws)
    ws = updateSaleStage(ws, id, 'activated', NOW, 'Non-ATT')
    expect(ws.sales[0]).toMatchObject({ stage: 'activated', activationType: 'Non-ATT', activatedAt: NOW.toISOString() })
    ws = updateSaleStage(ws, id, 'pending_confirmation', NOW)
    expect(ws.sales[0].activatedAt).toBeNull()
  })
  it('prevents double-counting an existing non-declined sale', () => {
    const lead = makeLead('5-1')
    const ws = recordSale(workspaceWith(lead), lead, 'Pack', NOW)
    expect(recordSale(ws, lead, 'Pack', NOW)).toBe(ws)
  })
  it('supports decline, reopening, and changing package and type', () => {
    const lead = makeLead('5-1')
    let ws = recordSale(workspaceWith(lead), lead, 'Old', NOW)
    const id = ws.sales[0].id
    ws = updateSaleStage(ws, id, 'declined', NOW)
    expect(ws.sales[0].stage).toBe('declined')
    ws = updateSaleStage(ws, id, 'credit_vetting', NOW)
    // A type cannot be attached to a sale that has not activated.
    ws = editSale(ws, id, 'New', 'Non-ATT', NOW)
    expect(ws.sales[0]).toMatchObject({ packageName: 'New', activationType: null })
    expect(ws.packages).toEqual(['Old', 'New'])
    ws = updateSaleStage(updateSaleStage(ws, id, 'pending_confirmation', NOW), id, 'activated', NOW, 'ATT')
    ws = editSale(ws, id, 'New', 'Non-ATT', NOW)
    expect(ws.sales[0]).toMatchObject({ packageName: 'New', activationType: 'Non-ATT' })
  })
  it('does not reopen a declined sale if a newer sale is already active', () => {
    const lead = makeLead('5-1')
    let ws = recordSale(workspaceWith(lead), lead, 'Old', NOW)
    const oldId = ws.sales[0].id
    ws = updateSaleStage(ws, oldId, 'declined', NOW)
    ws = recordSale(ws, lead, 'New', NOW)
    expect(updateSaleStage(ws, oldId, 'credit_vetting', NOW)).toBe(ws)
  })
})

describe('selective data management', () => {
  it('deletes individual lead, callback or sale without touching other categories', () => {
    const a = makeLead('5-1'), b = makeLead('5-2')
    let ws = workspaceWith(a, b)
    ws = saveNotes(ws, a.accountNumber, 'Keep')
    ws = saveCallback(ws, a, NOW.toISOString(), 'Note', NOW)
    ws = recordSale(ws, b, 'Pack', NOW)
    const cbId = ws.callbacks[0].id, saleId = ws.sales[0].id
    let next = removeLead(ws, a.accountNumber)
    expect(next.callbacks).toHaveLength(1)
    expect(next.profiles['5-1'].notes).toBe('Keep')
    next = removeCallback(next, cbId)
    expect(next.sales).toHaveLength(1)
    expect(next.leads).toHaveLength(1)
    next = removeSale(next, saleId)
    expect(next.leads).toHaveLength(1)
    expect(next.profiles['5-1'].notes).toBe('Keep')
  })
  it('clears pipeline and activations independently', () => {
    const a = makeLead('5-1'), b = makeLead('5-2')
    let ws = recordSale(workspaceWith(a, b), a, 'A', NOW)
    const aId = ws.sales[0].id
    ws = updateSaleStage(ws, aId, 'pending_confirmation', NOW)
    ws = updateSaleStage(ws, aId, 'activated', NOW, 'ATT')
    ws = recordSale(ws, b, 'B', NOW)
    expect(clearCategory(ws, 'pipeline').sales.map(item => item.stage)).toEqual(['activated'])
    expect(clearCategory(ws, 'activations').sales.map(item => item.stage)).toEqual(['credit_vetting'])
    expect(clearCategory(ws, 'leads').sales).toHaveLength(2)
  })
  it('clears history only when selected, including do-not-call flags', () => {
    const lead = makeLead('5-1')
    let ws = recordNotInterested(workspaceWith(lead), lead, NOW)
    ws = saveNotes(ws, '5-1', 'Note')
    const next = clearCategory(ws, 'history')
    expect(next.profiles).toEqual({})
    expect(next.activity).toEqual([])
    expect(next.leads).toHaveLength(1)
  })
  it('upserts callbacks and removes them after a sale or not-interested outcome', () => {
    const lead = makeLead('5-1')
    let ws = saveCallback(workspaceWith(lead), lead, NOW.toISOString(), 'One', NOW)
    ws = saveCallback(ws, lead, new Date(NOW.getTime() + 60000).toISOString(), 'Two', NOW, false)
    expect(ws.callbacks).toHaveLength(1)
    expect(ws.callbacks[0].note).toBe('Two')
    expect(ws.profiles['5-1'].attempts).toHaveLength(1)
    expect(recordNotInterested(ws, lead, NOW).callbacks).toHaveLength(0)
    expect(recordSale(ws, lead, 'Pack', NOW).callbacks).toHaveLength(0)
    expect(recordNoAnswer(ws, lead, NOW).callbacks).toHaveLength(1)
  })
})
