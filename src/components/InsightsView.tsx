import { useMemo } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Flag, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { change, pointsChange, recentMonths, reviewMonth, type MonthReview, type MonthTotals } from '../domain/analytics'
import { formatDate } from '../domain/dates'
import { formatRand } from '../domain/money'
import type { View, Workspace } from '../domain/types'
import { EmptyState } from './ui'

const percent = (value: number) => `${Math.round(value * 100)}%`
const rand = (cents: number) => formatRand(cents)
const count = (value: number) => String(value).padStart(2, '0')

function Trend({ direction, text }: { direction: 'up' | 'down' | 'flat'; text: string }) {
  if (direction === 'flat') return <span className="trend trend-flat"><Minus size={12} />{text}</span>
  return <span className={`trend trend-${direction}`}>
    {direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{text}
  </span>
}

function Figure({ label, value, note, trend, tone }: { label: string; value: string; note?: string; trend?: React.ReactNode; tone?: string }) {
  return <div className={`review-figure ${tone ? `review-tone-${tone}` : ''}`}>
    <span className="review-figure-label">{label}</span>
    <strong>{value}</strong>
    {note && <span className="review-figure-note">{note}</span>}
    {trend && <span className="review-figure-trend">{trend}</span>}
  </div>
}

/** A labelled line that answers one question, with the comparable figure beside it. */
function Answer({ label, value, compare, detail }: { label: string; value: string; compare?: string; detail?: string }) {
  return <div className="review-answer">
    <span className="review-answer-label">{label}</span>
    <strong>{value}</strong>
    {compare && <span className="review-answer-compare">{compare}</span>}
    {detail && <span className="review-answer-detail">{detail}</span>}
  </div>
}

function compareLabel(review: MonthReview): string {
  const { compareStart, daysElapsed, days, isCurrent } = review.window
  const month = new Intl.DateTimeFormat('en-ZA', { month: 'short' }).format(compareStart)
  // A half-finished month is compared with the same stretch, never with a full month.
  return isCurrent && daysElapsed < days ? `${month} 1–${daysElapsed}` : month
}

function Chart({ review, onOpenActivations }: { review: MonthReview; onOpenActivations: () => void }) {
  const { daily, window: month } = review
  const peak = Math.max(1, ...daily.map(point => point.calls))
  const last = daily[daily.length - 1]
  const best = review.bestDay
  return <section className="review-card review-chart-card" aria-labelledby="review-chart-heading">
    <div className="review-card-head">
      <div>
        <span className="review-kicker">DAY BY DAY</span>
        <h2 id="review-chart-heading">Calls this month</h2>
        <p className="review-sub">
          {review.activeDays ? `${review.activeDays} ${review.activeDays === 1 ? 'day' : 'days'} called · ${review.callsPerActiveDay.toFixed(1)} a day on average` : 'No calls logged yet this month'}
          {best && best.calls > 0 && ` · busiest ${best.label}`}
        </p>
      </div>
      <div className="chart-legend" aria-hidden="true">
        <span><i className="legend-callback" /> Reached a person</span>
        <span><i className="legend-no-answer" /> No answer</span>
        <span><i className="legend-activation" /> Activation</span>
      </div>
    </div>
    <div className="review-chart" role="img" aria-label={`Calls per day in ${month.label}: ${daily.map(point => `day ${point.day}, ${point.calls} call${point.calls === 1 ? '' : 's'}${point.activations ? ` and ${point.activations} activation${point.activations === 1 ? '' : 's'}` : ''}`).join('; ')}.`}>
      {daily.map(point => {
        const reached = point.callback + point.sale + point.notInterested
        const showDay = daily.length <= 14 || point.day === 1 || point.day % 5 === 0 || point.day === last.day
        return <div className={`review-chart-column ${point.day === last.day ? 'is-today' : ''}`} key={point.key} title={`${formatDate(new Date(month.start.getFullYear(), month.start.getMonth(), point.day), { day: 'numeric', month: 'short' })}: ${point.calls} call${point.calls === 1 ? '' : 's'} · ${point.activations} activation${point.activations === 1 ? '' : 's'}`}>
          <div className="review-chart-area">
            <div className="review-chart-bar" style={{ height: `${point.calls ? Math.max(6, (point.calls / peak) * 100) : 0}%` }}>
              {reached > 0 && <span className="bar-callback" style={{ flex: reached }} />}
              {point.noAnswer > 0 && <span className="bar-no-answer" style={{ flex: point.noAnswer }} />}
            </div>
            {point.activations > 0 && <span className="review-chart-flag" title={`${point.activations} activation${point.activations === 1 ? '' : 's'}`} />}
          </div>
          <span className={`review-chart-day ${showDay ? '' : 'is-blank'}`}>{point.day}</span>
        </div>
      })}
    </div>
    <p className="review-chart-note">Every day from the 1st {month.isCurrent ? 'to today' : 'to the end of the month'}.</p>
    {review.totals.activations > 0 && <button className="review-link" onClick={onOpenActivations}>SEE THIS MONTH'S ACTIVATIONS <ArrowRight size={14} /></button>}
  </section>
}

/** The one number that matters most this month: completed activations, with the money behind them. */
function Headline({ review, totals, onOpenActivations }: { review: MonthReview; totals: MonthTotals; onOpenActivations: () => void }) {
  const { target } = review
  return <section className="review-headline" aria-label={`Activations in ${review.window.label}`}>
    <div className="review-headline-main">
      <span className="review-kicker">ACTIVATED THIS MONTH</span>
      <div className="review-headline-number">
        <strong data-testid="headline-activations">{count(totals.activations)}</strong>
        <span className="review-headline-unit">{totals.activations === 1 ? 'activation' : 'activations'}</span>
      </div>
      <p className="review-headline-value">{totals.activationValueCents ? `${rand(totals.activationValueCents)} of activated business` : 'No priced activations yet'}</p>
      <div className="review-headline-split">
        <span><i className="split-dot split-att-dot" /><strong>{totals.att}</strong> ATT</span>
        <span><i className="split-dot split-nonatt-dot" /><strong>{totals.nonAtt}</strong> non-ATT</span>
        {totals.declined > 0 && <span className="review-headline-declined"><strong>{totals.declined}</strong> declined</span>}
      </div>
      {target && <div className="review-target">
        <div className="review-target-meta">
          <span><Flag size={12} /> MONTHLY TARGET · {target.value}</span>
          <strong>{target.remaining ? `${target.remaining} to go` : 'Target met'}</strong>
        </div>
        <div className="review-target-track"><span style={{ width: `${Math.max(target.share * 100, target.share > 0 ? 4 : 0)}%` }} /></div>
      </div>}
      <button className="review-link review-link-light" onClick={onOpenActivations}>OPEN ACTIVATIONS <ArrowRight size={14} /></button>
    </div>
    <div className="review-headline-side">
      <div className="review-side-row">
        <span>STILL OPEN</span>
        <strong>{count(totals.openSales)}</strong>
        <small>{totals.openSales ? `${rand(totals.openValueCents)} in vetting and confirmation` : 'Nothing waiting in the pipeline'}</small>
      </div>
      <div className="review-side-row">
        <span>REFERRAL REWARDS EARNED</span>
        <strong>{rand(review.rewards.earnedCents)}</strong>
        <small>{review.rewards.dueCount ? `${rand(review.rewards.dueCents)} still to pay` : 'Nothing outstanding from this month'}</small>
      </div>
      <div className="review-side-row">
        <span>DECLINED THIS MONTH</span>
        <strong>{count(totals.declined)}</strong>
        <small>{totals.declined ? `${rand(totals.declinedValueCents)} lost` : 'No declines'}</small>
      </div>
    </div>
  </section>
}

export function InsightsView({ workspace, now, month: anchor, onMonth, onNavigate }: {
  workspace: Workspace; now: Date; month: Date; onMonth: (month: Date) => void; onNavigate: (view: View) => void;
}) {
  const months = useMemo(() => recentMonths(workspace, now), [workspace, now])
  const review = useMemo(() => reviewMonth(workspace, anchor, now), [workspace, anchor, now])
  const setAnchor = onMonth
  const { totals, previous, window: month } = review
  const currentIndex = months.findIndex(item => item.key === month.key)
  // Months newer than the selected one only exist when the clock moved on while the page was open.
  const newer = currentIndex > 0 ? months[currentIndex - 1] : null
  const older = currentIndex >= 0 ? months[currentIndex + 1] : undefined
  const comparable = review.window.daysElapsed > 0 && review.activeDays > 0 && previous.calls > 0

  return <>
    <div className="page-heading view-heading review-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> MONTH BY MONTH</div>
        <h1>Monthly review</h1>
        <p>One month at a time: what you sold, what activated, and what you still owe.</p>
      </div>
      <div className="month-switch" role="group" aria-label="Month navigation">
        <button onClick={() => newer && setAnchor(newer.anchor)} disabled={!newer} aria-label="Newer month"><ChevronLeft size={15} /></button>
        <label className="sr-only" htmlFor="review-month">Review month</label>
        <select id="review-month" value={month.key} onChange={event => {
          const chosen = months.find(item => item.key === event.target.value)
          if (chosen) setAnchor(chosen.anchor)
        }}>
          {!months.some(item => item.key === month.key) && <option value={month.key}>{month.label}</option>}
          {months.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <button onClick={() => older && setAnchor(older.anchor)} disabled={!older} aria-label="Older month"><ChevronRight size={15} /></button>
      </div>
    </div>

    {!review.hasActivity ? <div className="table-empty review-empty">
      <EmptyState title={`Nothing logged in ${month.label} yet.`}>
        {month.isCurrent
          ? 'Log a few calls and the month fills in: calls, sales, activations and referral money.'
          : 'No calls, sales or activations were recorded in this month.'}
      </EmptyState>
    </div> : <>
      <Headline review={review} totals={totals} onOpenActivations={() => onNavigate('activations')} />

      <section className="review-figures" aria-label="This month in figures">
        <Figure label="CALLS" value={String(totals.calls)} tone="blue"
          note={totals.calls ? `${totals.customers} ${totals.customers === 1 ? 'customer' : 'customers'} · ${review.activeDays} ${review.activeDays === 1 ? 'day' : 'days'}` : 'none logged'}
          trend={comparable && <Trend {...change(totals.calls, previous.calls)} />} />
        <Figure label="REACHED A PERSON" value={percent(totals.contactRate)} tone="green"
          note={`${totals.reached} of ${totals.calls} calls`}
          trend={comparable && <Trend {...pointsChange(totals.contactRate, previous.contactRate)} />} />
        <Figure label="SALES" value={String(totals.sales)} tone="violet"
          note={totals.sales ? `${percent(review.conversionRate)} of conversations · ${rand(totals.salesValueCents)}${totals.unpricedSales ? ` · ${totals.unpricedSales} unpriced` : ''}` : 'none recorded'}
          trend={comparable && <Trend {...change(totals.sales, previous.sales)} />} />
        <Figure label="DAYS TO ACTIVATE" value={totals.daysToActivate === null ? '—' : totals.daysToActivate.toFixed(1)} tone="amber"
          note={totals.daysToActivate === null ? 'no activations to measure' : 'sale to completed activation'} />
      </section>

      <div className="review-columns">
        <Chart review={review} onOpenActivations={() => onNavigate('activations')} />

        <section className="review-card" aria-labelledby="review-rank-heading">
          <div className="review-card-head">
            <div>
              <span className="review-kicker">THE STRAIGHT ANSWER</span>
              <h2 id="review-rank-heading">Where you stand</h2>
            </div>
          </div>
          <div className="review-answers">
            <Answer label="CALLS → SALES"
              value={totals.reached ? percent(review.conversionRate) : '—'}
              compare={comparable && previous.reached ? `last month ${percent(previous.sales / Math.max(previous.reached, 1))}` : undefined}
              detail={`${totals.sales} sale${totals.sales === 1 ? '' : 's'} from ${totals.reached} conversation${totals.reached === 1 ? '' : 's'}`} />
            <Answer label="SALES → ACTIVATIONS"
              value={totals.activations + totals.declined ? percent(review.activationRate) : '—'}
              detail={totals.activations + totals.declined ? `${totals.activations} activated · ${totals.declined} declined` : 'nothing decided yet'} />
            <Answer label="CALLS A DAY"
              value={review.activeDays ? review.callsPerActiveDay.toFixed(1) : '—'}
              detail={review.activeDays ? `across ${review.activeDays} calling ${review.activeDays === 1 ? 'day' : 'days'}` : 'no calling days yet'} />
          </div>
          <div className="review-answer-foot">
            <span>COMPARED WITH {compareLabel(review).toUpperCase()}</span>
            <span>{review.rewards.paidCount ? `${rand(review.rewards.paidCents)} IN REFERRAL PAYMENTS` : 'NO REFERRAL PAYMENTS YET'}</span>
          </div>
        </section>
      </div>

      <section className="review-card review-money" aria-labelledby="review-money-heading">
        <div className="review-card-head">
          <div>
            <span className="review-kicker">MONEY AND THANK-YOUS</span>
            <h2 id="review-money-heading">Referral rewards</h2>
          </div>
          <button className="review-link" onClick={() => onNavigate('referrals')}>OPEN REFERRERS <ArrowRight size={14} /></button>
        </div>
        <div className="review-money-grid">
          <div><span>EARNED THIS MONTH</span><strong>{rand(review.rewards.earnedCents)}</strong><small>from this month's activations</small></div>
          <div className={review.rewards.dueCents ? 'is-due' : ''}><span>STILL TO PAY</span><strong>{rand(review.rewards.dueCents)}</strong><small>{review.rewards.dueCount ? `${review.rewards.dueCount} ready to pay` : 'nothing outstanding'}</small></div>
          <div><span>PAID THIS MONTH</span><strong>{rand(review.rewards.paidCents)}</strong><small>{review.rewards.paidCount ? `${review.rewards.paidCount} payment${review.rewards.paidCount === 1 ? '' : 's'} recorded` : 'no payments yet'}</small></div>
        </div>
      </section>

      <p className="review-footnote">
        {month.label.toUpperCase()}{month.isCurrent ? ` SO FAR · ${month.daysElapsed} OF ${month.days} DAYS` : ` · ${month.days} DAYS`} · EVERYTHING IS FROM THIS LOCAL WORKSPACE
      </p>
    </>}
  </>
}
