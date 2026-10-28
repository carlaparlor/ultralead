import { ArrowRight, NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { formatDate, relativeDue } from '../domain/dates'
import { createQueueIndex, readiness } from '../domain/queue'
import type { Callback, Lead, Workspace } from '../domain/types'
import { EmptyState, Initials, StatusPill } from './ui'

export function CallbacksView({ workspace, now, onOpenCustomer, onCall, onEdit, onRemove, onVerify }: {
  workspace: Workspace; now: Date; onOpenCustomer: (account: string) => void; onCall: (lead: Lead, override: boolean) => void; onEdit: (callback: Callback) => void; onRemove: (callback: Callback) => void; onVerify: (lead: Lead) => void;
}) {
  const queueIndex = createQueueIndex(workspace)
  const callbacks = [...workspace.callbacks].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  const due = callbacks.filter(item => new Date(item.dueAt).getTime() <= now.getTime()).length
  return <>
    <div className="page-heading view-heading"><h1>Callbacks</h1></div>
    <div className="view-summary"><div><span>DUE NOW</span><strong>{String(due).padStart(2, '0')}</strong></div><div><span>SCHEDULED</span><strong>{String(callbacks.length).padStart(2, '0')}</strong></div></div>
        {!callbacks.length ? <div className="table-empty"><EmptyState title="No callbacks yet.">Schedule one from the calling desk with C.</EmptyState></div> : <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>WHEN</th><th>CALLBACK NOTE</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{callbacks.map(item => {
      const lead = workspace.leads.find(candidate => candidate.accountNumber === item.lead.accountNumber) ?? item.lead
      const state = readiness(workspace, lead, now, queueIndex)
      const isDue = new Date(item.dueAt).getTime() <= now.getTime()
      const canCall = state === 'callback_due' || state === 'callback_scheduled' || state === 'daily_limit'
      const blocked = !canCall && state !== 'age_review'
      return <tr key={item.id}><td><div className="table-person"><Initials name={lead.name} /><span><strong>{lead.name}</strong><small>{lead.accountNumber}</small></span></div></td><td><div className="date-cell"><strong>{relativeDue(item.dueAt, now)}</strong><small>{formatDate(item.dueAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</small></div></td><td className="table-muted callback-table-note">{item.note || '—'}</td><td><StatusPill tone={state === 'age_review' || blocked ? 'warning' : isDue ? 'good' : 'muted'}>{state === 'age_review' ? 'Age review needed' : state === 'daily_limit' ? 'Daily retry limit' : blocked ? 'Not callable' : isDue ? 'Due now' : 'Scheduled'}</StatusPill></td><td><div className="row-actions">{state === 'age_review' ? <button className="text-action" onClick={() => onVerify(lead)}>VERIFY AGE <ArrowRight size={14} /></button> : canCall ? <button className="text-action" onClick={() => onCall(lead, state !== 'callback_due')}>CALL NOW <ArrowRight size={14} /></button> : null}<button className="icon-button" onClick={() => onOpenCustomer(lead.accountNumber)} aria-label={`Notes and history for ${lead.name}`} title="Notes & history"><NotebookPen size={15} /></button><button className="icon-button" onClick={() => onEdit(item)} aria-label={`Edit callback for ${lead.name}`}><Pencil size={15} /></button><button className="icon-button row-delete" onClick={() => onRemove(item)} aria-label={`Delete callback for ${lead.name}`}><Trash2 size={15} /></button></div></td></tr>
    })}</tbody></table></div>}
    <div className="under-table"><span>{callbacks.length} CALLBACK{callbacks.length === 1 ? '' : 'S'}</span><span>LOCAL TIME</span></div>
  </>
}
