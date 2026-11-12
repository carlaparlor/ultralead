import { useMemo, useState } from 'react'
import { ArrowRight, Info } from 'lucide-react'
import { formatDate } from '../domain/dates'
import { formatRand } from '../domain/money'
import { activePayment } from '../domain/referrals'
import type { Referral, ReferralPayment, Referrer, Workspace } from '../domain/types'
import { Modal } from './ui'

export interface ReferralFormValues {
  referrerId: string
  newReferrerName: string
  newReferrerContact: string
  customerName: string
  customerContact: string
  accountNumber: string | null
}

export function ReferralModal({ workspace, referral, onClose, onSave }: {
  workspace: Workspace; referral?: Referral; onClose: () => void; onSave: (values: ReferralFormValues) => void;
}) {
  const [referrerId, setReferrerId] = useState(referral?.referrerId ?? (workspace.referrers.length ? '' : 'new'))
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [customerName, setCustomerName] = useState(referral?.customerName ?? '')
  const [customerContact, setCustomerContact] = useState(referral?.customerContact ?? '')
  const [account, setAccount] = useState(referral?.accountNumber ?? '')
  const locked = !!referral && !!activePayment(referral)
  const normalizedAccount = account.trim().toUpperCase()
  const invalidAccount = !!normalizedAccount && !/^5-\d+$/.test(normalizedAccount)
  const duplicate = !!normalizedAccount && workspace.referrals.some(item => item.id !== referral?.id && item.accountNumber === normalizedAccount)
  const valid = !!customerName.trim() && !!referrerId && (referrerId !== 'new' || !!newName.trim()) && !invalidAccount && !duplicate
  const customers = useMemo(() => {
    const map = new Map<string, string>()
    for (const lead of [...workspace.leads, ...workspace.callbacks.map(callback => callback.lead), ...workspace.sales.map(sale => sale.lead)]) {
      if (!map.has(lead.accountNumber)) map.set(lead.accountNumber, lead.name)
    }
    return [...map.entries()]
  }, [workspace])
  return <Modal title={referral ? 'Edit referral.' : 'Add a referral.'} eyebrow="REFERRALS" onClose={onClose}>
    <form className="modal-body" onSubmit={event => { event.preventDefault(); if (valid) onSave({ referrerId, newReferrerName: newName, newReferrerContact: newContact, customerName, customerContact, accountNumber: normalizedAccount || null }) }}>
      <p className="modal-intro">Keep the introduction connected to the customer, from the first call through activation.</p>
      {workspace.isDemo && <div className="demo-import-note referral-demo-note">This is sample data. Clear the sample workspace before adding real referrals; the first import replaces everything here.</div>}
      <label className="form-label" htmlFor="referrer-select">WHO REFERRED THEM? <span>REQUIRED</span></label>
      <select className="form-input" id="referrer-select" data-autofocus={!locked || undefined} required disabled={locked} value={referrerId} onChange={event => setReferrerId(event.target.value)}>
        <option value="">Choose a person</option>{workspace.referrers.map(person => <option value={person.id} key={person.id}>{person.name}{person.contact ? ` · ${person.contact}` : ''}</option>)}<option value="new">+ Add a new person</option>
      </select>
      {referrerId === 'new' && <div className="referral-form-inset"><label className="form-label" htmlFor="new-referrer-name">REFERRER NAME <span>REQUIRED</span></label><input className="form-input" id="new-referrer-name" required maxLength={120} value={newName} onChange={event => setNewName(event.target.value)} placeholder="e.g. Nandi Molefe" /><label className="form-label form-spaced" htmlFor="new-referrer-contact">REFERRER CONTACT <span>OPTIONAL</span></label><input className="form-input" id="new-referrer-contact" maxLength={160} value={newContact} onChange={event => setNewContact(event.target.value)} placeholder="Phone, email or a note" /><div className="input-help">For identifying and contacting them. Do not enter banking details.</div></div>}
      <div className="referral-form-divider"><span>CUSTOMER DETAILS</span></div>
      <label className="form-label" htmlFor="referral-customer">CUSTOMER NAME <span>REQUIRED</span></label><input className="form-input" id="referral-customer" data-autofocus={locked || undefined} required maxLength={120} value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Name of the person referred" />
      <label className="form-label form-spaced" htmlFor="referral-contact">CUSTOMER CONTACT <span>OPTIONAL</span></label><input className="form-input" id="referral-contact" maxLength={160} value={customerContact} onChange={event => setCustomerContact(event.target.value)} placeholder="Phone, email or a note" />
      <label className="form-label form-spaced" htmlFor="referral-account">CUSTOMER 5- ACCOUNT <span>OPTIONAL FOR NOW</span></label><input className="form-input" id="referral-account" disabled={locked} list="referral-customers" value={account} maxLength={80} onChange={event => { const value = event.target.value; setAccount(value); const match = customers.find(([number]) => number === value.trim().toUpperCase()); if (match && !customerName.trim()) setCustomerName(match[1]) }} placeholder="e.g. 5-12345678901234" aria-invalid={invalidAccount || duplicate} aria-describedby="referral-account-help" /><datalist id="referral-customers">{customers.map(([number, name]) => <option value={number} key={number}>{name}</option>)}</datalist>
      <div className={`input-help ${invalidAccount || duplicate ? 'form-error' : ''}`} id="referral-account-help">{duplicate ? 'This account already has a referral. Edit that referral instead.' : invalidAccount ? 'Use 5- followed by digits, or leave this blank.' : 'Link an existing account, or add it later. An account can only have one referral.'}</div>
      {locked && <div className="type-later-note"><Info size={15} /><span>Referrer and account are locked while a payment is marked paid. Correct the paid mark first only if it was recorded in error.</span></div>}
      {!locked && !!referral?.payments.length && <div className="type-later-note"><Info size={15} /><span>Corrected payment history keeps the original customer and referrer details if you change them here.</span></div>}
      <div className="modal-footer"><button type="button" className="button button-outline" onClick={onClose}>CANCEL</button><button type="submit" className="button button-primary" disabled={!valid}>{referral ? 'SAVE CHANGES' : 'ADD REFERRAL'} <ArrowRight size={15} /></button></div>
    </form>
  </Modal>
}

export function ReferrerModal({ referrer, onClose, onSave }: { referrer: Referrer; onClose: () => void; onSave: (name: string, contact: string) => void }) {
  const [name, setName] = useState(referrer.name)
  const [contact, setContact] = useState(referrer.contact)
  return <Modal title="Edit referrer." eyebrow="REFERRALS" onClose={onClose}><form className="modal-body" onSubmit={event => { event.preventDefault(); if (name.trim()) onSave(name, contact) }}><p className="modal-intro">Update this person's details across their referrals. Previously recorded payments keep their original name.</p><label className="form-label" htmlFor="edit-referrer-name">NAME <span>REQUIRED</span></label><input className="form-input" id="edit-referrer-name" data-autofocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} /><label className="form-label form-spaced" htmlFor="edit-referrer-contact">CONTACT <span>OPTIONAL</span></label><input className="form-input" id="edit-referrer-contact" maxLength={160} value={contact} onChange={event => setContact(event.target.value)} /><div className="input-help">Do not enter banking details.</div><div className="modal-footer"><button type="button" className="button button-outline" onClick={onClose}>CANCEL</button><button type="submit" className="button button-primary" disabled={!name.trim()}>SAVE CHANGES <ArrowRight size={15} /></button></div></form></Modal>
}

export function PaymentHistoryModal({ referral, onClose, onCorrect }: { referral: Referral; onClose: () => void; onCorrect: (payment: ReferralPayment) => void }) {
  return <Modal title="Payment history." eyebrow="REFERRALS" onClose={onClose}><div className="modal-body"><p className="modal-intro"><strong>{referral.customerName}</strong> · Recorded manually in this workspace. The app does not send or reverse payments.</p><ol className="referral-payment-history">{[...referral.payments].reverse().map(payment => <li key={payment.id}><div className="payment-history-head"><div><span className="referral-cell-label">{payment.voidedAt ? 'CORRECTED / NOT COUNTED' : 'RECORDED AS PAID'}</span><strong>{formatRand(payment.amountCents)}</strong></div><span>{formatDate(payment.paidAt)}</span></div><p>To {payment.referrerName} · {payment.customerName} · {payment.accountNumber}<br />{payment.packageName} · {formatRand(payment.packagePriceCents)} · activated {formatDate(payment.activatedAt)}</p>{payment.voidedAt && <p>Paid mark corrected on {formatDate(payment.voidedAt)}.</p>}{!payment.voidedAt && <button className="text-action payment-correct" onClick={() => onCorrect(payment)}>CORRECT PAID MARK <ArrowRight size={14} /></button>}</li>)}</ol><div className="modal-footer"><button className="button button-primary" onClick={onClose}>DONE <ArrowRight size={15} /></button></div></div></Modal>
}
