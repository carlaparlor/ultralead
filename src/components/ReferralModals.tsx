import { useMemo, useState } from 'react'
import { ArrowRight, Info } from 'lucide-react'
import { formatDate } from '../domain/dates'
import { formatRand } from '../domain/money'
import { activePayment, REFERRER_CONTACT_LIMIT, REFERRER_NAME_LIMIT, REFERRER_NOTES_LIMIT, referrerNameMatch } from '../domain/referrals'
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
  const [referrerId, setReferrerId] = useState(referral?.referrerId ?? (workspace.referrers.some(person => !person.archivedAt) ? '' : 'new'))
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
  // Archived people cannot take new referrals, but one already attached to this referral stays selectable.
  const selectableReferrers = useMemo(() => workspace.referrers.filter(person => !person.archivedAt || person.id === referral?.referrerId), [workspace.referrers, referral?.referrerId])
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
        <option value="">Choose a person</option>{selectableReferrers.map(person => <option value={person.id} key={person.id}>{person.name}{person.archivedAt ? ' · ARCHIVED' : ''}{person.contact ? ` · ${person.contact}` : ''}</option>)}<option value="new">+ Add a new person</option>
      </select>
      {referrerId === 'new' && <div className="referral-form-inset"><label className="form-label" htmlFor="new-referrer-name">REFERRER NAME <span>REQUIRED</span></label><input className="form-input" id="new-referrer-name" required maxLength={REFERRER_NAME_LIMIT} value={newName} onChange={event => setNewName(event.target.value)} placeholder="e.g. Nandi Molefe" /><label className="form-label form-spaced" htmlFor="new-referrer-contact">REFERRER CONTACT <span>OPTIONAL</span></label><input className="form-input" id="new-referrer-contact" maxLength={REFERRER_CONTACT_LIMIT} value={newContact} onChange={event => setNewContact(event.target.value)} placeholder="Phone, email or a note" /><div className="input-help">For identifying and contacting them. Do not enter banking details.</div></div>}
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

export interface ReferrerFormValues {
  name: string
  contact: string
  notes: string
}

export function ReferrerModal({ workspace, referrer, onClose, onSave }: {
  workspace: Workspace; referrer?: Referrer; onClose: () => void; onSave: (values: ReferrerFormValues) => void;
}) {
  const [name, setName] = useState(referrer?.name ?? '')
  const [contact, setContact] = useState(referrer?.contact ?? '')
  const [notes, setNotes] = useState(referrer?.notes ?? '')
  const duplicate = referrerNameMatch(workspace, name, referrer?.id)
  const archived = !!referrer?.archivedAt
  const valid = !!name.trim()
  return <Modal title={referrer ? 'Edit referrer.' : 'Add a referrer.'} eyebrow="REFERRALS" onClose={onClose}>
    <form className="modal-body" onSubmit={event => { event.preventDefault(); if (valid) onSave({ name, contact, notes }) }}>
      <p className="modal-intro">{referrer
        ? 'Update this person once and it applies everywhere they appear. Payments already recorded keep the name used at the time.'
        : 'Add someone who introduces customers, even before their first referral arrives.'}</p>
      {archived && <div className="type-later-note"><Info size={15} /><span><strong>Archived.</strong> New referrals cannot choose this person. Restore them from the referrer list to start a new introduction.</span></div>}
      <label className="form-label" htmlFor="referrer-name">NAME <span>REQUIRED</span></label>
      <input className="form-input" id="referrer-name" data-autofocus required maxLength={REFERRER_NAME_LIMIT} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Nandi Molefe" aria-invalid={!!duplicate} aria-describedby={duplicate ? 'referrer-name-help' : undefined} />
      {duplicate && <div className="input-help form-error" id="referrer-name-help">
        {duplicate.name === name.trim() ? `${duplicate.name} is already on your list.` : `This may be ${duplicate.name}, already on your list.`} Edit that person instead so their referrals and payments stay together.
      </div>}
      <label className="form-label form-spaced" htmlFor="referrer-contact">CONTACT <span>OPTIONAL</span></label>
      <input className="form-input" id="referrer-contact" maxLength={REFERRER_CONTACT_LIMIT} value={contact} onChange={event => setContact(event.target.value)} placeholder="Phone, email or how to reach them" />
      <div className="input-help">For identifying and contacting them. Do not enter banking details.</div>
      <label className="form-label form-spaced" htmlFor="referrer-notes">PRIVATE NOTE <span>OPTIONAL</span></label>
      <textarea className="form-input referrer-notes-input" id="referrer-notes" maxLength={REFERRER_NOTES_LIMIT} rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="How you know them, best time to call, or what they usually refer" />
      <div className="input-help">{REFERRER_NOTES_LIMIT - notes.length} characters left. Stored only in this workspace and its backups.</div>
      <div className="modal-footer"><button type="button" className="button button-outline" onClick={onClose}>CANCEL</button><button type="submit" className="button button-primary" disabled={!valid}>{referrer ? 'SAVE CHANGES' : 'ADD REFERRER'} <ArrowRight size={15} /></button></div>
    </form>
  </Modal>
}

export function PaymentHistoryModal({ referral, onClose, onCorrect }: { referral: Referral; onClose: () => void; onCorrect: (payment: ReferralPayment) => void }) {
  return <Modal title="Payment history." eyebrow="REFERRALS" onClose={onClose}><div className="modal-body"><p className="modal-intro"><strong>{referral.customerName}</strong> · Recorded manually in this workspace. The app does not send or reverse payments.</p><ol className="referral-payment-history">{[...referral.payments].reverse().map(payment => <li key={payment.id}><div className="payment-history-head"><div><span className="referral-cell-label">{payment.voidedAt ? 'CORRECTED / NOT COUNTED' : 'RECORDED AS PAID'}</span><strong>{formatRand(payment.amountCents)}</strong></div><span>{formatDate(payment.paidAt)}</span></div><p>To {payment.referrerName} · {payment.customerName} · {payment.accountNumber}<br />{payment.packageName} · {formatRand(payment.packagePriceCents)} · activated {formatDate(payment.activatedAt)}</p>{payment.voidedAt && <p>Paid mark corrected on {formatDate(payment.voidedAt)}.</p>}{!payment.voidedAt && <button className="text-action payment-correct" onClick={() => onCorrect(payment)}>CORRECT PAID MARK <ArrowRight size={14} /></button>}</li>)}</ol><div className="modal-footer"><button className="button button-primary" onClick={onClose}>DONE <ArrowRight size={15} /></button></div></div></Modal>
}
