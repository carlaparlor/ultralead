import { useMemo, useState } from 'react'
import { Archive, ArrowRight, ArchiveRestore, Check, Gift, Link2, NotebookPen, Pencil, Plus, Search, Trash2, UsersRound, Wallet, X } from 'lucide-react'
import { formatDate } from '../domain/dates'
import { formatRand } from '../domain/money'
import { createReferralIndex, paymentReviewComparison, referralAttentionStatuses, referralState, summariseReferrers, type ReferralState, type ReferralStatus, type ReferrerTotals } from '../domain/referrals'
import type { Lead, Referral, Referrer, Sale, Workspace } from '../domain/types'
import { EmptyState, Initials, StatusPill } from './ui'

const labels: Record<ReferralStatus, string> = {
  needs_link: 'Needs account', not_in_list: 'Not in lead list', age_review: 'Age review needed', excluded: 'Excluded',
  not_interested: 'Not interested', sale_missing: 'Sale record removed', awaiting_sale: 'Awaiting sale', credit_vetting: 'Credit vetting',
  pending_confirmation: 'Awaiting confirmation', declined: 'Vetting declined', needs_price: 'Needs price',
  ready: 'Ready to pay', paid: 'Paid', paid_review: 'Paid · review',
}
const attentionStatuses = referralAttentionStatuses
const priority: Record<ReferralStatus, number> = {
  ready: 0, needs_price: 1, paid_review: 2, needs_link: 3, not_in_list: 4, age_review: 5, excluded: 6, sale_missing: 6,
  credit_vetting: 7, pending_confirmation: 7, awaiting_sale: 7, not_interested: 8, declined: 8, paid: 9,
}
type Filter = 'all' | 'progress' | 'ready' | 'attention' | 'paid' | 'declined'

function statusTone(status: ReferralStatus): 'good' | 'muted' | 'warning' | 'neutral' {
  if (status === 'ready' || status === 'paid') return 'good'
  if (attentionStatuses.includes(status)) return 'warning'
  if (status === 'declined' || status === 'not_interested') return 'muted'
  return 'neutral'
}

function matchesFilter(state: ReferralState, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'ready') return state.status === 'ready'
  if (filter === 'attention') return attentionStatuses.includes(state.status)
  if (filter === 'paid') return state.status === 'paid' || state.status === 'paid_review'
  if (filter === 'declined') return state.status === 'declined'
  return !['ready', 'paid', 'paid_review', 'declined'].includes(state.status)
}

const EMPTY_TOTALS: ReferrerTotals = { referralCount: 0, activeCount: 0, readyCount: 0, attentionCount: 0, dueCents: 0, paidCents: 0, lastReferralAt: null, lastPaymentAt: null }
type ReferrerFilter = 'active' | 'balance' | 'archived' | 'all'

/** Anyone with money waiting first, then the busiest, then a stable alphabetical order. */
function referrersFor(workspace: Workspace, totals: Map<string, ReferrerTotals>, query: string, filter: ReferrerFilter): Referrer[] {
  const normalized = query.trim().toLowerCase()
  return workspace.referrers
    .filter(referrer => {
      const total = totals.get(referrer.id) ?? EMPTY_TOTALS
      if (filter === 'active' && referrer.archivedAt) return false
      if (filter === 'archived' && !referrer.archivedAt) return false
      if (filter === 'balance' && (!!referrer.archivedAt || (!total.dueCents && !total.readyCount))) return false
      return !normalized || [referrer.name, referrer.contact, referrer.notes].some(value => value.toLowerCase().includes(normalized))
    })
    .sort((a, b) => {
      const totalA = totals.get(a.id) ?? EMPTY_TOTALS
      const totalB = totals.get(b.id) ?? EMPTY_TOTALS
      return totalB.readyCount - totalA.readyCount || totalB.dueCents - totalA.dueCents || totalB.referralCount - totalA.referralCount
        || a.name.localeCompare(b.name)
    })
}

function referrerSummary(totals: ReferrerTotals): string {
  if (!totals.referralCount) return 'No referrals yet'
  const parts = [`${totals.activeCount} in progress`]
  if (totals.readyCount) parts.push(`${totals.readyCount} ready to pay`)
  if (totals.attentionCount) parts.push(`${totals.attentionCount} need attention`)
  return parts.join(' · ')
}

function referrerEmptyMessage(filter: ReferrerFilter, query: string): string {
  if (query.trim()) return 'No referrers match that search. Try a name, contact or note.'
  if (filter === 'archived') return 'Nobody is archived. Archiving stops new referrals without removing anyone.'
  if (filter === 'balance') return 'Nobody is owed money right now. Rewards appear here once a referral activates.'
  return 'Your referrers and their totals will appear here.'
}

function ReferralRow({ state, onEdit, onRemove, onAddToLeads, onVerify, onCall, onEditSale, onPay, onHistory, onOpenCustomer }: {
  state: ReferralState; onEdit: (referral: Referral) => void; onRemove: (referral: Referral) => void;
  onAddToLeads: (referral: Referral) => void; onVerify: (lead: Lead) => void; onCall: (lead: Lead, override: boolean) => void; onEditSale: (sale: Sale) => void;
  onPay: (state: ReferralState) => void; onHistory: (referral: Referral) => void; onOpenCustomer: (account: string) => void;
}) {
  const { referral, referrer, sale, lead, leadReadiness, payment, status } = state
  const account = referral.accountNumber
  const canCall = leadReadiness === 'ready' || leadReadiness === 'callback_due'
  const canOverride = leadReadiness === 'callback_scheduled' || leadReadiness === 'cooldown' || leadReadiness === 'daily_limit'
  const comparison = paymentReviewComparison(state)
  const explanation = sale
    ? `${sale.packageName}${sale.packagePriceCents === null ? ' · price not set' : ` · ${formatRand(sale.packagePriceCents)}`}`
    : payment ? 'The original sale is no longer available. Review the payment history.'
      : !account ? 'Add an account to connect this customer to the pipeline.'
        : status === 'not_in_list' ? 'Import this customer or add them to your lead list.'
          : status === 'sale_missing' ? 'The sale was removed. Use All leads to return the customer to the queue if appropriate.'
            : status === 'age_review' ? 'Verify the customer is under 60 before calling.'
              : status === 'excluded' ? 'This customer is excluded from calling. Check the source system.'
                : status === 'not_interested' ? 'This customer is marked not interested and is out of the queue.'
                  : 'Waiting for a sale to be recorded.'
  return <article className={`referral-row ${status === 'ready' ? 'referral-row-ready' : ''}`} aria-label={`Referral for ${referral.customerName}`}>
    <div className="referral-row-grid">
      <div className="referral-customer"><Initials name={referral.customerName} /><div><h3>{referral.customerName}</h3><small>{account ?? 'ACCOUNT NOT LINKED'}</small>{referral.customerContact && <small>{referral.customerContact}</small>}</div></div>
      <div className="referral-cell"><span className="referral-cell-label">REFERRED BY</span><strong>{referrer.name}</strong><small>{referrer.contact || 'No contact added'}</small></div>
      <div className="referral-cell referral-stage"><span className="referral-cell-label">PROGRESS</span><StatusPill tone={statusTone(status)}>{labels[status]}</StatusPill></div>
      <div className="referral-cell referral-amount"><span className="referral-cell-label">REWARD</span><strong>{payment ? formatRand(payment.amountCents) : state.dueCents ? formatRand(state.dueCents) : '—'}</strong><small>{payment ? `Paid ${formatDate(payment.paidAt, { day: 'numeric', month: 'short', year: 'numeric' })}` : state.dueCents ? 'Due after activation' : 'Not due yet'}</small></div>
    </div>
    {status === 'paid_review' && <div className="referral-review"><strong>Payment needs review.</strong> The activation or its package changed after payment was recorded. The paid amount is preserved.
      {comparison ? <p>Recalculated reward: <strong>{formatRand(comparison.currentRewardCents)}</strong> · Recorded as paid: <strong>{formatRand(comparison.paidCents)}</strong>. {comparison.differenceCents > 0 ? `Possible shortfall: ${formatRand(comparison.differenceCents)}.` : comparison.differenceCents < 0 ? `Possible overpayment: ${formatRand(-comparison.differenceCents)}.` : 'The reward amount is unchanged.'}</p> : <p>The recorded activation is missing, has changed, or has no valid price, so a reward cannot be compared.</p>}
      <p>Review payment history before taking action. Any difference is excluded from ready-to-pay totals; additional payments or refunds cannot be recorded here. Only correct a paid mark if it was entered in error.</p>
    </div>}
    <div className="referral-row-bottom">
      <p>{explanation}</p>
      <div className="referral-row-actions">
        {status === 'needs_link' && <button className="text-action" onClick={() => onEdit(referral)}><Link2 size={13} /> LINK ACCOUNT</button>}
        {status === 'not_in_list' && <button className="text-action" onClick={() => onAddToLeads(referral)}><Plus size={13} /> ADD TO LEADS</button>}
        {status === 'age_review' && lead && <button className="text-action" onClick={() => onVerify(lead)}>VERIFY AGE <ArrowRight size={13} /></button>}
        {status === 'awaiting_sale' && lead && (canCall || canOverride) && <button className="text-action" onClick={() => onCall(lead, !!canOverride)}>{canOverride ? 'CALL ANYWAY' : 'CALL'} <ArrowRight size={13} /></button>}
        {status === 'needs_price' && sale && <button className="text-action" onClick={() => onEditSale(sale)}>ADD PRICE <ArrowRight size={13} /></button>}
        {status === 'ready' && <button className="button button-primary button-small" onClick={() => onPay(state)}><Check size={14} /> MARK PAID</button>}
        {referral.payments.length > 0 && <button className="text-action" onClick={() => onHistory(referral)}>PAYMENT HISTORY</button>}
        {lead && account && <button className="icon-button" onClick={() => onOpenCustomer(account)} aria-label={`Notes and history for ${referral.customerName}`} title="Customer notes & history"><NotebookPen size={15} /></button>}
        <button className="icon-button" onClick={() => onEdit(referral)} aria-label={`Edit referral for ${referral.customerName}`} title="Edit referral"><Pencil size={15} /></button>
        {!referral.payments.length && <button className="icon-button row-delete" onClick={() => onRemove(referral)} aria-label={`Delete referral for ${referral.customerName}`} title="Delete referral"><Trash2 size={15} /></button>}
      </div>
    </div>
  </article>
}

export function ReferralsView({ workspace, now, onAdd, onEdit, onRemove, onAddToLeads, onVerify, onCall, onEditSale, onPay, onHistory, onAddReferrer, onEditReferrer, onArchiveReferrer, onRemoveReferrer, onOpenCustomer }: {
  workspace: Workspace; now: Date; onAdd: () => void; onEdit: (referral: Referral) => void; onRemove: (referral: Referral) => void;
  onAddToLeads: (referral: Referral) => void; onVerify: (lead: Lead) => void; onCall: (lead: Lead, override: boolean) => void; onEditSale: (sale: Sale) => void;
  onPay: (state: ReferralState) => void; onHistory: (referral: Referral) => void;
  onAddReferrer: () => void; onEditReferrer: (referrer: Referrer) => void; onArchiveReferrer: (referrer: Referrer, archived: boolean) => void;
  onRemoveReferrer: (referrer: Referrer) => void; onOpenCustomer: (account: string) => void;
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [referrerQuery, setReferrerQuery] = useState('')
  const [referrerFilter, setReferrerFilter] = useState<ReferrerFilter>('active')
  const [referrerId, setReferrerId] = useState<string | null>(null)
  const states = useMemo(() => {
    const index = createReferralIndex(workspace)
    return workspace.referrals.map(referral => referralState(workspace, referral, now, index))
  }, [workspace, now])
  const ready = states.filter(state => state.status === 'ready')
  const paid = states.filter(state => state.payment)
  const attention = states.filter(state => attentionStatuses.includes(state.status))
  const inProgress = states.filter(state => matchesFilter(state, 'progress'))
  const dueCents = ready.reduce((sum, state) => sum + state.dueCents, 0)
  const paidCents = paid.reduce((sum, state) => sum + (state.payment?.amountCents ?? 0), 0)
  const totalsByReferrer = summariseReferrers(workspace, states)
  const visibleReferrers = referrersFor(workspace, totalsByReferrer, referrerQuery, referrerFilter)
  const selectedReferrer = referrerId ? workspace.referrers.find(item => item.id === referrerId) : undefined
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = states.filter(state => (!referrerId || state.referrer.id === referrerId) && matchesFilter(state, filter) && [state.referral.customerName, state.referral.accountNumber, state.referral.customerContact, state.referrer.name, state.referrer.contact, state.sale?.packageName].some(value => value?.toLowerCase().includes(normalizedQuery)))
    .sort((a, b) => priority[a.status] - priority[b.status] || b.referral.createdAt.localeCompare(a.referral.createdAt))
  const pageSize = 30
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  return <>
    <div className="page-heading view-heading referral-heading"><div><div className="eyebrow referral-eyebrow"><span className="eyebrow-line" /> YOUR NETWORK</div><h1>Referrals</h1><p>From a good introduction to a well-earned thank you.</p></div><button className="button button-primary" onClick={onAdd}><Plus size={16} /> ADD REFERRAL</button></div>

    <section className="referral-policy" aria-label="Referral reward rules">
      <div className="referral-policy-intro"><div className="referral-policy-icon"><Gift size={19} /></div><div><span className="referral-kicker">THE REWARD / PER ACTIVATION</span><h2>Good leads. Real rewards.</h2><p>Earned only when the referred customer completes the pipeline and activates. Record payments here after sending them yourself.</p></div></div>
      <div className="referral-tiers"><div><span>PACKAGE R200 OR LESS</span><strong>R20</strong><small>per activation</small></div><div><span>PACKAGE OVER R200</span><strong>R30</strong><small>per activation</small></div></div>
    </section>

    <section className="referral-metrics" aria-label="Referral summary">
      <div className="referral-metric metric-due"><span>READY TO PAY</span><strong>{formatRand(dueCents)}</strong><small>{ready.length} activated {ready.length === 1 ? 'referral' : 'referrals'}</small><Wallet size={17} /></div>
      <div className="referral-metric"><span>IN PROGRESS</span><strong>{String(inProgress.length).padStart(2, '0')}</strong><small>not yet payable</small><UsersRound size={17} /></div>
      <div className="referral-metric"><span>NEEDS ATTENTION</span><strong>{String(attention.length).padStart(2, '0')}</strong><small>details or review needed</small><Link2 size={17} /></div>
      <div className="referral-metric"><span>PAID TO DATE</span><strong>{formatRand(paidCents)}</strong><small>{paid.length} {paid.length === 1 ? 'payment' : 'payments'} recorded</small><Check size={17} /></div>
    </section>

    <section className="referral-section" aria-labelledby="referral-tracker-heading">
      <div className="referral-section-heading"><div><span className="referral-kicker">01 / REFERRAL TRACKER</span><h2 id="referral-tracker-heading">Referred customers <span>{String(states.length).padStart(2, '0')}</span></h2><p>Follow each introduction through the pipeline.</p>{selectedReferrer && <button className="referrer-scope" onClick={() => { setReferrerId(null); setPage(0) }}>SHOWING {selectedReferrer.name.toUpperCase()} <X size={12} /> <span className="sr-only">Clear referrer filter</span></button>}</div><div className="referral-controls"><label className="search-field"><Search size={16} /><span className="sr-only">Search referrals</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Search referrals" /></label><label className="period-field"><span className="sr-only">Filter referrals</span><select value={filter} onChange={event => { setFilter(event.target.value as Filter); setPage(0) }}><option value="all">ALL STATUSES</option><option value="progress">IN PROGRESS</option><option value="ready">READY TO PAY</option><option value="attention">NEEDS ATTENTION</option><option value="paid">PAID</option><option value="declined">DECLINED</option></select></label></div></div>
      {!states.length ? <div className="table-empty referral-empty"><EmptyState title="Your first referral starts here." action={<button className="button button-primary" onClick={onAdd}>ADD REFERRAL <ArrowRight size={15} /></button>}>Add the person who referred them and the customer. You can link their account now or later.</EmptyState></div> : !filtered.length ? <div className="table-empty referral-empty"><EmptyState title="No matching referrals.">Try a different search or status.</EmptyState></div> : <div className="referral-list">{visible.map(state => <ReferralRow key={state.referral.id} state={state} onEdit={onEdit} onRemove={onRemove} onAddToLeads={onAddToLeads} onVerify={onVerify} onCall={onCall} onEditSale={onEditSale} onPay={onPay} onHistory={onHistory} onOpenCustomer={onOpenCustomer} />)}</div>}
      <div className="referral-list-foot"><span>SHOWING {filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)}` : '0'} OF {filtered.length} REFERRALS</span>{pageCount > 1 ? <div className="pagination"><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous referrals page">PREV</button><span>{currentPage + 1} / {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount - 1} aria-label="Next referrals page">NEXT</button></div> : <span>ONE REFERRAL PER CUSTOMER ACCOUNT</span>}</div>
    </section>

    <section className="referral-section referral-people-section" aria-labelledby="referrers-heading">
      <div className="referral-section-heading">
        <div><span className="referral-kicker">02 / YOUR REFERRERS</span><h2 id="referrers-heading">People to thank <span>{String(workspace.referrers.length).padStart(2, '0')}</span></h2><p>Every person who introduces customers, with what each one is owed and has earned.</p></div>
        <button className="button button-outline button-small" onClick={onAddReferrer}><Plus size={14} /> ADD REFERRER</button>
      </div>
      {!!workspace.referrers.length && <div className="referrer-controls">
        <label className="search-field"><Search size={16} /><span className="sr-only">Search referrers</span><input value={referrerQuery} onChange={event => setReferrerQuery(event.target.value)} placeholder="Search referrers" /></label>
        <label className="period-field"><span className="sr-only">Filter referrers</span><select value={referrerFilter} onChange={event => setReferrerFilter(event.target.value as ReferrerFilter)}><option value="active">ACTIVE PEOPLE</option><option value="balance">WITH BALANCE</option><option value="archived">ARCHIVED</option><option value="all">EVERYONE</option></select></label>
      </div>}
      {workspace.referrers.length ? (visibleReferrers.length ? <div className="referrer-grid">{visibleReferrers.map(referrer => {
        const totals = totalsByReferrer.get(referrer.id) ?? EMPTY_TOTALS
        const archived = !!referrer.archivedAt
        return <article className={`referrer-card ${archived ? 'referrer-card-archived' : ''}`} key={referrer.id}>
          <div className="referrer-card-head">
            <Initials name={referrer.name} />
            <div><h3 className="referrer-name">{referrer.name}</h3><p>{referrer.contact || 'No contact added'}</p>{archived && <span className="referrer-badge">ARCHIVED</span>}</div>
            <button className="icon-button" onClick={() => onEditReferrer(referrer)} aria-label={`Edit referrer ${referrer.name}`} title="Edit referrer"><Pencil size={14} /></button>
            <button className="icon-button" onClick={() => onArchiveReferrer(referrer, !archived)} aria-label={`${archived ? 'Restore' : 'Archive'} referrer ${referrer.name}`} title={archived ? 'Restore referrer' : 'Archive referrer'}>{archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
            {!totals.referralCount && <button className="icon-button row-delete" onClick={() => onRemoveReferrer(referrer)} aria-label={`Delete referrer ${referrer.name}`} title="Delete referrer"><Trash2 size={14} /></button>}
          </div>
          {referrer.notes && <p className="referrer-card-note">{referrer.notes}</p>}
          <div className="referrer-card-totals">
            <div><span>REFERRALS</span><strong>{String(totals.referralCount).padStart(2, '0')}</strong></div>
            <div><span>TO PAY</span><strong>{formatRand(totals.dueCents)}</strong></div>
            <div><span>PAID</span><strong>{formatRand(totals.paidCents)}</strong></div>
          </div>
          <div className="referrer-card-foot">
            <span>{referrerSummary(totals)}</span>
            {!!totals.referralCount && <button className="text-action" onClick={() => { setReferrerId(referrer.id); setFilter('all'); setPage(0); setQuery('') }}>VIEW REFERRALS <ArrowRight size={12} /></button>}
          </div>
        </article>
      })}</div> : <div className="referrer-empty">{referrerEmptyMessage(referrerFilter, referrerQuery)}</div>) : <div className="referrer-empty">No referrers yet. Add the person who introduced your first customer, or add them while capturing a referral.</div>}
    </section>
    <p className="referral-privacy">PRIVATE TO THIS WORKSPACE · PAYMENTS ARE RECORDED, NOT SENT</p>
  </>
}
