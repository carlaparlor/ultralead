import { useState } from 'react'
import { CornerUpLeft, NotebookPen, Pencil, Search, Trash2 } from 'lucide-react'
import { formatDate, isSameLocalDay } from '../domain/dates'
import type { Sale, Workspace } from '../domain/types'
import { EmptyState, Initials, StatusPill } from './ui'

export function ActivationsView({ workspace, now, onEdit, onUndo, onRemove, onOpenCustomer }: { workspace: Workspace; now: Date; onEdit: (sale: Sale) => void; onUndo: (sale: Sale) => void; onRemove: (sale: Sale) => void; onOpenCustomer: (account: string) => void }) {
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState<'all' | 'today' | 'month'>('all')
  const allActivations = workspace.sales.filter(sale => sale.stage === 'activated').sort((a, b) => (b.activatedAt ?? '').localeCompare(a.activatedAt ?? ''))
  const activations = allActivations.filter(sale => {
    if (period === 'all') return true
    const date = new Date(sale.activatedAt!)
    if (period === 'today') return isSameLocalDay(date, now)
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  })
  const filtered = activations.filter(sale => `${sale.lead.name} ${sale.lead.accountNumber} ${sale.packageName} ${sale.activationType ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const att = activations.filter(sale => sale.activationType === 'ATT').length
  return <>
    <div className="page-heading view-heading"><h1>Activations</h1></div>
    <div className="view-summary activation-summary"><div><span>TOTAL</span><strong>{String(activations.length).padStart(2, '0')}</strong></div><div><span>ATT</span><strong>{String(att).padStart(2, '0')}</strong></div><div><span>NON-ATT</span><strong>{String(activations.length - att).padStart(2, '0')}</strong></div></div>
    <div className="list-toolbar"><div className="toolbar-controls"><label className="period-field"><span className="sr-only">Activation period</span><select aria-label="Activation period" value={period} onChange={event => setPeriod(event.target.value as 'all' | 'today' | 'month')}><option value="all">ALL TIME</option><option value="today">TODAY</option><option value="month">THIS MONTH</option></select></label><label className="search-field"><Search size={16} /><span className="sr-only">Search activations</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search activations" /></label></div></div>
    {!activations.length ? <div className="table-empty"><EmptyState title={allActivations.length ? 'Nothing in this period.' : 'No activations yet.'}>{allActivations.length ? 'Try another period.' : 'Complete an activation from the sales pipeline.'}</EmptyState></div> : !filtered.length ? <div className="table-empty"><EmptyState title="No matches.">Try another search.</EmptyState></div> : <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>PACKAGE</th><th>TYPE</th><th>ACTIVATED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(sale => <tr key={sale.id}><td><div className="table-person"><Initials name={sale.lead.name} /><span><strong>{sale.lead.name}</strong><small>{sale.lead.accountNumber}</small></span></div></td><td>{sale.packageName}</td><td>{sale.activationType ? <StatusPill tone="good">{sale.activationType.toUpperCase()}</StatusPill> : <StatusPill tone="warning">NEEDS TYPE</StatusPill>}</td><td className="table-muted">{sale.activatedAt ? formatDate(sale.activatedAt) : '—'}</td><td><div className="row-actions"><button className="icon-button" onClick={() => onOpenCustomer(sale.lead.accountNumber)} aria-label={`Notes and history for ${sale.lead.name}`} title="Notes & history"><NotebookPen size={15} /></button><button className="icon-button" onClick={() => onEdit(sale)} aria-label={`Edit activation for ${sale.lead.name}`}><Pencil size={15} /></button><button className="icon-button" onClick={() => onUndo(sale)} aria-label={`Move ${sale.lead.name} back to confirmation`} title="Move back to confirmation"><CornerUpLeft size={15} /></button><button className="icon-button row-delete" onClick={() => onRemove(sale)} aria-label={`Delete activation for ${sale.lead.name}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
    <div className="under-table"><span>SHOWING {filtered.length} OF {activations.length} ACTIVATIONS</span><span>TYPE IS RECORDED AT ACTIVATION · EDITABLE AFTERWARDS.</span></div>
  </>
}
