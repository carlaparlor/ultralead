import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarClock, Check, CheckCheck, Copy, Headphones, Layers3, ListFilter, MoveRight, RefreshCw, Shuffle, UsersRound } from 'lucide-react'
import { formatDate, formatListDate, relativeDue } from '../domain/dates'
import { createQueueIndex, readiness, type QueueItem } from '../domain/queue'
import type { Callback, Lead, View, Workspace } from '../domain/types'
import { EmptyState, Initials, Toggle } from './ui'

function formatCount(number: number) { return String(number).padStart(2, '0') }

function Metric({ label, value, detail, icon: Icon, accent }: { label: string; value: number; detail: string; icon: typeof UsersRound; accent?: boolean }) {
  return <div className={`metric ${accent ? 'metric-accent' : ''}`}>
    <div className="metric-top"><span>{label}</span><Icon size={16} strokeWidth={1.45} /></div>
    <div className="metric-value">{formatCount(value)}<span className="metric-period">.</span></div>
    <div className="metric-detail">{detail}</div>
  </div>
}

export function Dashboard({ workspace, now, queue, lead, callback, onCopy, onSkip, onNoAnswer, onNotInterested, onCallback, onSale, onNotes, onNavigate, onImport, onHelp, onAutoCopy }: {
  workspace: Workspace; now: Date; queue: QueueItem[]; lead: Lead | undefined; callback: Callback | undefined;
  onCopy: () => void; onSkip: () => void; onNoAnswer: () => void; onNotInterested: () => void; onCallback: () => void; onSale: () => void;
  onNotes: (notes: string) => void; onNavigate: (view: View) => void; onImport: () => void; onHelp: () => void; onAutoCopy: (value: boolean) => void;
}) {
  const queueIndex = createQueueIndex(workspace)
  const activeSales = workspace.sales.filter(sale => sale.stage === 'credit_vetting' || sale.stage === 'pending_confirmation')
  const vetting = activeSales.filter(sale => sale.stage === 'credit_vetting').length
  const confirmation = activeSales.filter(sale => sale.stage === 'pending_confirmation').length
  const activations = workspace.sales.filter(sale => sale.stage === 'activated')
  const att = activations.filter(sale => sale.activationType === 'ATT').length
  const due = workspace.callbacks.filter(item => new Date(item.dueAt).getTime() <= now.getTime()).length
  const dueInQueue = queue.filter(item => item.callback).length
  const retries = queue.filter(item => item.attemptsToday > 0 && !item.callback).length
  const fresh = queue.length - retries - dueInQueue
  const scheduled = [...workspace.callbacks].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  const ageReview = workspace.leads.filter(item => readiness(workspace, item, now, queueIndex) === 'age_review').length
  const rank = lead ? queue.findIndex(item => item.lead.accountNumber === lead.accountNumber) : -1
  const attempts = lead ? (workspace.profiles[lead.accountNumber]?.attempts.length ?? 0) : 0
  const isDue = !!callback && new Date(callback.dueAt).getTime() <= now.getTime()

  return <>
    <div className="page-heading dashboard-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" /> YOUR WORKSPACE <span className="slash">/</span> OVERVIEW</div><h1>Your calling desk<span className="heading-period">.</span></h1><p>Less admin. Better conversations. Let's get to work.</p></div>
      <div className="heading-aside"><span>YOUR DAILY OVERVIEW</span><strong>{formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div>
    </div>

    <div className="metrics-grid" aria-label="Workspace overview">
      <Metric label="READY TO CALL" value={queue.length} detail={`${Math.max(fresh, 0)} fresh · ${retries} retries`} icon={UsersRound} />
      <Metric label="CALLBACKS DUE" value={due} detail={`${workspace.callbacks.length} scheduled in total`} icon={CalendarClock} />
      <Metric label="IN THE PIPELINE" value={activeSales.length} detail={`${confirmation} awaiting confirmation`} icon={Layers3} />
      <Metric label="ACTIVATIONS" value={activations.length} detail={`${att} ATT · ${activations.length - att} non-ATT · all time`} icon={CheckCheck} accent />
    </div>

    <div className="dashboard-columns">
      <section className="calling-section" aria-labelledby="calling-heading">
        <div className="section-heading"><div><div className="eyebrow section-kicker">01 <span>/</span> THE CALLING DESK</div><h2 id="calling-heading">Next in line<span className="heading-period">.</span></h2></div><button className="smart-badge" onClick={onHelp}><Shuffle size={13} /> SMART CYCLING ON <span>↗</span></button></div>
        {lead ? <article className="lead-card">
          <div className="lead-card-top"><div className="lead-top-label"><span className="light-dot" /> {isDue ? 'CALLBACK DUE' : 'YOUR NEXT LEAD'} <span className="muted-slash">/</span> {rank >= 0 ? `${formatCount(rank + 1)} OF ${formatCount(queue.length)}` : 'MANUAL PICK'}</div><button className="skip-button" onClick={onSkip}>SKIP LEAD <ArrowRight size={15} /></button></div>
          <div className="lead-identity"><Initials name={lead.name} /><div className="lead-name-block"><h3>{lead.name}</h3><div className="lead-tags"><span>{lead.sourceStatus.toUpperCase()}</span><i /> <span>{isDue ? 'CALLBACK' : 'LEAD'}</span></div></div><ArrowUpRight className="lead-corner-arrow" size={20} strokeWidth={1.2} /></div>
          <div className="account-box"><div><span className="field-caption">ACCOUNT NUMBER</span><strong>{lead.accountNumber}</strong></div><button className="copy-button" onClick={onCopy}><Copy size={15} /> <span>COPY</span></button></div>
          <div className="lead-meta"><div><span className="field-caption">CUSTOMER ID</span><strong>{lead.customerId || 'NOT PROVIDED'}</strong></div><div><span className="field-caption">LIST DATE</span><strong>{formatListDate(lead.listDate)}</strong></div><div><span className="field-caption">TOTAL ATTEMPTS</span><strong>{formatCount(attempts)}</strong></div></div>
          {callback?.note && <div className="callback-note"><CalendarClock size={15} /><span><strong>CALLBACK NOTE</strong> {callback.note}</span></div>}
          <div className="lead-notes"><div className="light-section-label"><label htmlFor="lead-notes">CUSTOMER NOTES</label><span><Check size={12} /> AUTO-SAVED</span></div><textarea id="lead-notes" value={workspace.profiles[lead.accountNumber]?.notes ?? ''} onChange={event => onNotes(event.target.value)} placeholder="Add a note for next time..." rows={2} /></div>
          <div className="outcome-section"><div className="light-section-label"><span>LOG THE OUTCOME</span><span className="outcome-hint">AFTER YOUR CALL</span></div><div className="outcome-actions"><button onClick={onNoAnswer}><span>No answer</span><kbd>1</kbd></button><button onClick={onNotInterested}><span>Not interested</span><kbd>2</kbd></button><button onClick={onCallback}><span>Callback</span><kbd>3</kbd></button><button className="sale-action" onClick={onSale}><span>Made a sale</span><ArrowRight size={15} /></button></div></div>
        </article> : <div className="lead-card lead-empty"><EmptyState title="Your queue is clear." action={ageReview ? <button className="button button-dark" onClick={() => onNavigate('leads')}>Review {ageReview} lead{ageReview === 1 ? '' : 's'} <ArrowRight size={15} /></button> : <button className="button button-dark" onClick={onImport}>Import leads <ArrowRight size={15} /></button>}>
          {ageReview ? 'Some leads need an age check before they can be called.' : workspace.leads.length || workspace.callbacks.length ? 'There are no leads ready right now. Callbacks and spaced retries will appear here when due.' : 'Paste your lead list to build a smarter calling queue.'}
        </EmptyState></div>}
        <div className="desk-footer"><div><span className="footer-diamond">◇</span> <span>BUILT FOR YOUR NEXT CONVERSATION</span></div><label><span>AUTO-COPY NEXT ACCOUNT</span><Toggle checked={workspace.settings.autoCopy} onChange={onAutoCopy} label="Auto-copy next account" /></label></div>
      </section>

      <aside className="focus-column" aria-label="Today's focus">
        <div className="section-heading side-section-heading"><div><div className="eyebrow section-kicker">02 <span>/</span> AT A GLANCE</div><h2>Today's focus<span className="heading-period">.</span></h2></div></div>
        <div className="focus-panel">
          <div className="panel-heading"><div><span className="panel-icon"><CalendarClock size={15} /></span><span>CALLBACK QUEUE</span></div><button onClick={() => onNavigate('callbacks')} aria-label="View all callbacks"><ArrowUpRight size={16} /></button></div>
          {scheduled.length ? <div className="focus-list">{scheduled.slice(0, 3).map(item => {
            const dueNow = new Date(item.dueAt).getTime() <= now.getTime()
            return <button className="focus-row" key={item.id} onClick={() => onNavigate('callbacks')}><Initials name={item.lead.name} /><span className="focus-person"><strong>{item.lead.name}</strong><small>{item.lead.accountNumber}</small></span><span className={`focus-time ${dueNow ? 'due' : ''}`}>{relativeDue(item.dueAt, now)}</span></button>
          })}</div> : <div className="focus-empty">No callbacks scheduled yet.</div>}
          <button className="panel-link" onClick={() => onNavigate('callbacks')}>VIEW ALL CALLBACKS <ArrowRight size={14} /></button>
          <div className="panel-divider" />
          <div className="panel-heading pipeline-heading"><div><span className="panel-icon"><Layers3 size={15} /></span><span>SALES IN MOTION</span></div><button onClick={() => onNavigate('pipeline')} aria-label="View sales pipeline"><ArrowUpRight size={16} /></button></div>
          <div className="pipeline-lines"><div><span><i /> Credit vetting</span><strong>{formatCount(vetting)}</strong></div><div><span><i /> Awaiting confirmation</span><strong>{formatCount(confirmation)}</strong></div><div><span><i /> Activated</span><strong>{formatCount(activations.length)}</strong></div></div>
          <button className="panel-link" onClick={() => onNavigate('pipeline')}>VIEW PIPELINE <ArrowRight size={14} /></button>
        </div>
        <div className="cycle-note"><div className="cycle-icon"><RefreshCw size={16} /></div><div><strong>A smarter way through.</strong><p>Fresh leads first, callbacks on time, and breathing room between retries.</p><button onClick={onHelp}>HOW CYCLING WORKS <MoveRight size={14} /></button></div></div>
      </aside>
    </div>

    <section className="activity-section" aria-labelledby="activity-heading"><div className="activity-heading"><div><div className="eyebrow section-kicker">03 <span>/</span> THE LATEST</div><h2 id="activity-heading">Recent activity<span className="heading-period">.</span></h2></div><span>YOUR WORK, AT A GLANCE <ArrowDownLeft size={14} /></span></div>
      {workspace.activity.length ? <div className="activity-list">{workspace.activity.slice(0, 4).map((item, index) => <div className="activity-row" key={item.id}><span className="activity-index">{formatCount(index + 1)}</span><div className="activity-icon">{item.description.includes('Activation') ? <CheckCheck size={15} /> : item.description.includes('Callback') ? <CalendarClock size={15} /> : item.description.includes('Sale') ? <Layers3 size={15} /> : <Headphones size={15} />}</div><strong>{item.name}</strong><span>{item.description}</span><time>{formatDate(item.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</time><ArrowUpRight size={14} /></div>)}</div> : <div className="activity-empty"><ListFilter size={16} /> Your call activity will appear here.</div>}
    </section>
  </>
}
