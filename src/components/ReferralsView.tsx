import { useMemo, useState } from 'react'
import { ArrowRight, Archive, ArchiveRestore, Check, ChevronDown, Gift, Link2, NotepadText, Pencil, Plus, Search, Trash2, UsersRound, Wallet } from 'lucide-react'
import { createReferralIndex, ledgerTotals, paymentReviewComparison, referralState, referrerActivity, referrerLedger, type ReferralState, type ReferralStatus, type ReferrerActivity, type ReferrerSummary } from '../domain/referrals'
import { formatDate } from '../domain/dates'
import { formatRand } from '../domain/money'
import { monthWindow } from '../domain/month'
import type { Lead, Referral, Referrer, Sale, Workspace } from '../domain/types'
import { EmptyState, Initials, StatusPill } from './ui'

const labels: Record<ReferralStatus, string> = {
  needs_link: 'Needs account', not_in_list: 'Not in lead list', age_review: 'Age review needed', excluded: 'Excluded',
  not_interested: 'Not interested', sale_missing: 'Sale record removed', awaiting_sale: 'Awaiting sale', credit_vetting: 'Credit vetting',
  pending_confirmation: 'Awaiting confirmation', declined: 'Vetting declined', needs_price: 'Needs price',
  ready: 'Ready to pay', paid: 'Paid', paid_review: 'Paid · review',
}
const attentionStatuses: ReferralStatus[] = ['needs_link', 'not_in_list', 'age_review', 'excluded', 'sale_missing', 'needs_price', 'paid_review']
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

function statusExplanation(state: ReferralState): string {
  const { referral, sale, payment, status } = state
  if (sale) return `${sale.packageName}${sale.packagePriceCents === null ? ' · price not set' : ` · ${formatRand(sale.packagePriceCents)}`}`
  if (payment) return 'The original sale is no longer available. Review the payment history.'
  if (!referral.accountNumber) return 'Add an account to connect this customer to the pipeline.'
  if (status === 'not_in_list') return 'Import this customer or add them to your lead list.'
  if (status === 'sale_missing') return 'The sale was removed. Use All leads to return the customer to the queue if appropriate.'
  if (status === 'age_review') return 'Verify the customer is under 60 before calling.'
  if (status === 'excluded') return 'This customer is excluded from calling. Check the source system.'
  if (status === 'not_interested') return 'This customer is marked not interested and is out of the queue.'
  return 'Waiting for a sale to be recorded.'
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
  return <article className={`referral-row ${status === 'ready' ? 'referral-row-ready' : ''}`} aria-label={`Referral for ${referral.customerName}`}>
    <div className="referral-row-grid">
      <div className="referral-customer"><Initials name={referral.customerName} /><div><h3>{referral.customerName}</h3><small>{account ?? 'ACCOUNT NOT LINKED'}</small><small className="referral-via">via <strong>{referrer.name}</strong></small>{referral.customerContact && <small>{referral.customerContact}</small>}</div></div>
      <div className="referral-cell"><span className="referral-cell-label">ADDED</span><strong>{formatDate(referral.createdAt, { day: 'numeric', month: 'short' })}</strong><small>{payment ? `Paid ${formatDate(payment.paidAt, { day: 'numeric', month: 'short' })}` : 'Not paid yet'}</small></div>
      <div className="referral-cell referral-stage"><span className="referral-cell-label">PROGRESS</span><StatusPill tone={statusTone(status)}>{labels[status]}</StatusPill></div>
      <div className="referral-cell referral-amount"><span className="referral-cell-label">REWARD</span><strong>{payment ? formatRand(payment.amountCents) : state.dueCents ? formatRand(state.dueCents) : '—'}</strong><small>{payment ? 'Recorded as paid' : state.dueCents ? 'Due after activation' : 'Not due yet'}</small></div>
    </div>
    {status === 'paid_review' && <div className="referral-review"><strong>Payment needs review.</strong> The activation or its package changed after payment was recorded. The paid amount is preserved.
      {comparison ? <p>Recalculated reward: <strong>{formatRand(comparison.currentRewardCents)}</strong> · Recorded as paid: <strong>{formatRand(comparison.paidCents)}</strong>. {comparison.differenceCents > 0 ? `Possible shortfall: ${formatRand(comparison.differenceCents)}.` : comparison.differenceCents < 0 ? `Possible overpayment: ${formatRand(-comparison.differenceCents)}.` : 'The reward amount is unchanged.'}</p> : <p>The recorded activation is missing, has changed, or has no valid price, so a reward cannot be compared.</p>}
      <p>Any difference is excluded from ready-to-pay totals; additional payments or refunds cannot be recorded here. Only correct a paid mark if it was entered in error.</p>
    </div>}
    <div className="referral-row-bottom">
      <p>{statusExplanation(state)}</p>
      <div className="referral-row-actions">
        {status === 'needs_link' && <button className="text-action" onClick={() => onEdit(referral)}><Link2 size={13} /> LINK ACCOUNT</button>}
        {status === 'not_in_list' && <button className="text-action" onClick={() => onAddToLeads(referral)}><Plus size={13} /> ADD TO LEADS</button>}
        {status === 'age_review' && lead && <button className="text-action" onClick={() => onVerify(lead)}>VERIFY AGE <ArrowRight size={13} /></button>}
        {status === 'awaiting_sale' && lead && (canCall || canOverride) && <button className="text-action" onClick={() => onCall(lead, !!canOverride)}>{canOverride ? 'CALL ANYWAY' : 'CALL'} <ArrowRight size={13} /></button>}
        {status === 'needs_price' && sale && <button className="text-action" onClick={() => onEditSale(sale)}>ADD PRICE <ArrowRight size={13} /></button>}
        {status === 'ready' && <button className="button button-primary button-small" onClick={() => onPay(state)}><Check size={14} /> MARK PAID</button>}
        {referral.payments.length > 0 && <button className="text-action" onClick={() => onHistory(referral)}>PAYMENT HISTORY</button>}
        {lead && account && <button className="icon-button" onClick={() => onOpenCustomer(account)} aria-label={`Notes and history for ${referral.customerName}`} title="Customer notes & history"><NotepadText size={15} /></button>}
        <button className="icon-button" onClick={() => onEdit(referral)} aria-label={`Edit referral for ${referral.customerName}`} title="Edit referral"><Pencil size={15} /></button>
        {!referral.payments.length && <button className="icon-button row-delete" onClick={() => onRemove(referral)} aria-label={`Delete referral for ${referral.customerName}`} title="Delete referral"><Trash2 size={15} /></button>}
      </div>
    </div>
  </article>
}

function activityLine(event: ReferrerActivity): { text: string; detail: string } {
  if (event.kind === 'referral') return { text: `${event.referral.customerName} was referred`, detail: formatDate(event.at, { day: 'numeric', month: 'short' }) }
  if (event.kind === 'paid') return { text: `Paid ${formatRand(event.amountCents)}`, detail: `${event.referral.customerName} · ${formatDate(event.at, { day: 'numeric', month: 'short' })}` }
  if (event.kind === 'review') return { text: `${event.referral.customerName} needs a review`, detail: formatDate(event.at, { day: 'numeric', month: 'short' }) }
  return { text: `${event.referral.customerName} activated`, detail: `${event.amountCents ? `${formatRand(event.amountCents)} now due` : formatDate(event.at, { day: 'numeric', month: 'short' })}` }
}

/** One person: what you owe them now, what came in this month, and every customer behind it. */
function ReferrerLedgerCard({ summary, states, activities, expanded, onToggle, onEdit, onArchive, onRemove }: {
  summary: ReferrerSummary; states: ReferralState[]; activities: ReferrerActivity[]; expanded: boolean; onToggle: () => void;
  onEdit: (referrer: Referrer) => void; onArchive: (referrer: Referrer) => void; onRemove: (referrer: Referrer) => void;
}) {
  const { referrer } = summary
  return <article className={`ledger-card ${summary.dueCents ? 'ledger-card-due' : ''} ${referrer.archivedAt ? 'ledger-card-archived' : ''}`} aria-label={`Ledger for ${referrer.name}`}>
    <div className="ledger-head">
      <Initials name={referrer.name} />
      <div className="ledger-person">
        <h3>{referrer.name}{referrer.archivedAt && <span className="ledger-archived-tag">HIDDEN</span>}</h3>
        <p>{referrer.contact || 'No contact added'}</p>
      </div>
      <div className="ledger-head-tools">
        <button className="icon-button" onClick={() => onEdit(referrer)} aria-label={`Edit referrer ${referrer.name}`} title="Edit details"><Pencil size={14} /></button>
        <button className="icon-button" onClick={() => onArchive(referrer)} aria-label={`${referrer.archivedAt ? 'Show' : 'Hide'} referrer ${referrer.name}`} title={referrer.archivedAt ? 'Show in the active list' : 'Hide from the active list'}>{referrer.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
        {!summary.referrals && <button className="icon-button row-delete" onClick={() => onRemove(referrer)} aria-label={`Delete referrer ${referrer.name}`} title="Delete referrer"><Trash2 size={14} /></button>}
      </div>
    </div>

    <div className="ledger-money">
      <div className={`ledger-money-main ${summary.dueCents ? 'is-due' : ''}`}>
        <span>OWED NOW</span>
        <strong>{formatRand(summary.dueCents)}</strong>
        <small>{summary.readyToPay ? `${summary.readyToPay} ready to pay` : 'nothing outstanding'}</small>
      </div>
      <div><span>EARNED THIS MONTH</span><strong>{formatRand(summary.earnedThisMonthCents)}</strong><small>{summary.earnedThisMonthCount ? `${summary.earnedThisMonthCount} activation${summary.earnedThisMonthCount === 1 ? '' : 's'}` : 'none yet'}</small></div>
      <div><span>PAID TO DATE</span><strong>{formatRand(summary.paidToDateCents)}</strong><small>{summary.lastPaidAt ? `last ${formatDate(summary.lastPaidAt, { day: 'numeric', month: 'short' })}` : 'never paid'}</small></div>
    </div>

    <div className="ledger-meta">
      <span>{summary.referrals} {summary.referrals === 1 ? 'referral' : 'referrals'}</span>
      <span>{summary.awaitingActivation} still to activate</span>
      <span>{summary.inProgress} in progress</span>
      {summary.reviewCount > 0 && <span className="ledger-meta-warn">{summary.reviewCount} to review</span>}
      {referrer.note && <span className="ledger-note" title={referrer.note}>{referrer.note}</span>}
    </div>

    <button className="ledger-toggle" onClick={onToggle} aria-expanded={expanded}>
      {expanded ? 'HIDE CUSTOMERS' : `SEE THE CUSTOMERS${states.length ? ` (${states.length})` : ''}`}
      <ChevronDown size={14} className={expanded ? 'is-open' : ''} />
    </button>

    {expanded && <div className="ledger-detail">
      {states.length ? <>
        <div className="ledger-customers">
          {states.map(state => <div className="ledger-customer" key={state.referral.id}>
            <span className="ledger-customer-name">{state.referral.customerName}<small>{state.referral.accountNumber ?? 'NO ACCOUNT'}</small></span>
            <StatusPill tone={statusTone(state.status)}>{labels[state.status]}</StatusPill>
            <span className="ledger-customer-money">{state.payment ? formatRand(state.payment.amountCents) : state.dueCents ? formatRand(state.dueCents) : '—'}</span>
          </div>)}
        </div>
        {activities.length > 0 && <div className="ledger-activity">
          <span className="referral-cell-label">RECENT</span>
          <ul>{activities.map((event, index) => {
            const line = activityLine(event)
            return <li key={`${event.kind}-${event.referral.id}-${index}`}><span>{line.text}</span><small>{line.detail}</small></li>
          })}</ul>
        </div>}
      </> : <p className="ledger-empty">No customers linked yet. Add a referral and they will appear here.</p>}
    </div>}
  </article>
}

export function ReferralsView({ workspace, now, month, onAdd, onEdit, onRemove, onAddToLeads, onVerify, onCall, onEditSale, onPay, onHistory, onEditReferrer, onArchiveReferrer, onRemoveReferrer, onAddReferrer, onOpenCustomer }: {
  workspace: Workspace; now: Date; month: Date;
  onAdd: () => void; onEdit: (referral: Referral) => void; onRemove: (referral: Referral) => void;
  onAddToLeads: (referral: Referral) => void; onVerify: (lead: Lead) => void; onCall: (lead: Lead, override: boolean) => void; onEditSale: (sale: Sale) => void;
  onPay: (state: ReferralState) => void; onHistory: (referral: Referral) => void;
  onEditReferrer: (referrer: Referrer) => void; onArchiveReferrer: (referrer: Referrer) => void; onRemoveReferrer: (referrer: Referrer) => void;
  onAddReferrer: () => void; onOpenCustomer: (account: string) => void;
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [showPaid, setShowPaid] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const states = useMemo(() => {
    const index = createReferralIndex(workspace)
    return workspace.referrals.map(referral => referralState(workspace, referral, now, index))
  }, [workspace, now])
  const summaries = useMemo(() => referrerLedger(workspace, states, month), [workspace, states, month])
  const totals = useMemo(() => ledgerTotals(summaries), [summaries])
  const monthLabel = monthWindow(month, now).label
  const activeSummaries = summaries.filter(summary => !summary.referrer.archivedAt || summary.dueCents > 0 || showHidden)
  const dueSummaries = activeSummaries.filter(summary => summary.dueCents > 0)
  const settledSummaries = activeSummaries.filter(summary => summary.dueCents === 0)
  const attention = states.filter(state => attentionStatuses.includes(state.status))

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = states.filter(state => matchesFilter(state, filter) && (showPaid || state.status !== 'paid') && [state.referral.customerName, state.referral.accountNumber, state.referral.customerContact, state.referrer.name, state.sale?.packageName].some(value => value?.toLowerCase().includes(normalizedQuery)))
    .sort((a, b) => priority[a.status] - priority[b.status] || b.referral.createdAt.localeCompare(a.referral.createdAt))
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const paidHidden = !showPaid ? states.filter(state => state.status === 'paid').length : 0

  const card = (summary: ReferrerSummary) => <ReferrerLedgerCard key={summary.referrer.id} summary={summary}
    states={states.filter(state => state.referrer.id === summary.referrer.id).sort((a, b) => priority[a.status] - priority[b.status] || b.referral.createdAt.localeCompare(a.referral.createdAt))}
    activities={referrerActivity(states.filter(state => state.referrer.id === summary.referrer.id))}
    expanded={expanded === summary.referrer.id} onToggle={() => setExpanded(expanded === summary.referrer.id ? null : summary.referrer.id)}
    onEdit={onEditReferrer} onArchive={onArchiveReferrer} onRemove={onRemoveReferrer} />

  return <>
    <div className="page-heading view-heading referral-heading">
      <div>
        <div className="eyebrow referral-eyebrow"><span className="eyebrow-line" /> YOUR NETWORK · {monthLabel.toUpperCase()}</div>
        <h1>Referrers</h1>
        <p>Who to thank, what you owe them, and which customers are behind it.</p>
      </div>
      <div className="referral-heading-actions">
        <button className="button button-outline" onClick={onAddReferrer}><UsersRound size={15} /> ADD REFERRER</button>
        <button className="button button-primary" onClick={onAdd}><Plus size={16} /> ADD REFERRAL</button>
      </div>
    </div>

    <section className="referral-policy" aria-label="Referral reward rules">
      <div className="referral-policy-intro"><div className="referral-policy-icon"><Gift size={19} /></div><div><span className="referral-kicker">THE REWARD / PER ACTIVATION</span><h2>Good leads. Real rewards.</h2><p>Earned only when the referred customer completes the pipeline and activates. Pay it yourself, then mark it paid here.</p></div></div>
      <div className="referral-tiers"><div><span>PACKAGE R200 OR LESS</span><strong>R20</strong><small>per activation</small></div><div><span>PACKAGE OVER R200</span><strong>R30</strong><small>per activation</small></div></div>
    </section>

    <section className="referral-metrics" aria-label="Referral summary">
      <div className="referral-metric metric-due"><span>OWED TO REFERRERS</span><strong>{formatRand(totals.dueCents)}</strong><small>{totals.dueCount ? `${totals.dueCount} ready · ${totals.peopleOwed} ${totals.peopleOwed === 1 ? 'person' : 'people'}` : 'nothing to pay'}</small><Wallet size={17} /></div>
      <div className="referral-metric"><span>EARNED IN {monthLabel.split(' ')[0].toUpperCase()}</span><strong>{formatRand(totals.earnedThisMonthCents)}</strong><small>from this month's activations</small><Gift size={17} /></div>
      <div className="referral-metric"><span>PAID IN {monthLabel.split(' ')[0].toUpperCase()}</span><strong>{formatRand(totals.paidThisMonthCents)}</strong><small>{totals.paidThisMonthCount} payment{totals.paidThisMonthCount === 1 ? '' : 's'} recorded</small><Check size={17} /></div>
      <div className="referral-metric"><span>IN PROGRESS</span><strong>{String(totals.openReferrals).padStart(2, '0')}</strong><small>{totals.reviewCount ? `${totals.reviewCount} to review` : `${attention.length} need attention`}</small><UsersRound size={17} /></div>
    </section>

    <section className="referral-section" aria-labelledby="ledger-heading">
      <div className="referral-section-heading">
        <div><span className="referral-kicker">01 / WHO TO THANK</span><h2 id="ledger-heading">The ledger <span>{String(activeSummaries.length).padStart(2, '0')}</span></h2><p>Owed first, then everyone else. Open a person to see the customers behind the money.</p></div>
        <div className="referral-controls">
          {summaries.some(summary => summary.referrer.archivedAt) && <button className="text-action" onClick={() => setShowHidden(!showHidden)} aria-pressed={showHidden}>{showHidden ? 'HIDE HIDDEN PEOPLE' : 'SHOW HIDDEN PEOPLE'}</button>}
          <button className="text-action" onClick={() => onAddReferrer()}><Plus size={13} /> ADD A PERSON</button>
        </div>
      </div>
      {!workspace.referrers.length ? <div className="referrer-empty">Add the people who send you customers. You can add referrals to them as they come in.</div> : <>
        {!activeSummaries.length && <div className="referrer-empty">Everyone is hidden. Use “Show hidden people” to bring them back.</div>}
        {dueSummaries.length > 0 && <div className="ledger-grid ledger-grid-due">{dueSummaries.map(card)}</div>}
        {settledSummaries.length > 0 && <>
          {dueSummaries.length > 0 && <div className="ledger-divider"><span>NOTHING OWED RIGHT NOW</span></div>}
          <div className="ledger-grid">{settledSummaries.map(card)}</div>
        </>}
      </>}
    </section>

    <section className="referral-section" aria-labelledby="referral-tracker-heading">
      <div className="referral-section-heading">
        <div><span className="referral-kicker">02 / EVERY REFERRAL</span><h2 id="referral-tracker-heading">Referred customers <span>{String(states.length).padStart(2, '0')}</span></h2><p>Follow each introduction through the pipeline, ready to pay first.</p></div>
        <div className="referral-controls">
          <label className="search-field"><Search size={16} /><span className="sr-only">Search referrals</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Search referrals" /></label>
          <label className="period-field"><span className="sr-only">Filter referrals</span><select value={filter} onChange={event => { setFilter(event.target.value as Filter); setPage(0) }}><option value="all">ALL STATUSES</option><option value="progress">IN PROGRESS</option><option value="ready">READY TO PAY</option><option value="attention">NEEDS ATTENTION</option><option value="paid">PAID</option><option value="declined">DECLINED</option></select></label>
        </div>
      </div>
      {!states.length ? <div className="table-empty referral-empty"><EmptyState title="Your first referral starts here." action={<button className="button button-primary" onClick={onAdd}>ADD REFERRAL <ArrowRight size={15} /></button>}>Add the person who referred them and the customer. You can link their account now or later.</EmptyState></div> : !filtered.length ? <div className="table-empty referral-empty"><EmptyState title={paidHidden && filter === 'all' && !normalizedQuery ? 'Everything here is paid.' : 'No matching referrals.'}>
        {paidHidden && filter === 'all' && !normalizedQuery ? 'Paid referrals are tucked away to keep this list useful. Show them to look back.' : 'Try a different search or status.'}
      </EmptyState></div> : <div className="referral-list">{visible.map(state => <ReferralRow key={state.referral.id} state={state} onEdit={onEdit} onRemove={onRemove} onAddToLeads={onAddToLeads} onVerify={onVerify} onCall={onCall} onEditSale={onEditSale} onPay={onPay} onHistory={onHistory} onOpenCustomer={onOpenCustomer} />)}</div>}
      <div className="referral-list-foot">
        <span>SHOWING {filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)}` : '0'} OF {filtered.length} REFERRALS</span>
        <div className="referral-foot-right">
          {paidHidden > 0 && <button className="text-action" onClick={() => setShowPaid(true)}>SHOW {paidHidden} PAID</button>}
          {showPaid && <button className="text-action" onClick={() => setShowPaid(false)}>HIDE PAID</button>}
          {pageCount > 1 ? <div className="pagination"><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous referrals page">PREV</button><span>{currentPage + 1} / {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount - 1} aria-label="Next referrals page">NEXT</button></div> : <span>ONE REFERRAL PER CUSTOMER ACCOUNT</span>}
        </div>
      </div>
    </section>
    <p className="referral-privacy">PRIVATE TO THIS WORKSPACE · PAYMENTS ARE RECORDED, NOT SENT</p>
  </>
}
