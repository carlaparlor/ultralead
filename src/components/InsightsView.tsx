import { useMemo, useState } from 'react'
import {
  ArrowRight, CalendarClock, CircleAlert, CircleCheck, Flame, Hourglass, Info, Package, TrendingDown, TrendingUp, UsersRound, Wallet,
} from 'lucide-react'
import { formatRand } from '../domain/money'
import { formatDate } from '../domain/dates'
import { daysInMonth, monthRangeLabel } from '../domain/months'
import {
  deadlineLeads, monthTrend, monthlyInsights, monthlyPerformance, type MonthComparison, type MonthSummary,
} from '../domain/monthly'
import type { View, Workspace } from '../domain/types'
import { EmptyState, Initials, StatusPill } from './ui'

type Metric = 'activations' | 'calls' | 'value'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'activations', label: 'ACTIVATIONS' },
  { id: 'calls', label: 'CALLS' },
  { id: 'value', label: 'VALUE' },
]

const percent = (value: number) => `${Math.round(value * 100)}%`
const metres = (cents: number) => formatRand(cents)

function Trend({ comparison }: { comparison: MonthComparison }) {
  if (comparison.direction === 'flat') return <span className="trend trend-flat">{comparison.text}</span>
  return <span className={`trend trend-${comparison.direction}`}>
    {comparison.direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{comparison.text}
  </span>
}

function Headline({ label, value, detail, comparison, tone }: {
  label: string; value: string; detail: string; comparison?: MonthComparison; tone: string
}) {
  return <div className={`month-headline headline-${tone}`}>
    <span className="month-headline-label">{label}</span>
    <strong>{value}</strong>
    <span className="month-headline-detail">{detail}</span>
    {comparison && <Trend comparison={comparison} />}
  </div>
}

function monthShortDate(value: Date | null): string {
  return value ? formatDate(value, { day: 'numeric', month: 'short' }) : '—'
}

export function InsightsView({ workspace, now, onNavigate, onOpenCustomer, onOpenActivations }: {
  workspace: Workspace; now: Date; onNavigate: (view: View) => void; onOpenCustomer: (account: string) => void;
  onOpenActivations: (monthKey?: string) => void;
}) {
  const performance = useMemo(() => monthlyPerformance(workspace, now), [workspace, now])
  const [metric, setMetric] = useState<Metric>('activations')
  const { current, previous, target } = performance
  const insights = monthlyInsights(performance)
  const deadlines = useMemo(() => deadlineLeads(workspace, now), [workspace, now])

  if (!performance.hasActivity) {
    return <>
      <div className="page-heading view-heading"><div><h1>Monthly performance</h1><span className="heading-note">{current.label}</span></div></div>
      <div className="table-empty"><EmptyState title="Nothing to measure yet." action={<button className="button button-primary" onClick={() => onNavigate('overview')}>GO TO THE DESK <ArrowRight size={15} /></button>}>
        Log a few calls and activations and this page becomes a month-by-month record of what you actually did.
      </EmptyState></div>
    </>
  }

  const targetValue = target.activations
  const targetProgress = targetValue ? Math.min(1, current.pipeline.activated / targetValue) : 0
  const metricValue = (month: MonthSummary) => metric === 'calls' ? month.calls.attempts : metric === 'value' ? month.pipeline.activatedValueCents : month.pipeline.activated
  const peak = Math.max(1, ...performance.history.map(metricValue))
  const valueDetail = current.pipeline.activatedWithoutPrice
    ? `${metres(current.pipeline.activatedValueCents)} priced · ${current.pipeline.activatedWithoutPrice} without a price`
    : current.pipeline.activated
      ? 'from priced activations this month'
      : 'no activations yet this month'

  return <>
    <div className="page-heading view-heading month-heading">
      <div>
        <div className="eyebrow referral-eyebrow"><span className="eyebrow-line" /> MONTH TO DATE</div>
        <h1>Monthly performance</h1>
        <p>{monthRangeLabel(current.month, now)} · {performance.daysLeft} day{performance.daysLeft === 1 ? '' : 's'} left</p>
      </div>
      <div className="month-heading-actions">
        <span className="heading-note">{previous.label} for comparison</span>
        <button className="button button-outline button-small" onClick={() => onOpenActivations(current.key)} >ALL ACTIVATIONS <ArrowRight size={14} /></button>
      </div>
    </div>

    <div className="month-headlines">
      <Headline label="ACTIVATED THIS MONTH" value={String(current.pipeline.activated).padStart(2, '0')}
        detail={`${current.pipeline.att} ATT · ${current.pipeline.nonAtt} non-ATT${performance.projectedActivations !== null ? ` · on pace for ${Math.round(performance.projectedActivations)}` : ''}`}
        comparison={monthTrend(current.pipeline.activated, previous.pipeline.activated)} tone="green" />
      <Headline label="ACTIVATION VALUE" value={metres(current.pipeline.activatedValueCents)}
        detail={valueDetail}
        comparison={monthTrend(current.pipeline.activatedValueCents, previous.pipeline.activatedValueCents)} tone="teal" />
      <Headline label="SALES RECORDED" value={String(current.pipeline.recorded).padStart(2, '0')}
        detail={current.pipeline.recorded ? `${current.pipeline.declined} declined · ${percent(current.pipeline.activationRate)} of decided sales activated` : 'nothing recorded this month yet'}
        comparison={monthTrend(current.pipeline.recorded, previous.pipeline.recorded)} tone="violet" />
      <Headline label="CALLS LOGGED" value={String(current.calls.attempts).padStart(2, '0')}
        detail={`${current.calls.customers} customer${current.calls.customers === 1 ? '' : 's'} · ${current.calls.perActiveDay.toFixed(1)} per calling day`}
        comparison={monthTrend(current.calls.attempts, previous.calls.attempts)} tone="blue" />
      <Headline label="REFERRAL REWARDS" value={metres(current.value.referralDueCents)}
        detail={`earned this month · ${metres(current.value.referralPaidCents)} already paid`}
        tone="amber" />
    </div>

    <div className="month-split">
      <section className="month-card month-target" aria-labelledby="month-target-heading">
        <div className="month-card-head">
          <div><span className="referral-kicker">MONTHLY TARGET</span><h2 id="month-target-heading">{targetValue ? `${current.pipeline.activated} of ${targetValue} activations` : 'No target set'}</h2></div>
          {target.reachedAt && <StatusPill tone="good">REACHED {monthShortDate(target.reachedAt).toUpperCase()}</StatusPill>}
        </div>
        {targetValue ? <>
          <div className="month-target-track" role="img" aria-label={`${current.pipeline.activated} of ${targetValue} activations, ${percent(targetProgress)}`}>
            <span className="month-target-fill" style={{ width: `${Math.max(current.pipeline.activated ? 2 : 0, targetProgress * 100)}%` }} />
            {previous.pipeline.activated > 0 && previous.pipeline.activated < targetValue && <span className="month-target-marker" style={{ left: `${(previous.pipeline.activated / targetValue) * 100}%` }} title={`Last month: ${previous.pipeline.activated}`} />}
          </div>
          <div className="month-target-foot">
            <span><strong>{percent(targetProgress)}</strong> of target{previous.pipeline.activated ? ` · last month closed on ${previous.pipeline.activated}` : ''}</span>
            <span>{targetProgress >= 1 ? 'Ahead of plan' : `${Math.max(0, targetValue - current.pipeline.activated)} to go`}</span>
          </div>
        </> : <p className="month-card-note">Set a target in <button className="month-card-link" onClick={() => onNavigate('settings')}>Data &amp; settings</button> to track the month against a number. Without one, last month is the benchmark.</p>}
        {performance.projectedValueCents !== null && <p className="month-card-note"><Info size={13} /> On this pace the month finishes near {metres(Math.round(performance.projectedValueCents))} of activation value.</p>}
      </section>

      <section className="month-card month-consistency" aria-labelledby="month-consistency-heading">
        <div className="month-card-head"><div><span className="referral-kicker">CONSISTENCY</span><h2 id="month-consistency-heading">The rhythm of the month</h2></div></div>
        <div className="month-facts">
          <div><span>BEST MONTH</span><strong>{performance.best ? performance.best.month.short : '—'}</strong><small>{performance.best ? `${performance.best.activations} activations` : 'no completed month yet'}</small></div>
          <div><span>AVG / ACTIVE MONTH</span><strong>{performance.activationsPerActiveMonth === null ? '—' : performance.activationsPerActiveMonth.toFixed(1)}</strong><small>months with at least one</small></div>
          <div><span>STREAK</span><strong>{performance.streak}<Flame size={13} /></strong><small>months with an activation</small></div>
          <div><span>LAST CALL LOGGED</span><strong>{performance.daysWithCallLast ? formatDate(performance.daysWithCallLast, { day: 'numeric', month: 'short' }) : '—'}</strong><small>{performance.daysWithCallLast ? 'this month' : 'no calls this month'}</small></div>
        </div>
        <div className="month-heat" role="img" aria-label={`Daily activity for ${current.label}: ${performance.days.filter(day => day.attempts > 0).length} calling days`}>
          {performance.days.map(day => {
            const level = day.attempts === 0 ? 0 : day.attempts < 5 ? 1 : day.attempts < 12 ? 2 : 3
            return <span key={day.key} className={`heat-cell heat-${level} ${day.isWeekend ? 'is-weekend' : ''} ${day.isToday ? 'is-today' : ''} ${day.isFuture ? 'is-future' : ''}`}
              title={`${day.day} ${current.short}: ${day.attempts} call${day.attempts === 1 ? '' : 's'}${day.activations ? `, ${day.activations} activated` : ''}`}>
              {day.activations > 0 ? day.activations : ''}
            </span>
          })}
        </div>
        <div className="heat-legend"><span><i className="heat-cell heat-0" /> none</span><span><i className="heat-cell heat-1" /> 1–4</span><span><i className="heat-cell heat-2" /> 5–11</span><span><i className="heat-cell heat-3" /> 12+</span><span className="heat-numbers">numbers = activations</span></div>
      </section>
    </div>

    <section className="month-section" aria-labelledby="month-trend-heading">
      <div className="section-heading">
        <div><span className="referral-kicker">MONTH BY MONTH</span><h2 id="month-trend-heading">The last {performance.months.length} months</h2></div>
        <div className="range-switch month-metric-switch" role="group" aria-label="Trend metric">
          {METRICS.map(item => <button key={item.id} className={metric === item.id ? 'is-on' : ''} aria-pressed={metric === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>)}
        </div>
      </div>
      <div className="month-bars" aria-label={`${metric === 'calls' ? 'Calls logged' : metric === 'value' ? 'Activation value' : 'Activations'} per month, oldest first`} role="group">
        {performance.months.map(month => {
          const value = metricValue(month)
          return <button className={`month-bar-column ${month.isCurrent ? 'is-current' : ''}`} key={month.key} title={`Open ${month.label} activations`} onClick={() => onOpenActivations(month.key)} aria-label={`${month.label}: ${metric === 'value' ? metres(value) : value}. Open activations.`}>
            <span className="month-bar-value">{metric === 'value' ? metres(value) : value}</span>
            <div className="month-bar-area"><span className="month-bar" style={{ height: `${Math.max(value ? 3 : 0, (value / peak) * 100)}%` }} /></div>
            <span className="month-bar-label">{month.short}</span>
          </button>
        })}
      </div>
      <div className="month-table-wrap">
        <table className="month-table">
          <caption className="sr-only">Month by month performance</caption>
          <thead><tr><th scope="col">MONTH</th><th scope="col">ACTIVATED</th><th scope="col">ATT / NON</th><th scope="col">VALUE</th><th scope="col">SALES</th><th scope="col">CALLS</th><th scope="col">CONTACT</th><th scope="col">DAYS TO ACTIVATE</th></tr></thead>
          <tbody>{[...performance.history].reverse().map(month => <tr key={month.key} className={month.isCurrent ? 'is-current' : ''}>
            <th scope="row"><button className="month-table-link" onClick={() => onOpenActivations(month.key)}>{month.label}{month.isCurrent && <span className="month-now">NOW</span>}</button></th>
            <td>{month.pipeline.activated}</td>
            <td>{month.pipeline.att} / {month.pipeline.nonAtt}</td>
            <td>{metres(month.pipeline.activatedValueCents)}{month.pipeline.activatedWithoutPrice > 0 && <small> +{month.pipeline.activatedWithoutPrice} unpriced</small>}</td>
            <td>{month.pipeline.recorded}</td>
            <td>{month.calls.attempts}</td>
            <td>{month.calls.attempts ? percent(month.calls.contactRate) : '—'}</td>
            <td>{month.pipeline.averageDaysToActivate === null ? '—' : month.pipeline.averageDaysToActivate.toFixed(1)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <div className="month-two-column">
      <section className="month-section" aria-labelledby="month-funnel-heading">
        <div className="section-heading"><div><span className="referral-kicker">THIS MONTH'S INTAKE</span><h2 id="month-funnel-heading">What happened to the sales</h2><p className="section-sub">Sales recorded in {current.label}, tracked to their current stage.</p></div></div>
        <div className="month-funnel">
          {[
            { label: 'Sales recorded', value: current.pipeline.recorded, tone: 'blue' },
            { label: 'Activated', value: current.pipeline.activated, tone: 'green' },
            { label: 'Declined at vetting', value: current.pipeline.declined, tone: 'rose' },
          ].map(step => <div className="month-funnel-step" key={step.label}>
            <div><span>{step.label}</span><strong>{step.value}</strong></div>
            <div className="month-funnel-track"><span className={`month-funnel-fill fill-${step.tone}`} style={{ width: `${Math.max(step.value ? 3 : 0, (step.value / Math.max(1, current.pipeline.recorded)) * 100)}%` }} /></div>
          </div>)}
          <div className="month-funnel-foot">
            <div><span>AVG. DAYS TO ACTIVATE</span><strong>{current.pipeline.averageDaysToActivate === null ? '—' : current.pipeline.averageDaysToActivate.toFixed(1)}</strong></div>
            <div><span>STILL OPEN</span><strong>{Math.max(0, current.pipeline.recorded - current.pipeline.activated - current.pipeline.declined)}</strong></div>
          </div>
        </div>
        <div className="month-packages">
          <div className="form-label">PACKAGES ACTIVATED THIS MONTH <span>{performance.packages.length} PACKAGE{performance.packages.length === 1 ? '' : 'S'}</span></div>
          {performance.packages.length ? performance.packages.slice(0, 5).map(item => <div className="package-row" key={item.name}>
            <span className="package-name">{item.name}</span>
            <span className="package-bar"><i style={{ width: `${(item.count / performance.packages[0].count) * 100}%` }} /></span>
            <span className="package-numbers">{item.count} · {metres(item.valueCents)}</span>
          </div>) : <div className="insight-empty">No activations with a package this month yet.</div>}
        </div>
      </section>

      <section className="month-section" aria-labelledby="month-actions-heading">
        <div className="section-heading"><div><span className="referral-kicker">WHAT TO DO NEXT</span><h2 id="month-actions-heading">From the numbers to the desk</h2></div></div>
        <div className="month-insights">
          {insights.length ? insights.map(item => <article className={`month-insight insight-${item.tone}`} key={item.id}>
            <div className="month-insight-icon">{item.tone === 'good' ? <CircleCheck size={15} /> : item.tone === 'act' ? <CircleAlert size={15} /> : <Info size={15} />}</div>
            <div><strong>{item.title}</strong><p>{item.detail}</p></div>
          </article>) : <div className="insight-empty">Nothing needs attention. Keep logging outcomes and the month fills in.</div>}
          {current.value.referralDueCents > 0 && <button className="panel-link" onClick={() => onNavigate('referrals')}>OPEN REFERRALS <ArrowRight size={14} /></button>}
        </div>

        <div className="month-card month-deadlines" aria-labelledby="deadline-heading">
          <div className="month-card-head">
            <div><span className="referral-kicker"><Hourglass size={12} /> CLOSING WINDOW</span><h2 id="deadline-heading">Ages out soon</h2></div>
            <button className="text-action" onClick={() => onNavigate('leads')}>ALL LEADS <ArrowRight size={12} /></button>
          </div>
          <p className="month-card-note">Customers at 58 or 59 today. Still callable, but the next birthday removes them from the list for good.</p>
          {deadlines.length ? <div className="deadline-list">{deadlines.map(item => <button className="deadline-row" key={item.lead.accountNumber} onClick={() => onOpenCustomer(item.lead.accountNumber)}>
            <Initials name={item.lead.name} />
            <span className="deadline-person"><strong>{item.lead.name}</strong><small>{item.lead.accountNumber} · turns 60 in {60 - (item.age ?? 0)} year{60 - (item.age ?? 0) === 1 ? '' : 's'}</small></span>
            <span className="deadline-meta">
              <span>{item.age} TODAY</span>
              <small>{item.callbackAt ? `callback ${monthShortDate(new Date(item.callbackAt))}` : item.lastAttemptAt ? `last try ${monthShortDate(new Date(item.lastAttemptAt))}` : 'not tried yet'}</small>
            </span>
          </button>)}</div> : <div className="month-empty"><UsersRound size={15} /> No 58–59s in the current list or callbacks.</div>}
        </div>
      </section>
    </div>

    <section className="month-summary-strip" aria-label="Where this month stands">
      <div><Wallet size={15} /><span>REFERRAL REWARDS EARNED</span><strong>{metres(current.value.referralDueCents + current.value.referralPaidCents)}</strong></div>
      <div><Package size={15} /><span>ACTIVATIONS WITHOUT A PRICE</span><strong>{current.pipeline.activatedWithoutPrice}</strong></div>
      <div><CalendarClock size={15} /><span>DAYS LEFT THIS MONTH</span><strong>{performance.daysLeft}</strong></div>
      <div><CircleCheck size={15} /><span>CALLING DAYS SO FAR</span><strong>{performance.days.filter(day => day.attempts > 0).length} / {now.getDate()}</strong></div>
    </section>
    <p className="referral-privacy">DERIVED FROM THIS WORKSPACE · ACTIVATIONS COUNTED IN THE MONTH THEY ACTIVATED ({daysInMonth(current.month)} DAYS)</p>
  </>
}
