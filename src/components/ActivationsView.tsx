import { useMemo, useRef, useState } from 'react'
import { ChevronRight, CornerUpLeft, NotebookPen, Pencil, Search, Trash2 } from 'lucide-react'
import { formatDate, localDayKey } from '../domain/dates'
import { formatRand } from '../domain/money'
import { addMonths, startOfMonth } from '../domain/months'
import { groupActivationsByMonth } from '../domain/monthly'
import type { Sale, Workspace } from '../domain/types'
import { EmptyState, Initials, StatusPill } from './ui'

type Period = 'month' | 'last' | 'quarter' | 'year' | 'all'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'THIS MONTH' },
  { id: 'last', label: 'LAST MONTH' },
  { id: 'quarter', label: 'LAST 3 MONTHS' },
  { id: 'year', label: 'THIS YEAR' },
  { id: 'all', label: 'ALL TIME' },
]

const periodLabel = (period: Period, now: Date): string => {
  if (period === 'month') return new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(now)
  if (period === 'last') return new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(addMonths(now, -1))
  if (period === 'quarter') return 'the last three months'
  if (period === 'year') return String(now.getFullYear())
  return 'all time'
}

function withinPeriod(sale: Sale, period: Period, now: Date): boolean {
  if (!sale.activatedAt) return false
  const date = new Date(sale.activatedAt)
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) return false
  const month = startOfMonth(date)
  if (period === 'all') return true
  if (period === 'month') return month.getTime() === startOfMonth(now).getTime()
  if (period === 'last') return month.getTime() === addMonths(startOfMonth(now), -1).getTime()
  if (period === 'quarter') return month.getTime() >= addMonths(startOfMonth(now), -2).getTime()
  return date.getFullYear() === now.getFullYear()
}

export interface ActivationListProps {
  workspace: Workspace; now: Date; onEdit: (sale: Sale) => void; onUndo: (sale: Sale) => void; onRemove: (sale: Sale) => void; onOpenCustomer: (account: string) => void;
}

/** Every activation, grouped by month, opened from the monthly summary. */
export function ActivationLog({ initialKey, ...props }: ActivationListProps & { initialKey: string | null }) {
  return <ActivationsView {...props} fixedPeriod="all" initialMonthKey={initialKey} />
}

export function ActivationsView({ workspace, now, onEdit, onUndo, onRemove, onOpenCustomer, fixedPeriod, initialMonthKey }: ActivationListProps & { fixedPeriod?: Period; initialMonthKey?: string | null }) {
  const [query, setQuery] = useState('')
  const [chosenPeriod, setPeriod] = useState<Period>('month')
  const period = fixedPeriod ?? chosenPeriod
  // Only the newest month starts open; older months are one click away rather than a long scroll.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  // Pasting a customer's name or account opens the month that record is in, so search always finds it.
  const [pinned, setPinned] = useState<string | null>(initialMonthKey ?? null)
  const [chosenMonth, setActiveMonth] = useState<string | null>(initialMonthKey ?? null)
  // In the dialog the month picker is the only filter, so it narrows the whole list.
  const activeMonth = fixedPeriod ? chosenMonth : null
  const groups = useMemo(() => groupActivationsByMonth(workspace, now), [workspace, now])
  // The workspace clock only ticks every 30 seconds, so a click from a render made moments
  // before an activation must still see the current time rather than drop that activation.
  const nowRef = useRef(now)
  nowRef.current = now > nowRef.current ? now : nowRef.current
  const currentTime = () => (new Date() > nowRef.current ? new Date() : nowRef.current)

  const reference = currentTime()
  const inPeriod = workspace.sales
    .filter(sale => sale.stage === 'activated' && withinPeriod(sale, period, reference))
    .sort((a, b) => (b.activatedAt ?? '').localeCompare(a.activatedAt ?? ''))
  const normalized = query.trim().toLowerCase()
  const scoped = activeMonth ? inPeriod.filter(sale => localDayKey(new Date(sale.activatedAt!)).slice(0, 7) === activeMonth) : inPeriod
  const filtered = normalized
    ? scoped.filter(sale => `${sale.lead.name} ${sale.lead.accountNumber} ${sale.packageName} ${sale.activationType ?? ''}`.toLowerCase().includes(normalized))
    : scoped

  const byMonth = new Map<string, Sale[]>()
  for (const sale of filtered) {
    const key = localDayKey(new Date(sale.activatedAt!)).slice(0, 7)
    byMonth.set(key, [...(byMonth.get(key) ?? []), sale])
  }
  const periodGroups = groups.filter(group => byMonth.has(group.key))
  const isClosed = (key: string, index: number) => toggled[key] ?? (index !== 0 && key !== pinned)

  const att = scoped.filter(sale => sale.activationType === 'ATT').length
  const unpriced = scoped.filter(sale => sale.packagePriceCents === null).length
  const value = scoped.reduce((total, sale) => total + (sale.packagePriceCents ?? 0), 0)
  const thisMonthCount = groups.find(group => group.isCurrent)?.count ?? 0
  const previousGroup = groups.find(group => !group.isCurrent && group.month.getTime() === addMonths(startOfMonth(reference), -1).getTime())
  const toggle = (key: string) => setToggled(previous => ({ ...previous, [key]: !(previous[key] ?? true) }))

  return <>
    <div className={`page-heading view-heading activation-heading ${fixedPeriod ? 'activation-heading-dialog' : ''}`}>
      <div><div className="eyebrow referral-eyebrow"><span className="eyebrow-line" /> MONTH BY MONTH</div><h1>Activations</h1><p>{periodLabel(period, now)}</p></div>
      {!fixedPeriod && <span className="heading-note">{thisMonthCount ? `${thisMonthCount} this month` : 'none this month yet'}{previousGroup ? ` · ${previousGroup.count} last month` : ''}</span>}
    </div>

    <div className="view-summary activation-summary">
      <div><span>ACTIVATED</span><strong>{String(scoped.length).padStart(2, '0')}</strong></div>
      <div><span>ATT</span><strong>{String(att).padStart(2, '0')}</strong></div>
      <div><span>NON-ATT</span><strong>{String(scoped.length - att).padStart(2, '0')}</strong></div>
      <div><span>VALUE</span><strong>{formatRand(value)}</strong>{unpriced > 0 && <small>{unpriced} without a price</small>}</div>
    </div>

    <div className="list-toolbar"><div className="toolbar-controls">
      <label className="period-field"><span className="sr-only">Activation period</span><select aria-label="Activation period" value={period} onChange={event => setPeriod(event.target.value as Period)}>{PERIODS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label className="search-field"><Search size={16} /><span className="sr-only">Search activations</span><input value={query} onChange={event => {
        const value = event.target.value
        setQuery(value)
        if (!value.trim()) { setPinned(null); return }
        const match = inPeriod.find(sale => sale.lead.name.toLowerCase().includes(value.trim().toLowerCase()) || sale.lead.accountNumber === value.trim().toUpperCase())
        setPinned(match ? localDayKey(new Date(match.activatedAt!)).slice(0, 7) : null)
      }} placeholder="Search activations" /></label>
    </div></div>

    {fixedPeriod && <div className="month-picker" aria-label="Jump to a month">{groups.slice(0, 12).map(group => <button key={group.key} className={group.key === activeMonth ? 'is-on' : ''} aria-pressed={group.key === activeMonth} aria-label={`${group.label}: ${group.count} activation${group.count === 1 ? '' : 's'}`} onClick={() => { setActiveMonth(group.key); setQuery('') }}>{group.label}<span>{group.count}</span></button>)}</div>}

    {!inPeriod.length
      ? <div className="table-empty"><EmptyState title={period === 'month' ? 'No activations this month yet.' : 'Nothing in this period.'}>{period === 'month' ? 'Complete an activation from the sales pipeline, or widen the period.' : 'Try another period.'}</EmptyState></div>
      : !filtered.length
        ? <div className="table-empty"><EmptyState title="No matches.">Try another search or period.</EmptyState></div>
        : <div className="activation-months">{periodGroups.map((group, index) => {
          const sales = byMonth.get(group.key) ?? []
          const closed = isClosed(group.key, index)
          const groupAtt = sales.filter(sale => sale.activationType === 'ATT').length
          return <section className={`activation-month ${group.isCurrent ? 'is-current' : ''}`} key={group.key} aria-label={`${group.label} activations`}>
            <div className="activation-month-head">
              <button className="activation-month-toggle" onClick={() => toggle(group.key)} aria-expanded={!closed}>
                <ChevronRight size={15} className={closed ? '' : 'is-open'} />
                <span className="activation-month-label">{group.label}</span>
                {group.isCurrent && <span className="month-now">NOW</span>}
                <span className="activation-month-count">{sales.length} activated</span>
              </button>
              <div className="activation-month-figures">
                <span><i className="dot-att" />{groupAtt} ATT</span>
                <span><i className="dot-nonatt" />{sales.length - groupAtt} non-ATT</span>
                <span>{formatRand(group.valueCents)}{group.withoutPrice > 0 ? ` + ${group.withoutPrice} unpriced` : ''}</span>
              </div>
            </div>
            {!closed && <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>PACKAGE</th><th>TYPE</th><th>ACTIVATED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{sales.map(sale => <tr key={sale.id}><td><div className="table-person"><Initials name={sale.lead.name} /><span><strong>{sale.lead.name}</strong><small>{sale.lead.accountNumber}</small></span></div></td><td><div className="activation-package"><span>{sale.packageName}</span><small>{sale.packagePriceCents === null ? 'PRICE NOT SET' : formatRand(sale.packagePriceCents)}</small></div></td><td>{sale.activationType ? <StatusPill tone="good">{sale.activationType.toUpperCase()}</StatusPill> : <StatusPill tone="warning">NEEDS TYPE</StatusPill>}</td><td className="table-muted">{sale.activatedAt ? formatDate(sale.activatedAt) : '—'}</td><td><div className="row-actions"><button className="icon-button" onClick={() => onOpenCustomer(sale.lead.accountNumber)} aria-label={`Notes and history for ${sale.lead.name}`} title="Notes & history"><NotebookPen size={15} /></button><button className="icon-button" onClick={() => onEdit(sale)} aria-label={`Edit activation for ${sale.lead.name}`}><Pencil size={15} /></button><button className="icon-button" onClick={() => onUndo(sale)} aria-label={`Move ${sale.lead.name} back to confirmation`} title="Move back to confirmation"><CornerUpLeft size={15} /></button><button className="icon-button row-delete" onClick={() => onRemove(sale)} aria-label={`Delete activation for ${sale.lead.name}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
          </section>
        })}</div>}
    <div className="under-table"><span>SHOWING {filtered.length} OF {scoped.length} ACTIVATIONS</span></div>
  </>
}
