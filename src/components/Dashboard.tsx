import { useState } from 'react'
import { ArrowRight, CalendarClock, Check, CheckCheck, ClipboardPaste, Copy, Headphones, Layers3, ListFilter, RefreshCw, UsersRound } from 'lucide-react'
import { formatDate, formatListDate, relativeDue } from '../domain/dates'
import { createQueueIndex, readiness, type QueueItem } from '../domain/queue'
import type { Callback, Lead, View, Workspace } from '../domain/types'
import { EmptyState, Initials, Toggle } from './ui'

function formatCount(number: number) { return String(number).padStart(2, '0') }

function QuickPaste({ mode, onMode, onImport, onOpen }: { mode: 'replace' | 'append'; onMode: (mode: 'replace' | 'append') => void; onImport: (text: string) => void; onOpen: () => void }) {
  const [text, setText] = useState('')
  const take = (value: string) => { if (value.trim()) { setText(''); onImport(value) } }
  return <div className="quick-paste">
    <label className="quick-paste-field">
      <ClipboardPaste size={16} aria-hidden="true" />
      <span className="sr-only">Paste your lead list</span>
      <input
        value={text}
        spellCheck={false}
        placeholder="Paste your lead list — imports instantly"
        onChange={event => setText(event.target.value)}
        onPaste={event => { const pasted = event.clipboardData.getData('text/plain'); if (pasted) { event.preventDefault(); take(pasted) } }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); take(text) } }}
      />
    </label>
    <div className="paste-mode" role="group" aria-label="How to add pasted leads">
      <button className={mode === 'replace' ? 'is-on' : ''} aria-pressed={mode === 'replace'} onClick={() => onMode('replace')}>REPLACE</button>
      <button className={mode === 'append' ? 'is-on' : ''} aria-pressed={mode === 'append'} onClick={() => onMode('append')}>ADD</button>
    </div>
    <button className="quick-paste-review" onClick={onOpen}>Review first</button>
  </div>
}

export function Dashboard({ workspace, now, queue, lead, callback, importMode, onImportMode, onQuickImport, onCopy, onCycle, onNoAnswer, onNotInterested, onCallback, onSale, onNotes, onNavigate, onImport, onAutoCopy }: {
  workspace: Workspace; now: Date; queue: QueueItem[]; lead: Lead | undefined; callback: Callback | undefined;
  importMode: 'replace' | 'append'; onImportMode: (mode: 'replace' | 'append') => void; onQuickImport: (text: string) => void;
  onCopy: () => void; onCycle: (direction: 1 | -1) => void; onNoAnswer: () => void; onNotInterested: () => void; onCallback: () => void; onSale: () => void;
  onNotes: (notes: string) => void; onNavigate: (view: View) => void; onImport: () => void; onAutoCopy: (value: boolean) => void;
}) {
  const [rail, setRail] = useState<'callbacks' | 'pipeline' | 'activity'>('callbacks')
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
    <div className="desk-top">
      <div className="desk-title">
        <h1>Calling desk</h1>
        <p>{formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      <div className="stat-strip" aria-label="Workspace overview">
        <button className="stat stat-green" onClick={() => onNavigate('leads')}><UsersRound size={14} /><strong>{formatCount(queue.length)}</strong><span>READY</span></button>
        <button className="stat stat-blue" onClick={() => onNavigate('callbacks')}><CalendarClock size={14} /><strong>{formatCount(due)}</strong><span>DUE</span></button>
        <button className="stat stat-violet" onClick={() => onNavigate('pipeline')}><Layers3 size={14} /><strong>{formatCount(activeSales.length)}</strong><span>PIPELINE</span></button>
        <button className="stat stat-amber" onClick={() => onNavigate('activations')}><CheckCheck size={14} /><strong>{formatCount(activations.length)}</strong><span>ACTIVATED</span></button>
      </div>
    </div>

    <QuickPaste mode={importMode} onMode={onImportMode} onImport={onQuickImport} onOpen={onImport} />

    <div className="dashboard-columns">
      <section className="calling-section" aria-labelledby="calling-heading">
        <h2 id="calling-heading" className="sr-only">Next lead</h2>
        {lead ? <article className="lead-card">
          <div className="lead-card-top"><div className="lead-top-label"><span className={`light-dot ${isDue ? 'is-due' : ''}`} /> {isDue ? 'CALLBACK DUE' : 'YOUR NEXT LEAD'} <span className="muted-slash">/</span> {rank >= 0 ? `${formatCount(rank + 1)} OF ${formatCount(queue.length)}` : 'MANUAL PICK'}</div><button className="skip-button" onClick={() => onCycle(1)} title="Next lead (→)">SKIP LEAD <ArrowRight size={15} /></button></div>
          <div className="lead-identity"><Initials name={lead.name} /><div className="lead-name-block"><h3>{lead.name}</h3><div className="lead-tags"><span>{lead.sourceStatus.toUpperCase()}</span><i /> <span>{isDue ? 'CALLBACK' : 'LEAD'}</span></div></div></div>
          <div className="account-box"><div><span className="field-caption">ACCOUNT NUMBER</span><strong>{lead.accountNumber}</strong></div><button className="copy-button" onClick={onCopy}><Copy size={15} /> <span>COPY</span></button></div>
          <div className="lead-meta"><div><span className="field-caption">CUSTOMER ID</span><strong>{lead.customerId || 'NOT PROVIDED'}</strong></div><div><span className="field-caption">LIST DATE</span><strong>{formatListDate(lead.listDate)}</strong></div><div><span className="field-caption">ATTEMPTS</span><strong>{formatCount(attempts)}</strong></div></div>
          {callback?.note && <div className="callback-note"><CalendarClock size={15} /><span><strong>CALLBACK NOTE</strong> {callback.note}</span></div>}
          <div className="lead-notes"><div className="light-section-label"><label htmlFor="lead-notes">CUSTOMER NOTES</label><span><Check size={12} /> AUTO-SAVED</span></div><textarea id="lead-notes" value={workspace.profiles[lead.accountNumber]?.notes ?? ''} onChange={event => onNotes(event.target.value)} placeholder="Add a note for next time..." rows={2} /></div>
          <div className="outcome-section"><div className="light-section-label"><span>LOG THE OUTCOME</span><span className="outcome-hint">AFTER YOUR CALL</span></div><div className="outcome-actions">
            <button className="outcome-no-answer" onClick={onNoAnswer}><span>No answer</span><kbd>N</kbd></button>
            <button className="outcome-not-interested" onClick={onNotInterested}><span>Not interested</span><kbd>X</kbd></button>
            <button className="outcome-callback" onClick={onCallback}><span>Callback</span><kbd>C</kbd></button>
            <button className="sale-action" onClick={onSale}><span>Made a sale</span><kbd>S</kbd></button>
          </div></div>
        </article> : <div className="lead-card lead-empty"><EmptyState title="Queue is clear." action={ageReview ? <button className="button button-primary" onClick={() => onNavigate('leads')}>Review {ageReview} lead{ageReview === 1 ? '' : 's'} <ArrowRight size={15} /></button> : <button className="button button-primary" onClick={onImport}>Import leads <ArrowRight size={15} /></button>}>
          {ageReview ? 'Some leads need an age check first.' : workspace.leads.length || workspace.callbacks.length ? 'Nothing is ready right now. Callbacks and retries appear here when due.' : 'Paste a lead list to start calling.'}
        </EmptyState></div>}
        <div className="desk-footer"><label><span>AUTO-COPY NEXT ACCOUNT</span><Toggle checked={workspace.settings.autoCopy} onChange={onAutoCopy} label="Auto-copy next account" /></label><span className="desk-hint">{fresh} fresh · {retries} retries · ← → CYCLE</span></div>
      </section>

      <aside className="focus-column" aria-label="At a glance">
        <div className="rail-tabs" role="group" aria-label="At a glance sections">
          <button className={rail === 'callbacks' ? 'is-on' : ''} aria-pressed={rail === 'callbacks'} onClick={() => setRail('callbacks')}><span className="rail-tab-label">Follow-ups</span><span className="rail-tab-count">{formatCount(workspace.callbacks.length)}</span></button>
          <button className={rail === 'pipeline' ? 'is-on' : ''} aria-pressed={rail === 'pipeline'} onClick={() => setRail('pipeline')}><span className="rail-tab-label">Deals</span><span className="rail-tab-count">{formatCount(activeSales.length)}</span></button>
          <button className={rail === 'activity' ? 'is-on' : ''} aria-pressed={rail === 'activity'} onClick={() => setRail('activity')}><span className="rail-tab-label">Latest</span><span className="rail-tab-count">{formatCount(workspace.activity.length)}</span></button>
        </div>
        <div className="focus-panel">
          {rail === 'callbacks' && <>
            {scheduled.length ? <div className="focus-list">{scheduled.slice(0, 4).map(item => {
              const dueNow = new Date(item.dueAt).getTime() <= now.getTime()
              return <button className="focus-row" key={item.id} onClick={() => onNavigate('callbacks')}><Initials name={item.lead.name} /><span className="focus-person"><strong>{item.lead.name}</strong><small>{item.lead.accountNumber}</small></span><span className={`focus-time ${dueNow ? 'due' : ''}`}>{relativeDue(item.dueAt, now)}</span></button>
            })}</div> : <div className="focus-empty">No callbacks yet.</div>}
            {scheduled.length > 0 && <button className="panel-link" onClick={() => onNavigate('callbacks')}>ALL CALLBACKS <ArrowRight size={14} /></button>}
          </>}
          {rail === 'pipeline' && <>
            <div className="pipeline-lines">
              <div className="line-vetting"><span><i /> Credit vetting</span><strong>{formatCount(vetting)}</strong></div>
              <div className="line-confirm"><span><i /> Awaiting confirmation</span><strong>{formatCount(confirmation)}</strong></div>
              <div className="line-live"><span><i /> Activated</span><strong>{formatCount(activations.length)}</strong></div>
            </div>
            <p className="rail-note">{att} ATT · {activations.length - att} non-ATT activated all time.</p>
            <button className="panel-link" onClick={() => onNavigate('pipeline')}>SALES PIPELINE <ArrowRight size={14} /></button>
          </>}
          {rail === 'activity' && <>
            {workspace.activity.length ? <div className="rail-activity">{workspace.activity.slice(0, 5).map(item => <div className="activity-row" key={item.id}><div className="activity-icon">{item.description.includes('Activation') ? <CheckCheck size={15} /> : item.description.includes('Callback') ? <CalendarClock size={15} /> : item.description.includes('Sale') ? <Layers3 size={15} /> : <Headphones size={15} />}</div><strong>{item.name}</strong><span>{item.description}</span><time>{formatDate(item.at, { hour: '2-digit', minute: '2-digit', hour12: false })}</time></div>)}</div> : <div className="activity-empty"><ListFilter size={16} /> Your call activity will appear here.</div>}
          </>}
        </div>
        <div className="cycle-note"><div className="cycle-icon"><RefreshCw size={16} /></div><div><strong>Shortcuts</strong><p><kbd>N</kbd> no answer · <kbd>X</kbd> not interested · <kbd>C</kbd> callback · <kbd>S</kbd> sale · <kbd>V</kbd> copy · <kbd>←</kbd><kbd>→</kbd> cycle</p></div></div>
      </aside>
    </div>
  </>
}
