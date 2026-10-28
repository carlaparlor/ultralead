import { useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { analyse, change, pointsChange, RANGE_LABELS, type AnalysisRange } from '../domain/analytics'
import { formatDate } from '../domain/dates'
import type { Workspace } from '../domain/types'
import { EmptyState } from './ui'

const percent = (value: number) => `${Math.round(value * 100)}%`

function Trend({ direction, text }: { direction: 'up' | 'down' | 'flat'; text: string }) {
  if (direction === 'flat') return <span className="trend trend-flat">{text}</span>
  return <span className={`trend trend-${direction}`}>
    {direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{text}
  </span>
}

function Stat({ label, value, detail, trend, tone }: { label: string; value: string; detail?: string; trend?: React.ReactNode; tone?: string }) {
  return <div className={`insight-stat ${tone ? `insight-${tone}` : ''}`}>
    <span className="insight-stat-label">{label}</span>
    <strong>{value}</strong>
    {detail && <span className="insight-stat-detail">{detail}</span>}
    {trend && <span className="insight-stat-trend">{trend}</span>}
  </div>
}

export function InsightsView({ workspace, now }: { workspace: Workspace; now: Date }) {
  const [range, setRange] = useState<AnalysisRange>('week')
  const analysis = analyse(workspace, range, now)
  const { calls, funnel, att, series, previous } = analysis
  const peak = Math.max(1, ...series.map(point => point.attempts))
  const activationTotal = att.att + att.nonAtt
  const bestPackage = analysis.packages[0]

  return <>
    <div className="page-heading view-heading"><h1>Insights</h1><span className="heading-note">{analysis.from ? `from ${formatDate(analysis.from, { day: 'numeric', month: 'short' })}` : 'all time'}</span></div>

    <div className="range-switch" role="group" aria-label="Analysis period">
      {(Object.keys(RANGE_LABELS) as AnalysisRange[]).map(key => <button key={key} className={range === key ? 'is-on' : ''} aria-pressed={range === key} onClick={() => setRange(key)}>{RANGE_LABELS[key]}</button>)}
    </div>

    {!analysis.hasActivity ? <div className="table-empty"><EmptyState title="Nothing to analyse yet.">Log a few calls and this page fills in.</EmptyState></div> : <>
      <div className="insight-stats">
        <Stat label="CALLS LOGGED" value={String(calls.attempts)} detail={`${calls.customers} customer${calls.customers === 1 ? '' : 's'}`} tone="blue"
          trend={previous && <Trend {...change(calls.attempts, previous.calls)} />} />
        <Stat label="CONTACT RATE" value={percent(analysis.contactRate)} detail={`${analysis.answered} of ${calls.attempts} reached a person`} tone="green"
          trend={previous && <Trend {...pointsChange(analysis.contactRate, previous.contactRate)} />} />
        <Stat label="SALES" value={String(analysis.salesRecorded)} detail={`${percent(analysis.conversionRate)} of conversations`} tone="violet"
          trend={previous && <Trend {...change(analysis.salesRecorded, previous.sales)} />} />
        <Stat label="ACTIVATIONS" value={String(analysis.activations)} detail={activationTotal ? `${att.att} ATT · ${att.nonAtt} non-ATT` : 'none completed in this period'} tone="amber"
          trend={previous && <Trend {...change(analysis.activations, previous.activations)} />} />
        <Stat label="AVG. DAYS TO ACTIVATE" value={analysis.daysToActivate === null ? '—' : analysis.daysToActivate.toFixed(1)} detail={analysis.daysToActivate === null ? 'no activations yet' : 'sale to confirmed activation'} />
      </div>

      <section className="insight-section" aria-labelledby="calls-chart-heading">
        <div className="section-heading"><div><h2 id="calls-chart-heading">Calls and outcomes</h2><p className="section-sub">{analysis.bucketLabel} · peak {peak}</p></div>
          <div className="chart-legend"><span><i className="legend-sale" /> Sale</span><span><i className="legend-callback" /> Callback</span><span><i className="legend-not-interested" /> Not interested</span><span><i className="legend-no-answer" /> No answer</span></div>
        </div>
        <div className="chart" role="img" aria-label={`Calls logged per ${analysis.bucketLabel.toLowerCase()}: ${series.map(point => `${point.label} ${point.attempts}`).join(', ')}`}>
          {series.map(point => <div className="chart-column" key={point.key} title={`${point.label}: ${point.attempts} call${point.attempts === 1 ? '' : 's'}`}>
            <div className="chart-bar-area">
              <div className="chart-bar" style={{ height: `${Math.max(point.attempts ? 4 : 0, (point.attempts / peak) * 100)}%` }}>
                {point.sale > 0 && <span className="bar-sale" style={{ flex: point.sale }} />}
                {point.callback > 0 && <span className="bar-callback" style={{ flex: point.callback }} />}
                {point.notInterested > 0 && <span className="bar-not-interested" style={{ flex: point.notInterested }} />}
                {point.noAnswer > 0 && <span className="bar-no-answer" style={{ flex: point.noAnswer }} />}
              </div>
            </div>
            <span className="chart-label">{series.length > 12 ? point.label.split(' ')[0] : point.label}</span>
          </div>)}
        </div>
      </section>

      <div className="insight-columns">
        <section className="insight-section" aria-labelledby="funnel-heading">
          <div className="section-heading"><div><h2 id="funnel-heading">Sales funnel</h2></div></div>
          <div className="funnel">
            <div className="funnel-body">
              {funnel.steps.map((step, index) => <div className="funnel-step" key={step.label}>
                <div className="funnel-meta"><span>{String(index + 1).padStart(2, '0')} {step.label}</span><strong>{step.value}</strong></div>
                <div className="funnel-track"><span className={`funnel-fill funnel-${index}`} style={{ width: `${Math.max(step.value ? 3 : 0, step.share * 100)}%` }} /></div>
                <span className="funnel-share">{percent(step.share)} of recorded</span>
              </div>)}
            </div>
            <div className="funnel-foot">
              <div><span>ACTIVATION RATE</span><strong>{funnel.activated + funnel.declined ? percent(funnel.activationRate) : '—'}</strong></div>
              <div><span>DECLINED</span><strong>{funnel.declined}</strong></div>
              <div><span>STILL OPEN</span><strong>{funnel.inVetting + funnel.awaitingConfirmation}</strong></div>
            </div>
          </div>
        </section>

        <section className="insight-section" aria-labelledby="mix-heading">
          <div className="section-heading"><div><h2 id="mix-heading">ATT vs non-ATT</h2></div></div>
          {activationTotal ? <>
            <div className="split-bar" role="img" aria-label={`${att.att} ATT and ${att.nonAtt} non-ATT activations`}>
              <span className="split-att" style={{ flex: att.att || 0.0001 }} />
              <span className="split-nonatt" style={{ flex: att.nonAtt || 0.0001 }} />
            </div>
            <div className="split-legend"><span><i className="split-dot split-att-dot" /><strong>{att.att}</strong> ATT · {percent(att.att / activationTotal)}</span><span><i className="split-dot split-nonatt-dot" /><strong>{att.nonAtt}</strong> non-ATT · {percent(att.nonAtt / activationTotal)}</span></div>
          </> : <div className="insight-empty">No activations in this period yet.</div>}
          <div className="packages-table">
            <div className="form-label">PACKAGES SOLD <span>{analysis.packages.length} IN PERIOD</span></div>
            {analysis.packages.length ? analysis.packages.slice(0, 6).map(item => <div className="package-row" key={item.name}>
              <span className="package-name">{item.name}</span>
              <span className="package-bar"><i style={{ width: `${(item.sales / (bestPackage?.sales || 1)) * 100}%` }} /></span>
              <span className="package-numbers">{item.sales} sold · {item.activated} activated</span>
            </div>) : <div className="insight-empty">No sales recorded in this period.</div>}
          </div>
        </section>
      </div>

    </>}
  </>
}
