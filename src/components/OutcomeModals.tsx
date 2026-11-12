import { useState } from 'react'
import { ArrowRight, Info } from 'lucide-react'
import { toDateTimeLocal } from '../domain/dates'
import { formatRand, parsePriceCents, priceInputValue, referralRewardCents } from '../domain/money'
import { activePayment } from '../domain/referrals'
import type { ActivationType, Callback, Lead, Sale, Workspace } from '../domain/types'
import { Modal } from './ui'

export function CallbackModal({ lead, existing, now, onClose, onSave }: { lead: Lead; existing?: Callback; now: Date; onClose: () => void; onSave: (dueAt: string, note: string) => void }) {
  const [date, setDate] = useState(() => toDateTimeLocal(existing ? new Date(existing.dueAt) : new Date(now.getTime() + 60 * 60 * 1000)))
  const [note, setNote] = useState(existing?.note ?? '')
  const valid = date && !Number.isNaN(new Date(date).getTime())
  return <Modal title={existing ? 'Update callback.' : 'Schedule a callback.'} eyebrow="CALLBACK" onClose={onClose}><form className="modal-body" onSubmit={event => { event.preventDefault(); if (valid) onSave(new Date(date).toISOString(), note) }}><p className="modal-intro"><strong>{lead.name}</strong></p><label className="form-label" htmlFor="callback-date">DATE & TIME <span>YOUR LOCAL TIME</span></label><input data-autofocus className="form-input" id="callback-date" type="datetime-local" required value={date} onChange={event => setDate(event.target.value)} /><label className="form-label form-spaced" htmlFor="callback-note">CALLBACK NOTE <span>OPTIONAL</span></label><textarea className="form-textarea" id="callback-note" rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="What should you remember for this call?" /><div className="input-help">Due callbacks go to the front of the queue.</div><div className="modal-footer"><button type="button" className="button button-outline" onClick={onClose}>CANCEL</button><button type="submit" className="button button-primary" disabled={!valid}>SAVE CALLBACK <ArrowRight size={15} /></button></div></form></Modal>
}

export function SaleModal({ lead, sale, workspace, onClose, onSave }: { lead: Lead; sale?: Sale; workspace: Workspace; onClose: () => void; onSave: (packageName: string, type: ActivationType | null, priceCents: number | null) => void }) {
  const [packageName, setPackageName] = useState(sale?.packageName ?? '')
  const [price, setPrice] = useState(priceInputValue(sale?.packagePriceCents ?? null))
  // Only an already-activated sale has a type to correct; everything else waits for activation.
  const [type, setType] = useState<ActivationType | ''>(sale?.activationType ?? '')
  const canEditType = sale?.stage === 'activated'
  const parsedPrice = parsePriceCents(price)
  const invalidPrice = !!price.trim() && parsedPrice === null
  const valid = !!packageName.trim() && (!canEditType || !!type) && !invalidPrice
  const referral = workspace.referrals.find(item => item.accountNumber === lead.accountNumber)
  const referrer = workspace.referrers.find(item => item.id === referral?.referrerId)
  const paid = referral && activePayment(referral)
  const reward = parsedPrice === null ? null : referralRewardCents(parsedPrice)
  return <Modal title={sale ? 'Edit sale.' : 'Record a sale.'} eyebrow="SALE" onClose={onClose}>
    <form className="modal-body" onSubmit={event => { event.preventDefault(); if (valid) onSave(packageName.trim(), canEditType && type ? type : null, parsedPrice) }}>
      <p className="modal-intro"><strong>{lead.name}</strong>{!sale && ' — goes to credit vetting next.'}</p>
      <label className="form-label" htmlFor="sale-package">PACKAGE / DEAL <span>TYPE OR CHOOSE</span></label>
      <input data-autofocus className="form-input" id="sale-package" value={packageName} onChange={event => setPackageName(event.target.value)} list="package-options" placeholder="e.g. Everyday 20GB" required maxLength={120} />
      <datalist id="package-options">{workspace.packages.map(name => <option key={name} value={name} />)}</datalist><div className="input-help">Any package can be typed.</div>
      <label className="form-label form-spaced" htmlFor="sale-price">DEAL PRICE (ZAR) <span>OPTIONAL</span></label>
      <input className="form-input" id="sale-price" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="e.g. 199.00" aria-invalid={invalidPrice} aria-describedby="sale-price-help" />
      <div className={`input-help ${invalidPrice ? 'form-error' : ''}`} id="sale-price-help">{invalidPrice ? 'Enter a non-negative price with up to two decimal places.' : 'Enter the actual price in rand. A price is needed to calculate a referral reward.'}</div>
      {referral && <div className="type-later-note referral-sale-note"><Info size={15} /><span><strong>Referred by {referrer?.name}.</strong> {paid ? 'A payment was already recorded. Changing the package or price will flag it for review; the paid amount stays the same.' : reward !== null ? `The reward will be ${formatRand(reward)} only after activation.` : 'Add a price to calculate the reward. Nothing is due before activation.'}</span></div>}
      {canEditType ? <fieldset className="activation-choice"><legend className="form-label">ACTIVATION TYPE <span>RECORDED AT ACTIVATION</span></legend><label className={`radio-card ${type === 'ATT' ? 'selected' : ''}`}><input type="radio" name="activation-type" checked={type === 'ATT'} onChange={() => setType('ATT')} /><span><strong>ATT</strong><small>ATT activation</small></span></label><label className={`radio-card ${type === 'Non-ATT' ? 'selected' : ''}`}><input type="radio" name="activation-type" checked={type === 'Non-ATT'} onChange={() => setType('Non-ATT')} /><span><strong>NON-ATT</strong><small>Non-ATT activation</small></span></label></fieldset>
        : <div className="type-later-note"><Info size={15} /><span><strong>ATT or non-ATT?</strong> That is only known once the sale activates, so you'll choose it when you complete the activation. Vetting and confirmation don't need it.</span></div>}
      <div className="modal-footer"><button type="button" className="button button-outline" onClick={onClose}>CANCEL</button><button type="submit" className="button button-primary" disabled={!valid}>{sale ? 'SAVE CHANGES' : 'START CREDIT VETTING'} <ArrowRight size={15} /></button></div>
    </form>
  </Modal>
}

/** The ATT/non-ATT split is decided here, at the end of the process, never before. */
export function ActivationModal({ sale, workspace, onClose, onSave }: { sale: Sale; workspace: Workspace; onClose: () => void; onSave: (type: ActivationType, priceCents?: number | null) => void }) {
  const [type, setType] = useState<ActivationType | ''>(sale.activationType ?? '')
  const [price, setPrice] = useState(priceInputValue(sale.packagePriceCents))
  const referral = workspace.referrals.find(item => item.accountNumber === sale.lead.accountNumber)
  const referrer = workspace.referrers.find(item => item.id === referral?.referrerId)
  const paid = referral && activePayment(referral)
  const parsedPrice = parsePriceCents(price)
  const invalidPrice = !!price.trim() && parsedPrice === null
  const reward = parsedPrice === null ? null : referralRewardCents(parsedPrice)
  return <Modal title="Complete activation." eyebrow="ACTIVATION" onClose={onClose}><form className="modal-body" onSubmit={event => { event.preventDefault(); if (type && !invalidPrice) onSave(type, referral ? parsedPrice : undefined) }}><p className="modal-intro"><strong>{sale.lead.name}</strong> · {sale.packageName}</p>
    <fieldset className="activation-choice"><legend className="form-label">ACTIVATION TYPE <span>REQUIRED TO COMPLETE</span></legend><label className={`radio-card ${type === 'ATT' ? 'selected' : ''}`}><input data-autofocus type="radio" name="activation-type" checked={type === 'ATT'} onChange={() => setType('ATT')} /><span><strong>ATT</strong><small>ATT activation</small></span></label><label className={`radio-card ${type === 'Non-ATT' ? 'selected' : ''}`}><input type="radio" name="activation-type" checked={type === 'Non-ATT'} onChange={() => setType('Non-ATT')} /><span><strong>NON-ATT</strong><small>Non-ATT activation</small></span></label></fieldset>
    <div className="input-help">Chosen here only. Editable later from Activations.</div>
    {referral && <><label className="form-label form-spaced" htmlFor="activation-price">DEAL PRICE (ZAR) <span>OPTIONAL</span></label><input className="form-input" id="activation-price" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="e.g. 199.00" aria-invalid={invalidPrice} aria-describedby="activation-price-help" /><div className={`input-help ${invalidPrice ? 'form-error' : ''}`} id="activation-price-help">{invalidPrice ? 'Enter a non-negative price with up to two decimal places.' : 'You can activate without a price, but the referral cannot be paid until one is added.'}</div><div className="type-later-note referral-sale-note"><Info size={15} /><span><strong>Referred by {referrer?.name}.</strong> {paid ? 'A payment is already recorded for this referral; activation will not create a second one.' : reward !== null ? `${formatRand(reward)} will be ready to pay after activation is completed.` : 'Add the actual deal price to calculate the reward.'}</span></div></>}
    <div className="modal-footer"><button type="button" className="button button-outline" onClick={onClose}>CANCEL</button><button type="submit" className="button button-primary" disabled={!type || invalidPrice}>COMPLETE ACTIVATION <ArrowRight size={15} /></button></div></form></Modal>
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return <Modal title="How the queue works." eyebrow="QUEUE" onClose={onClose}><div className="modal-body help-body"><ol><li><strong>Callbacks first.</strong><span>Due follow-ups go to the front.</span></li><li><strong>Shuffled order.</strong><span>A workspace seed reorders leads daily. Fresh leads come before retries.</span></li><li><strong>Retry spacing.</strong><span>No answer waits two hours; three in a day ends calling until tomorrow. A no-answer callback moves two hours later.</span></li><li><strong>No means no.</strong><span>Not-interested customers stay out of the queue across imports until you return them.</span></li><li><strong>Exclusions.</strong><span>Active, archived and known 60+ customers are removed. Unreadable birth dates are held until verified. Check the source when in doubt.</span></li></ol><div className="shortcut-list"><div className="form-label">CALLING DESK KEYS</div><dl><div><dt><kbd>N</kbd></dt><dd>No answer</dd></div><div><dt><kbd>X</kbd></dt><dd>Not interested</dd></div><div><dt><kbd>C</kbd></dt><dd>Callback</dd></div><div><dt><kbd>S</kbd></dt><dd>Made a sale</dd></div><div><dt><kbd>V</kbd></dt><dd>Copy account</dd></div><div><dt><kbd>←</kbd><kbd>→</kbd></dt><dd>Cycle the queue</dd></div></dl></div>
    <div className="help-warning">Local to this browser. It cannot see or coordinate with colleagues' calls, so duplicate calls remain possible.</div><div className="modal-footer"><button className="button button-primary" onClick={onClose}>GOT IT <ArrowRight size={15} /></button></div></div></Modal>
}
