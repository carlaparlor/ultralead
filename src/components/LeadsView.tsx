import { useState } from 'react'
import { ArrowRight, Copy, NotebookPen, Search, Trash2, Upload } from 'lucide-react'
import { formatListDate } from '../domain/dates'
import { createQueueIndex, readiness, type Readiness } from '../domain/queue'
import type { Lead, Workspace } from '../domain/types'
import { EmptyState, Initials, StatusPill } from './ui'

const labels: Record<Readiness, string> = {
  ready: 'Ready to call', callback_due: 'Callback due', callback_scheduled: 'Callback scheduled', age_review: 'Age review needed',
  excluded: 'Excluded', not_interested: 'Not interested', in_pipeline: 'In pipeline', sale_recorded: 'Sale recorded', cooldown: 'Retry cooling down', daily_limit: 'Daily retry limit',
}

export function LeadsView({ workspace, now, onImport, onOpenCustomer, onCopy, onCall, onVerify, onReset, onRemove }: {
  workspace: Workspace; now: Date; onImport: () => void; onOpenCustomer: (account: string) => void; onCopy: (lead: Lead) => void; onCall: (lead: Lead, override: boolean) => void;
  onVerify: (lead: Lead) => void; onReset: (lead: Lead) => void; onRemove: (lead: Lead) => void;
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const queueIndex = createQueueIndex(workspace)
  const filtered = workspace.leads.filter(lead => `${lead.name} ${lead.accountNumber} ${lead.customerId}`.toLowerCase().includes(query.trim().toLowerCase()))
  const pageSize = 50
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const reviewCount = workspace.leads.filter(lead => readiness(workspace, lead, now, queueIndex) === 'age_review').length
  return <>
    <div className="page-heading view-heading"><h1>All leads</h1><button className="button button-primary" onClick={onImport}><Upload size={16} /> Import leads</button></div>
    <div className="view-summary"><div><span>IN TODAY'S LIST</span><strong>{String(workspace.leads.length).padStart(2, '0')}</strong></div><div><span>AGE REVIEW</span><strong>{String(reviewCount).padStart(2, '0')}</strong></div></div>
    {reviewCount > 0 && <div className="notice notice-warm"><strong>{reviewCount} need an age check.</strong> No readable birth date. Verify under 60 before calling.</div>}
    <div className="list-toolbar"><label className="search-field"><Search size={16} /><span className="sr-only">Search leads</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Search name or account" /></label></div>
    {workspace.leads.length === 0 ? <div className="table-empty"><EmptyState title="No leads in your list." action={<button className="button button-primary" onClick={onImport}>Import leads <ArrowRight size={15} /></button>}>Paste a list, or import from the top bar.</EmptyState></div> : filtered.length === 0 ? <div className="table-empty"><EmptyState title="No matching leads.">Try another name or account number.</EmptyState></div> : <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>ACCOUNT NUMBER</th><th>QUEUE STATUS</th><th>LIST DATE</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(lead => {
      const state = readiness(workspace, lead, now, queueIndex)
      const canCall = state === 'ready' || state === 'callback_due'
      const canOverride = state === 'cooldown' || state === 'daily_limit' || state === 'callback_scheduled'
      const canReset = state === 'not_interested' || (state === 'sale_recorded' && !queueIndex.sales.has(lead.accountNumber))
      return <tr key={lead.accountNumber}><td><div className="table-person"><Initials name={lead.name} /><span><strong>{lead.name}</strong><small>{lead.customerId || 'No customer ID'}</small></span></div></td><td><button className="account-inline" onClick={() => onCopy(lead)} title="Copy account number">{lead.accountNumber} <Copy size={13} /></button></td><td><StatusPill tone={canCall ? 'good' : state === 'age_review' ? 'warning' : 'muted'}>{labels[state]}</StatusPill></td><td className="table-muted">{formatListDate(lead.listDate)}</td><td><div className="row-actions">{canCall && <button className="text-action" onClick={() => onCall(lead, false)}>CALL <ArrowRight size={14} /></button>}{canOverride && <button className="text-action" onClick={() => onCall(lead, true)}>CALL ANYWAY <ArrowRight size={14} /></button>}{state === 'age_review' && <button className="text-action" onClick={() => onVerify(lead)}>VERIFY AGE <ArrowRight size={14} /></button>}{canReset && <button className="text-action" onClick={() => onReset(lead)}>RETURN TO QUEUE <ArrowRight size={14} /></button>}<button className="icon-button" onClick={() => onOpenCustomer(lead.accountNumber)} aria-label={`Notes and history for ${lead.name}`} title="Notes & history"><NotebookPen size={15} /></button><button className="icon-button row-delete" onClick={() => onRemove(lead)} aria-label={`Remove ${lead.name} from the lead list`}><Trash2 size={15} /></button></div></td></tr>
    })}</tbody></table></div>}
    <div className="under-table"><span>SHOWING {filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)}` : '0'} OF {filtered.length} LEADS</span>{pageCount > 1 ? <div className="pagination"><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous leads page">PREV</button><span>{currentPage + 1} / {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount - 1} aria-label="Next leads page">NEXT</button></div>  : null}</div>
  </>
}
