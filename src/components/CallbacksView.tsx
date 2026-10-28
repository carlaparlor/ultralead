import { ArrowRight, CalendarClock, NotebookPen, Pencil, Trash2 } from 'lucide-react'
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
    <div className="page-heading view-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> WORKSPACE <span className="slash">/</span> CALLBACKS</div><h1>Callbacks<span className="heading-period">.</span></h1><p>Be there when you said you would.</p></div><div className="heading-aside"><span>YOUR FOLLOW-UPS</span><strong>{String(callbacks.length).padStart(2, '0')} scheduled</strong></div></div>
    <div className="view-summary"><div><span>DUE NOW</span><strong>{String(due).padStart(2, '0')}</strong></div><div><span>SCHEDULED</span><strong>{String(callbacks.length).padStart(2, '0')}</strong></div><p><span className="tiny-dot" /> Due callbacks go to the front of your smart queue.</p></div>
    <div className="list-toolbar"><div><div className="eyebrow section-kicker">01 <span>/</span> FOLLOW-UPS</div><h2>Keep the conversation going<span className="heading-period">.</span></h2></div><CalendarClock size={20} className="toolbar-icon" /></div>
    {!callbacks.length ? <div className="table-empty"><EmptyState title="No callbacks yet.">When a customer asks for another call, schedule it from the calling desk. It'll stay here even when you change your leads.</EmptyState></div> : <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>WHEN</th><th>CALLBACK NOTE</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{callbacks.map(item => {
      const lead = workspace.leads.find(candidate => candidate.accountNumber === item.lead.accountNumber) ?? item.lead
      const state = readiness(workspace, lead, now, queueIndex)
      const isDue = new Date(item.dueAt).getTime() <= now.getTime()
      const canCall = state === 'callback_due' || state === 'callback_scheduled' || state === 'daily_limit'
      const blocked = !canCall && state !== 'age_review'
      return <tr key={item.id}><td><div className="table-person"><Initials name={lead.name} /><span><strong>{lead.name}</strong><small>{lead.accountNumber}</small></span></div></td><td><div className="date-cell"><strong>{relativeDue(item.dueAt, now)}</strong><small>{formatDate(item.dueAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</small></div></td><td className="table-muted callback-table-note">{item.note || '—'}</td><td><StatusPill tone={state === 'age_review' || blocked ? 'warning' : isDue ? 'good' : 'muted'}>{state === 'age_review' ? 'Age review needed' : state === 'daily_limit' ? 'Daily retry limit' : blocked ? 'Not callable' : isDue ? 'Due now' : 'Scheduled'}</StatusPill></td><td><div className="row-actions">{state === 'age_review' ? <button className="text-action" onClick={() => onVerify(lead)}>VERIFY AGE <ArrowRight size={14} /></button> : canCall ? <button className="text-action" onClick={() => onCall(lead, state !== 'callback_due')}>CALL NOW <ArrowRight size={14} /></button> : null}<button className="icon-button" onClick={() => onOpenCustomer(lead.accountNumber)} aria-label={`Notes and history for ${lead.name}`} title="Notes & history"><NotebookPen size={15} /></button><button className="icon-button" onClick={() => onEdit(item)} aria-label={`Edit callback for ${lead.name}`}><Pencil size={15} /></button><button className="icon-button row-delete" onClick={() => onRemove(item)} aria-label={`Delete callback for ${lead.name}`}><Trash2 size={15} /></button></div></td></tr>
    })}</tbody></table></div>}
    <div className="under-table"><span>{callbacks.length} CALLBACK{callbacks.length === 1 ? '' : 'S'}</span><span>ALL TIMES ARE IN YOUR DEVICE'S LOCAL TIME.</span></div>
  </>
}
