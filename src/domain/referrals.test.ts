import { describe, expect, it } from 'vitest'
import { createDemoWorkspace } from './demo'
import { MAX_PACKAGE_PRICE_CENTS, formatRand, parsePriceCents, referralRewardCents } from './money'
import { addReferralToLeads, addReferrer, createReferralIndex, editReferrer, markReferralPaid, paymentReviewComparison, referralState, removeReferral, removeReferrer, saveReferral, voidReferralPayment } from './referrals'
import { readiness } from './queue'
import { parseBackup } from './storage'
import { applyImport, clearCategory, editSale, recordSale, removeSale, updateSaleStage } from './workspace'
import { parseLeads } from './import'
import { emptyProfile, makeLead, NOW, workspaceWith } from './testFixtures'

const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

function setup(account: string | null = '5-1') {
  const lead = makeLead('5-1', { name: 'Referred Customer' })
  let ws = workspaceWith(lead)
  ws = addReferrer(ws, ' Referrer One ', ' 082 000 0101 ', NOW)
  ws = saveReferral(ws, { referrerId: ws.referrers[0].id, customerName: 'Referred Customer', customerContact: '', accountNumber: account }, NOW)
  return { ws, lead, id: ws.referrals[0].id }
}

function activate(price: number | null) {
  const { ws: initial, lead, id } = setup()
  let ws = recordSale(initial, lead, 'A package', NOW, price)
  const saleId = ws.sales[0].id
  ws = updateSaleStage(ws, saleId, 'pending_confirmation', later(1))
  ws = updateSaleStage(ws, saleId, 'activated', later(2), 'ATT')
  return { ws, lead, id, saleId }
}

describe('referral reward calculation', () => {
  it('uses exact cents with the R200 boundary included in the R20 tier', () => {
    expect(referralRewardCents(0)).toBe(2000)
    expect(referralRewardCents(19_999)).toBe(2000)
    expect(referralRewardCents(20_000)).toBe(2000)
    expect(referralRewardCents(20_001)).toBe(3000)
    expect(referralRewardCents(MAX_PACKAGE_PRICE_CENTS)).toBe(3000)
    for (const bad of [-1, 1.5, NaN, Infinity, MAX_PACKAGE_PRICE_CENTS + 1]) expect(referralRewardCents(bad)).toBeNull()
  })
  it('parses only real prices to the cent, including South African decimal commas', () => {
    expect(parsePriceCents('200')).toBe(20_000)
    expect(parsePriceCents(' 200.01 ')).toBe(20_001)
    expect(parsePriceCents('199,99')).toBe(19_999)
    expect(parsePriceCents('0')).toBe(0)
    for (const bad of ['', '-2', '200.001', '1,200.00', 'R200', 'Infinity', '100000000']) expect(parsePriceCents(bad)).toBeNull()
    expect(formatRand(20_001)).toBe('R200.01')
    expect(formatRand(123_450)).toBe('R1,234.50')
  })
})

describe('referral lifecycle', () => {
  it('derives the same results with or without the list index', () => {
    const ws = createDemoWorkspace(NOW)
    const index = createReferralIndex(ws)
    for (const referral of ws.referrals) expect(referralState(ws, referral, NOW, index)).toEqual(referralState(ws, referral, NOW))
  })
  it('only becomes payable after confirmation and activation, and needs a real price', () => {
    let { ws, lead, id } = setup()
    expect(referralState(ws, ws.referrals[0], NOW).status).toBe('awaiting_sale')
    expect(markReferralPaid(ws, id, NOW)).toBe(ws)
    ws = recordSale(ws, lead, 'Package 200', NOW) // a name is not a price
    const sale = ws.sales[0].id
    expect(referralState(ws, ws.referrals[0], NOW)).toMatchObject({ status: 'credit_vetting', dueCents: 0 })
    ws = updateSaleStage(ws, sale, 'declined', later(1))
    expect(referralState(ws, ws.referrals[0], NOW).status).toBe('declined')
    ws = updateSaleStage(ws, sale, 'credit_vetting', later(2))
    ws = updateSaleStage(ws, sale, 'pending_confirmation', later(3))
    expect(referralState(ws, ws.referrals[0], NOW)).toMatchObject({ status: 'pending_confirmation', dueCents: 0 })
    expect(markReferralPaid(ws, id, NOW)).toBe(ws)
    ws = updateSaleStage(ws, sale, 'activated', later(4), 'Non-ATT')
    expect(referralState(ws, ws.referrals[0], NOW)).toMatchObject({ status: 'needs_price', dueCents: 0 })
    expect(markReferralPaid(ws, id, NOW)).toBe(ws)
    ws = editSale(ws, sale, 'Package 200', 'Non-ATT', later(5), 20_000)
    expect(referralState(ws, ws.referrals[0], NOW)).toMatchObject({ status: 'ready', dueCents: 2000 })
    ws = editSale(ws, sale, 'Package 200', 'Non-ATT', later(6), 20_001)
    expect(referralState(ws, ws.referrals[0], NOW)).toMatchObject({ status: 'ready', dueCents: 3000 })
  })
  it('attaches the next non-declined sale rather than an older declined one', () => {
    let { ws, lead } = setup()
    ws = recordSale(ws, lead, 'First', NOW, 20000)
    const old = ws.sales[0].id
    ws = updateSaleStage(ws, old, 'declined', later(1))
    ws = recordSale(ws, lead, 'Second', later(2), 20001)
    const current = ws.sales[0].id
    ws = updateSaleStage(ws, current, 'pending_confirmation', later(3))
    ws = updateSaleStage(ws, current, 'activated', later(4), 'ATT')
    expect(referralState(ws, ws.referrals[0], later(4))).toMatchObject({ status: 'ready', dueCents: 3000, sale: { id: current } })
    expect(referralState(ws, ws.referrals[0], later(4), createReferralIndex(ws))).toEqual(referralState(ws, ws.referrals[0], later(4)))
  })
  it('allows capturing a name first, linking later, and survives replacing the daily list', () => {
    let { ws, id } = setup(null)
    expect(referralState(ws, ws.referrals[0], NOW).status).toBe('needs_link')
    ws = saveReferral(ws, { referrerId: ws.referrers[0].id, customerName: 'Referred Customer', customerContact: '082 000 0102', accountNumber: '5-1' }, NOW, id)
    ws = applyImport(ws, parseLeads('Other Prospect Consumer 5-2 9001010000000', NOW), 'replace', NOW)
    expect(ws.referrals[0]).toMatchObject({ accountNumber: '5-1', customerContact: '082 000 0102' })
    expect(referralState(ws, ws.referrals[0], NOW).status).toBe('not_in_list')
    ws = addReferralToLeads(ws, id, NOW)
    const lead = ws.leads.find(item => item.accountNumber === '5-1')!
    expect(lead.customerId).toBe('')
    expect(readiness(ws, lead, NOW)).toBe('age_review')
    expect(referralState(ws, ws.referrals[0], NOW).status).toBe('age_review')
  })
  it('never bypasses an existing exclusion or duplicates a linked account', () => {
    let { ws, id } = setup()
    ws = { ...ws, leads: [], profiles: { '5-1': { notes: '', attempts: [], doNotCall: false, excludedReason: 'active', queueResetAt: null } } }
    expect(addReferralToLeads(ws, id, NOW)).toBe(ws)
    const duplicate = saveReferral(ws, { referrerId: ws.referrers[0].id, customerName: 'Another name', customerContact: '', accountNumber: ' 5-1 ' }, NOW)
    expect(duplicate).toBe(ws)
    expect(saveReferral(ws, { referrerId: ws.referrers[0].id, customerName: 'A', customerContact: '', accountNumber: 'bad' }, NOW)).toBe(ws)
  })
  it('preserves exclusions and do-not-call decisions even when the account is absent from the list', () => {
    const { ws, id } = setup()
    const absent = { ...ws, leads: [] }
    const excluded = { ...absent, profiles: { '5-1': { ...emptyProfile(), excludedReason: 'active' as const, doNotCall: true } } }
    const notInterested = { ...absent, profiles: { '5-1': { ...emptyProfile(), doNotCall: true } } }
    for (const [workspace, status] of [[excluded, 'excluded'], [notInterested, 'not_interested']] as const) {
      const state = referralState(workspace, workspace.referrals[0], NOW)
      expect(state).toMatchObject({ status, dueCents: 0, lead: undefined })
      expect(referralState(workspace, workspace.referrals[0], NOW, createReferralIndex(workspace))).toEqual(state)
      expect(addReferralToLeads(workspace, id, NOW)).toBe(workspace)
    }
    expect(referralState(absent, absent.referrals[0], NOW).status).toBe('not_in_list')
    expect(addReferralToLeads(absent, id, NOW)).not.toBe(absent)
  })
  it('stops an unpaid reward when the activation is reversed or removed', () => {
    const { ws, id, saleId } = activate(20_000)
    const reversed = updateSaleStage(ws, saleId, 'pending_confirmation', later(3))
    expect(referralState(reversed, reversed.referrals[0], later(3))).toMatchObject({ status: 'pending_confirmation', dueCents: 0 })
    expect(markReferralPaid(reversed, id, later(3))).toBe(reversed)
    const deleted = removeSale(ws, saleId)
    expect(referralState(deleted, deleted.referrals[0], later(3))).toMatchObject({ status: 'sale_missing', dueCents: 0 })
    expect(markReferralPaid(deleted, id, later(3))).toBe(deleted)
  })
  it('validates price changes, including the activation-time price', () => {
    const { ws: initial, lead } = setup()
    expect(recordSale(initial, lead, 'Deal', NOW, -1)).toBe(initial)
    let ws = recordSale(initial, lead, 'Deal', NOW)
    const id = ws.sales[0].id
    expect(editSale(ws, id, 'Deal', null, NOW, 1.5)).toBe(ws)
    ws = updateSaleStage(ws, id, 'pending_confirmation', NOW)
    expect(updateSaleStage(ws, id, 'activated', NOW, 'ATT', -100)).toBe(ws)
    ws = updateSaleStage(ws, id, 'activated', NOW, 'ATT', 20_001)
    expect(referralState(ws, ws.referrals[0], NOW)).toMatchObject({ status: 'ready', dueCents: 3000 })
  })
})

describe('manual payments and corrections', () => {
  it('records a snapshot exactly once and rejects stale confirmations', () => {
    const { ws, id, saleId } = activate(20_000)
    const expectation = { referrerId: ws.referrers[0].id, referrerName: ws.referrers[0].name, referrerContact: ws.referrers[0].contact, customerName: ws.referrals[0].customerName, accountNumber: '5-1', saleId, activatedAt: ws.sales[0].activatedAt!, packageName: 'A package', packagePriceCents: 20_000, amountCents: 2000 }
    const changed = editSale(ws, saleId, 'A package', 'ATT', later(3), 20_001)
    expect(markReferralPaid(changed, id, later(4), expectation)).toBe(changed)
    const paid = markReferralPaid(ws, id, later(4), expectation)
    expect(referralState(paid, paid.referrals[0], later(4))).toMatchObject({ status: 'paid', dueCents: 0, payment: { amountCents: 2000, packagePriceCents: 20_000, saleId } })
    expect(markReferralPaid(paid, id, later(5))).toBe(paid)
    expect(removeReferral(paid, id)).toBe(paid)
    expect(removeReferrer(paid, paid.referrers[0].id)).toBe(paid)
    expect(saveReferral(paid, { referrerId: paid.referrers[0].id, customerName: 'Name', customerContact: '', accountNumber: '5-2' }, later(5), id)).toBe(paid)
  })
  it('keeps paid history and flags review after reversal, deletion or price changes, never paying twice', () => {
    const { ws, id, saleId } = activate(20_001)
    const paid = markReferralPaid(ws, id, later(5))
    const reversed = updateSaleStage(paid, saleId, 'pending_confirmation', later(6))
    expect(referralState(reversed, reversed.referrals[0], later(6))).toMatchObject({ status: 'paid_review', dueCents: 0, payment: { amountCents: 3000 } })
    const reactivated = updateSaleStage(reversed, saleId, 'activated', later(7), 'ATT')
    expect(referralState(reactivated, reactivated.referrals[0], later(7)).status).toBe('paid_review')
    expect(markReferralPaid(reactivated, id, later(7))).toBe(reactivated)
    const deleted = removeSale(paid, saleId)
    expect(referralState(deleted, deleted.referrals[0], later(7))).toMatchObject({ status: 'paid_review', payment: { amountCents: 3000 } })
    const edited = editSale(paid, saleId, 'A package', 'ATT', later(7), 20_000)
    expect(referralState(edited, edited.referrals[0], later(7)).status).toBe('paid_review')
    expect(clearCategory(paid, 'activations').referrals[0].payments).toHaveLength(1)
  })
  it('compares a changed price against the original payment without creating another amount due', () => {
    const { ws, id, saleId } = activate(20_000)
    const paid = markReferralPaid(ws, id, later(3))
    expect(paymentReviewComparison(referralState(paid, paid.referrals[0], later(3)))).toBeNull()

    for (const [price, currentRewardCents, differenceCents] of [[20_001, 3000, 1000], [19_999, 2000, 0]] as const) {
      const changed = editSale(paid, saleId, 'A package', 'ATT', later(4), price)
      const state = referralState(changed, changed.referrals[0], later(4))
      expect(state).toMatchObject({ status: 'paid_review', dueCents: 0, payment: { amountCents: 2000, packagePriceCents: 20_000 } })
      expect(paymentReviewComparison(state)).toEqual({ currentRewardCents, paidCents: 2000, differenceCents })
      expect(markReferralPaid(changed, id, later(5))).toBe(changed)
    }

    const higher = activate(20_001)
    const paidHigher = markReferralPaid(higher.ws, higher.id, later(3))
    const reduced = editSale(paidHigher, higher.saleId, 'A package', 'ATT', later(4), 20_000)
    const reducedState = referralState(reduced, reduced.referrals[0], later(4))
    expect(paymentReviewComparison(reducedState)).toEqual({ currentRewardCents: 2000, paidCents: 3000, differenceCents: -1000 })
    expect(reducedState).toMatchObject({ status: 'paid_review', dueCents: 0 })
    expect(markReferralPaid(reduced, higher.id, later(5))).toBe(reduced)
  })
  it('does not compare against a missing price, reversed or replaced activation', () => {
    const { ws, id, lead, saleId } = activate(20_000)
    const paid = markReferralPaid(ws, id, later(3))
    const unpriced = editSale(paid, saleId, 'A package', 'ATT', later(4), null)
    const reversed = updateSaleStage(paid, saleId, 'pending_confirmation', later(4))
    const reactivated = updateSaleStage(reversed, saleId, 'activated', later(5), 'ATT', 20_001)
    const removed = removeSale(paid, saleId)
    let replacement = recordSale(removed, lead, 'New package', later(5), 20_001)
    const replacementId = replacement.sales[0].id
    replacement = updateSaleStage(replacement, replacementId, 'pending_confirmation', later(6))
    replacement = updateSaleStage(replacement, replacementId, 'activated', later(7), 'ATT')
    for (const changed of [unpriced, reversed, reactivated, removed, replacement]) {
      const state = referralState(changed, changed.referrals[0], later(8))
      expect(state).toMatchObject({ status: 'paid_review', dueCents: 0, payment: { amountCents: 2000 } })
      expect(paymentReviewComparison(state)).toBeNull()
      expect(markReferralPaid(changed, id, later(8))).toBe(changed)
    }
  })
  it('allows attribution corrections only after voiding the paid mark, without rewriting history', () => {
    const { ws, id } = activate(20_000)
    let paid = markReferralPaid(ws, id, later(3))
    const original = paid.referrals[0].payments[0]
    paid = addReferrer(paid, 'Correct referrer', '', later(3))
    const details = { referrerId: paid.referrers[1].id, customerName: 'Other customer', customerContact: '', accountNumber: '5-2' }
    expect(saveReferral(paid, details, later(4), id)).toBe(paid)
    const corrected = voidReferralPayment(paid, id, original.id, later(4))
    const reassigned = saveReferral(corrected, details, later(5), id)
    expect(reassigned.referrals[0]).toMatchObject({ referrerId: paid.referrers[1].id, accountNumber: '5-2' })
    expect(reassigned.referrals[0].payments[0]).toMatchObject({ accountNumber: '5-1', referrerName: 'Referrer One', customerName: 'Referred Customer', voidedAt: later(4).toISOString() })
    expect(parseBackup(JSON.stringify(reassigned))).toEqual(reassigned)
    expect(removeReferral(reassigned, id)).toBe(reassigned)
  })
  it('preserves corrected marks, and lets a genuinely unpaid referral become due again', () => {
    const { ws, id } = activate(20_000)
    const paid = markReferralPaid(ws, id, later(3))
    const payment = paid.referrals[0].payments[0]
    const corrected = voidReferralPayment(paid, id, payment.id, later(4))
    expect(corrected.referrals[0].payments[0].voidedAt).toBe(later(4).toISOString())
    expect(referralState(corrected, corrected.referrals[0], later(4))).toMatchObject({ status: 'ready', dueCents: 2000 })
    const paidAgain = markReferralPaid(corrected, id, later(5))
    expect(paidAgain.referrals[0].payments).toHaveLength(2)
    expect(referralState(paidAgain, paidAgain.referrals[0], later(5)).status).toBe('paid')
    expect(editReferrer(paidAgain, paidAgain.referrers[0].id, 'Corrected name', '')).not.toBe(paidAgain)
  })
})
