import { useMemo, useState } from 'react'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { formatRand } from '../domain/money'
import { formatDate } from '../domain/dates'
import { deadlineLeads, monthTrend, monthlyPerformance, type MonthComparison, type MonthSummary } from '../domain/monthly'
import type { View, Workspace } from '../domain/types'
import { EmptyState, Initials } from './ui'

/*
 * Monthly performance is deliberately a small page: four numbers for the month in progress,
 * the target, six months of shape, this month's days, and the leads that close their window.
 * Anything that only described the numbers instead of showing them was removed.
 */

type Metric = 'activations' | 'calls'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'activations', label: 'ACTIVATIONS' },
  { id: 'calls', label: 'CALLS' },
]

const percent = (value: number) => `${Math.round(value * 100)}%`

function Trend({ comparison }: { comparison: MonthComparison }) {
  if (comparison.direction === 'flat') return <span className="trend trend-flat">no change</span>
  return <span className={`trend trend-${comparison.direction}`}>
    {comparison.direction === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
    {comparison.text.replace(' vs last month', '')}
  </span>
}

function Figure({ label, value, comparison, onClick }: {
  label: string; value: string; comparison?: MonthComparison; onClick?: () => void
}) {
  const body = <>
    <span className="month-figure-label">{label}</span>
    <strong>{value}</strong>
    {comparison && <Trend comparison={comparison} />}
  </>
  return onClick
    ? <button className="month-figure" onClick={onClick}>{body}</button>
    : <div className="month-figure">{body}</div>
}

const shortDate = (value: Date | null) => (value ? formatDate(value, { day: 'numeric', month: 'short' }) : '—')

export function InsightsView({ workspace, now, onNavigate, onOpenCustomer, onOpenActivations }: {
  workspace: Workspace; now: Date; onNavigate: (view: View) => void; onOpenCustomer: (account: string) => void;
  onOpenActivations: (monthKey?: string) => void;
}) {
  const performance = useMemo(() => monthlyPerformance(workspace, now), [workspace, now])
  const [metric, setMetric] = useState<Metric>('activations')
  const { current, previous, target } = performance
  const deadlines = useMemo(() => deadlineLeads(workspace, now), [workspace, now])

  if (!performance.hasActivity) {
    return <>
      <div className="page-heading view-heading"><div><h1>Insights</h1></div></div>
      <div className="table-empty"><EmptyState title="Nothing to measure yet." action={<button className="button button-primary" onClick={() => onNavigate('overview')}>GO TO THE DESK <ArrowRight size={15} /></button>}>
        Log calls and activations and the month fills in.
      </EmptyState></div>
    </>
  }

  const targetValue = target.activations
  const targetProgress = targetValue ? Math.min(1, current.pipeline.activated / targetValue) : 0
  const metricValue = (month: MonthSummary) => metric === 'calls' ? month.calls.attempts : month.pipeline.activated
  const peak = Math.max(1, ...performance.history.map(metricValue))
  const callingDays = performance.days.filter(day => day.attempts > 0).length
  const rewardsDue = current.value.referralDueCents

  return <>
    <div className="page-heading view-heading month-heading">
      <div>
        <h1>Insights</h1>
        <p>{current.label} · {performance.daysLeft} day{performance.daysLeft === 1 ? '' : 's'} left</p>
      </div>
      <button className="button button-outline button-small" onClick={() => onOpenActivations(current.key)}>ALL ACTIVATIONS <ArrowRight size={14} /></button>
    </div>

    <div className="month-figures" role="group" aria-label="Month to date">
      <Figure label="ACTIVATED" value={String(current.pipeline.activated)} onClick={() => onOpenActivations(current.key)}
        comparison={monthTrend(current.pipeline.activated, previous.pipeline.activated)} />
      <Figure label="SALES RECORDED" value={String(current.pipeline.recorded)}
        comparison={monthTrend(current.pipeline.recorded, previous.pipeline.recorded)} />
      <Figure label="CALLS LOGGED" value={String(current.calls.attempts)}
        comparison={monthTrend(current.calls.attempts, previous.calls.attempts)} />
      <Figure label="ATT / NON-ATT" value={`${current.pipeline.att} / ${current.pipeline.nonAtt}`} />
    </div>

    <div className="month-target-bar">
      {targetValue ? <>
        <span className="month-target-label">TARGET</span>
        <strong>{current.pipeline.activated} of {targetValue}</strong>
        <div className="month-target-track" role="img" aria-label={`${current.pipeline.activated} of ${targetValue} activations, ${percent(targetProgress)}`}>
          <span className="month-target-fill" style={{ width: `${Math.max(current.pipeline.activated ? 2 : 0, targetProgress * 100)}%` }} />
          {previous.pipeline.activated > 0 && previous.pipeline.activated < targetValue &&
            <span className="month-target-marker" style={{ left: `${(previous.pipeline.activated / targetValue) * 100}%` }} title={`Last month: ${previous.pipeline.activated}`} />}
        </div>
        <span className="month-target-go">{targetProgress >= 1 ? (target.reachedAt ? `REACHED ${shortDate(target.reachedAt).toUpperCase()}` : 'REACHED') : `${targetValue - current.pipeline.activated} TO GO`}</span>
      </> : <button className="text-action" onClick={() => onNavigate('settings')}>SET A MONTHLY TARGET <ArrowRight size={12} /></button>}
    </div>

    <section className="month-section" aria-labelledby="month-trend-heading">
      <div className="section-heading">
        <div><h2 id="month-trend-heading">Month by month</h2></div>
        <div className="range-switch month-metric-switch" role="group" aria-label="Trend metric">
          {METRICS.map(item => <button key={item.id} className={metric === item.id ? 'is-on' : ''} aria-pressed={metric === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>)}
        </div>
      </div>
      <div className="month-bars" aria-label={`${metric === 'calls' ? 'Calls logged' : 'Activations'} per month, oldest first`} role="group">
        {performance.months.map(month => {
          const value = metricValue(month)
          return <button className={`month-bar-column ${month.isCurrent ? 'is-current' : ''}`} key={month.key} title={`Open ${month.label} activations`} onClick={() => onOpenActivations(month.key)}
            aria-label={`${month.label}: ${value}. Open activations.`}>
            <span className="month-bar-value">{value}</span>
            <div className="month-bar-area"><span className="month-bar" style={{ height: `${Math.max(value ? 3 : 0, (value / peak) * 100)}%` }} /></div>
            <span className="month-bar-label">{month.short}</span>
          </button>
        })}
      </div>
    </section>

    <div className="month-two-column">
      <section className="month-section" aria-labelledby="month-days-heading">
        <div className="section-heading">
          <div><h2 id="month-days-heading">Days this month</h2></div>
          <span className="month-caption">{callingDays} of {now.getDate()} called</span>
        </div>
        <div className="month-heat" role="img" aria-label={`Daily activity for ${current.label}: ${callingDays} calling days`}>
          {performance.days.map(day => {
            const level = day.attempts === 0 ? 0 : day.attempts < 5 ? 1 : day.attempts < 12 ? 2 : 3
            return <span key={day.key} className={`heat-cell heat-${level} ${day.isWeekend ? 'is-weekend' : ''} ${day.isToday ? 'is-today' : ''} ${day.isFuture ? 'is-future' : ''}`}
              title={`${day.day} ${current.short}: ${day.attempts} call${day.attempts === 1 ? '' : 's'}${day.activations ? `, ${day.activations} activated` : ''}`}>
              {day.activations > 0 ? day.activations : ''}
            </span>
          })}
        </div>
        <div className="heat-legend"><span><i className="heat-cell heat-0" /> none</span><span><i className="heat-cell heat-1" /> 1–4</span><span><i className="heat-cell heat-2" /> 5–11</span><span><i className="heat-cell heat-3" /> 12+</span><span className="heat-numbers">numbers = activations</span></div>
        {rewardsDue > 0 && <button className="panel-link month-rewards" onClick={() => onNavigate('referrals')}>{formatRand(rewardsDue)} REWARDS DUE <ArrowRight size={12} /></button>}
      </section>

      <section className="month-section" aria-labelledby="deadline-heading">
        <div className="section-heading">
          <div><h2 id="deadline-heading">Ages out soon</h2></div>
          <button className="text-action" onClick={() => onNavigate('leads')}>ALL LEADS <ArrowRight size={12} /></button>
        </div>
        {deadlines.length ? <div className="deadline-list">{deadlines.map(item => <button className="deadline-row" key={item.lead.accountNumber} onClick={() => onOpenCustomer(item.lead.accountNumber)}>
          <Initials name={item.lead.name} />
          <span className="deadline-person"><strong>{item.lead.name}</strong><small>{item.lead.accountNumber}</small></span>
          <span className="deadline-meta">
            <span>{item.age} TODAY</span>
            <small>{item.callbackAt ? `callback ${shortDate(new Date(item.callbackAt))}` : item.lastAttemptAt ? `last try ${shortDate(new Date(item.lastAttemptAt))}` : 'not tried'}</small>
          </span>
        </button>)}</div> : <div className="month-empty">No one at 58 or 59 today.</div>}
      </section>
    </div>
  </>
}
