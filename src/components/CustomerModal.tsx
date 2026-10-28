import { useState } from 'react'
import { ArrowRight, CalendarClock, Check, Copy } from 'lucide-react'
import { formatDate, formatListDate, relativeDue } from '../domain/dates'
import { readiness } from '../domain/queue'
import type { CallOutcome, Lead, SaleStage, Workspace } from '../domain/types'
import { Initials, Modal, StatusPill } from './ui'

const outcomeLabels: Record<CallOutcome, string> = {
  no_answer: 'No answer', not_interested: 'Not interested', callback: 'Callback scheduled', sale: 'Sale recorded',
}
const stageLabels: Record<SaleStage, string> = {
  credit_vetting: 'Credit vetting', pending_confirmation: 'Awaiting confirmation', activated: 'Activated', declined: 'Vetting declined',
}
const readinessLabels = {
  ready: 'Ready to call', callback_due: 'Callback due', callback_scheduled: 'Callback scheduled', age_review: 'Age review needed',
  excluded: 'Excluded', not_interested: 'Not interested', in_pipeline: 'In pipeline', sale_recorded: 'Sale recorded',
  cooldown: 'Retry cooling down', daily_limit: 'Daily retry limit',
} as const

/**
 * One customer, everything about them. Notes and call history stay reachable at every
 * stage — including after a sale leaves the calling queue.
 */
export function CustomerModal({ workspace, lead, account, now, onCopy, onNotes, onClose }: {
  workspace: Workspace; lead: Lead; account: string; now: Date;
  onCopy: (account: string) => void; onNotes: (notes: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(workspace.profiles[account]?.notes ?? '')
  const profile = workspace.profiles[account]
  const sale = workspace.sales.filter(item => item.lead.accountNumber === account).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const callback = workspace.callbacks.find(item => item.lead.accountNumber === account)
  const state = readiness(workspace, lead, now)
  const attempts = [...(profile?.attempts ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  const inDailyList = workspace.leads.some(item => item.accountNumber === account)

  return <Modal title="Customer record." eyebrow="CUSTOMER / NOTES & HISTORY" onClose={onClose}>
    <div className="modal-body">
      <div className="customer-head">
        <Initials name={lead.name} />
        <div className="customer-head-text">
          <strong>{lead.name}</strong>
          <small>{lead.accountNumber} · {lead.sourceStatus.toUpperCase()}{inDailyList ? '' : ' · NOT IN TODAY’S LIST'}</small>
        </div>
        <button className="button button-outline button-small" onClick={() => onCopy(lead.accountNumber)}><Copy size={14} /> COPY</button>
      </div>
      <div className="customer-status">
        <StatusPill tone={sale && sale.stage === 'activated' ? 'good' : state === 'age_review' ? 'warning' : 'neutral'}>{readinessLabels[state]}</StatusPill>
        {sale && <StatusPill tone={sale.stage === 'activated' ? 'good' : sale.stage === 'declined' ? 'warning' : 'muted'}>{stageLabels[sale.stage]}{sale.stage === 'activated' && sale.activationType ? ` · ${sale.activationType.toUpperCase()}` : ''}</StatusPill>}
        {profile?.doNotCall && <StatusPill tone="muted">Do not call</StatusPill>}
      </div>

      <div className="customer-facts">
        <div><span className="field-caption">CUSTOMER ID</span><strong>{lead.customerId || 'NOT PROVIDED'}</strong></div>
        <div><span className="field-caption">LIST DATE</span><strong>{formatListDate(lead.listDate)}</strong></div>
        <div><span className="field-caption">ATTEMPTS</span><strong>{String(attempts.length).padStart(2, '0')}</strong></div>
      </div>

      {sale && <div className="customer-sale"><div><span className="field-caption">SALE</span><strong>{sale.packageName}</strong></div><div><span className="field-caption">UPDATED</span><strong>{formatDate(sale.updatedAt, { day: 'numeric', month: 'short' })}</strong></div>{sale.activatedAt && <div><span className="field-caption">ACTIVATED</span><strong>{formatDate(sale.activatedAt, { day: 'numeric', month: 'short' })}</strong></div>}</div>}

      {callback && <div className="customer-callback"><CalendarClock size={15} /><span><strong>{relativeDue(callback.dueAt, now)}</strong> {callback.note}</span></div>}

      <label className="form-label form-spaced" htmlFor="customer-notes">CUSTOMER NOTES <span>AUTO-SAVED</span></label>
      <textarea
        id="customer-notes"
        className="form-textarea"
        data-autofocus
        rows={4}
        maxLength={2000}
        value={draft}
        onChange={event => { setDraft(event.target.value); onNotes(event.target.value) }}
        placeholder="Add anything you want to remember about this customer..."
      />
      <div className="input-help"><Check size={12} /> Notes follow the account number, so they survive list imports and every sale stage.</div>

      <div className="form-label form-spaced">CALL HISTORY <span>{attempts.length ? `${attempts.length} RECORDED` : 'NONE YET'}</span></div>
      {attempts.length ? <ol className="history-list">{attempts.map(attempt => <li key={attempt.id}><span className={`history-outcome history-${attempt.outcome}`}>{outcomeLabels[attempt.outcome]}</span><time>{formatDate(attempt.at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</time></li>)}</ol> : <div className="history-empty">No calls logged for this customer yet.</div>}

      <div className="modal-footer"><button className="button button-primary" onClick={onClose}>DONE <ArrowRight size={15} /></button></div>
    </div>
  </Modal>
}
