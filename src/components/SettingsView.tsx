import { useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { ClearCategory, Workspace } from '../domain/types'
import { Toggle } from './ui'

const categories: { id: ClearCategory; title: string; description: string }[] = [
  { id: 'leads', title: 'Lead list', description: 'Remove the current daily list. Callbacks, sales and notes stay.' },
  { id: 'callbacks', title: 'Callbacks', description: 'Remove scheduled callbacks only. Leads and sales stay.' },
  { id: 'pipeline', title: 'Sales pipeline', description: 'Remove vetting, pending and declined sales. Activations stay.' },
  { id: 'activations', title: 'Activations', description: 'Remove completed activations. Referral payment history stays.' },
  { id: 'referrals', title: 'Referrals & payment history', description: 'Remove all referrals, referrers and payment records. Sales stay.' },
  { id: 'history', title: 'Customer notes & call history', description: 'Remove notes, attempts and do-not-call flags. Other records stay.' },
]

export function SettingsView({ workspace, onAutoCopy, onAddPackage, onRemovePackage, onClear, onExport, onRestore, lockOnStartup, onToggleLockOnStartup, unlockCodeConfigured, onSetUnlockCode, onChangeUnlockCode, onRemoveUnlockCode, onLockDeskNow }: {
  workspace: Workspace; onAutoCopy: (value: boolean) => void; onAddPackage: (name: string) => void; onRemovePackage: (name: string) => void;
  onClear: (category: ClearCategory) => void; onExport: () => void; onRestore: (file: File) => void;
  lockOnStartup: boolean; onToggleLockOnStartup: () => void; unlockCodeConfigured: boolean;
  onSetUnlockCode: (code: string) => void; onChangeUnlockCode: (current: string, next: string) => void; onRemoveUnlockCode: (current: string) => void; onLockDeskNow: () => void;
}) {
  const [packageName, setPackageName] = useState('')
  const [setCode, setSetCode] = useState({ next: '', confirm: '' })
  const [changeCode, setChangeCode] = useState({ current: '', next: '', confirm: '' })
  const [removeCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const counts: Record<ClearCategory, number> = {
    leads: workspace.leads.length, callbacks: workspace.callbacks.length,
    pipeline: workspace.sales.filter(sale => sale.stage !== 'activated').length,
    activations: workspace.sales.filter(sale => sale.stage === 'activated').length,
    referrals: workspace.referrals.length + workspace.referrers.length,
    history: Object.keys(workspace.profiles).length,
  }
  return (
    <>
      <div className="page-heading view-heading"><h1>Data &amp; settings</h1></div>
      <div className="settings-grid"><div className="settings-main">
        <section className="settings-section"><div className="settings-title"><div><h2>Preferences</h2></div></div><div className="settings-card"><div className="settings-row"><div><strong>Auto-copy next account</strong><p>Copy the next account number when you log an outcome or skip a lead. Browser permission may be required.</p></div><Toggle checked={workspace.settings.autoCopy} onChange={onAutoCopy} label="Auto-copy next account" /></div></div></section>
        <section className="settings-section"><div className="settings-title"><div><h2>Desk lock</h2></div></div><div className="settings-card"><div className="settings-row"><div><strong>Lock desk when the app opens</strong><p>Anyone opening ultralead+ needs your fingerprint or unlock code before they can reach your leads, notes or sales.</p></div><Toggle checked={lockOnStartup} onChange={onToggleLockOnStartup} label="Lock desk when the app opens" /></div>
        {unlockCodeConfigured ? (
          <>
            <div className="settings-row"><div><strong>Unlock code</strong><p>An unlock code is set. Change it below, or remove it to stop locking the desk.</p></div></div>
            <form className="package-form" onSubmit={event => { event.preventDefault(); setCodeError(''); if (changeCode.next !== changeCode.confirm) { setCodeError('The two new codes do not match.'); return } if (!changeCode.next.trim()) { setCodeError('Enter a code.'); return } onChangeUnlockCode(changeCode.current, changeCode.next) }}>
              <input className="form-input" value={changeCode.current} onChange={event => setChangeCode({ ...changeCode, current: event.target.value })} placeholder="Current unlock code" maxLength={120} />
              <input className="form-input" value={changeCode.next} onChange={event => setChangeCode({ ...changeCode, next: event.target.value })} placeholder="New unlock code" maxLength={120} />
              <input className="form-input" value={changeCode.confirm} onChange={event => setChangeCode({ ...changeCode, confirm: event.target.value })} placeholder="Confirm new unlock code" maxLength={120} />
              <button className="button button-primary" type="submit" disabled={!changeCode.current.trim() || !changeCode.next.trim() || changeCode.next !== changeCode.confirm}>CHANGE CODE</button>
            </form>
            {codeError && <p className="form-error">{codeError}</p>}
            <button className="button button-danger" onClick={() => { setCodeError(''); if (!removeCode.trim()) { setCodeError('Enter the current code to remove it.'); return } onRemoveUnlockCode(removeCode) }} disabled={lockOnStartup || !removeCode.trim()}>REMOVE UNLOCK CODE</button>
            <p className="settings-footnote">Removing the code also turns off locking the desk when the app opens.</p>
          </>
        ) : (
          <>
            <div className="settings-row"><div><strong>Unlock code</strong><p>No code is set yet. Set one to lock the desk with your fingerprint reader or the unlock code.</p></div></div>
            <form className="package-form" onSubmit={event => { event.preventDefault(); setCodeError(''); if (setCode.next !== setCode.confirm) { setCodeError('The two codes do not match.'); return } if (!setCode.next.trim()) { setCodeError('Enter a code.'); return } onSetUnlockCode(setCode.next) }}>
              <input className="form-input" value={setCode.next} onChange={event => setSetCode({ ...setCode, next: event.target.value })} placeholder="New unlock code" maxLength={120} />
              <input className="form-input" value={setCode.confirm} onChange={event => setSetCode({ ...setCode, confirm: event.target.value })} placeholder="Confirm unlock code" maxLength={120} />
              <button className="button button-primary" type="submit" disabled={!setCode.next.trim() || setCode.next !== setCode.confirm}>SET CODE</button>
            </form>
            {codeError && <p className="form-error">{codeError}</p>}
          </>
        )}
        <button className="button button-primary full-button" onClick={onLockDeskNow} disabled={!unlockCodeConfigured}>LOCK DESK NOW</button>
        <div className="settings-footnote">Fingerprint: scan your USB fingerprint reader when it is set up on this device. Until then — and always as a fallback — the unlock code is the way in.</div>
        </div></section>
        <section className="settings-section"><div className="settings-title"><div><h2>Packages</h2><p>Suggestions only — any package can be typed when recording a sale.</p></div></div><div className="settings-card package-card"><form onSubmit={event => { event.preventDefault(); if (packageName.trim()) { onAddPackage(packageName); setPackageName('') } }} className="package-form"><label className="sr-only" htmlFor="package-name">Add a package</label><input id="package-name" value={packageName} onChange={event => setPackageName(event.target.value)} maxLength={120} placeholder="Add a package name" /><button className="button button-primary" type="submit" disabled={!packageName.trim()}><Plus size={15} /> ADD</button></form>{workspace.packages.length ? <div className="package-list">{workspace.packages.map(name => <div key={name}><span>{name}</span><button className="icon-button row-delete" onClick={() => onRemovePackage(name)} aria-label={`Remove package suggestion ${name}`}><Trash2 size={15} /></button></div>)}</div> : <div className="settings-empty">No package suggestions yet.</div>}<div className="settings-footnote">Removing a suggestion never changes an existing sale.</div></div></section>
        <section className="settings-section"><div className="settings-title"><div><h2>Clear data</h2><p>Each category is separate.</p></div></div><div className="settings-card">{categories.map(item => <div className="settings-row data-row" key={item.id}><div><strong>{item.title} <span className="data-count">{String(counts[item.id]).padStart(2, '0')}</span></strong><p>{item.description}</p></div><button className="button button-outline button-small" onClick={() => onClear(item.id)} disabled={!counts[item.id]}>CLEAR</button></div>)}</div></section>
      </div><aside className="settings-side" aria-label="Privacy and backups"><div className="privacy-card"><ShieldCheck size={21} strokeWidth={1.5} /><h3>Backups</h3><p>Data lives in this browser only. Clearing site data erases it, so export a backup regularly.</p><div className="privacy-line" /><button className="button button-primary full-button" onClick={onExport}><ArrowDownToLine size={16} /> EXPORT BACKUP</button><button className="button button-outline full-button" onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={16} /> RESTORE BACKUP</button><input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose backup file" onChange={event => { const file = event.target.files?.[0]; if (file) onRestore(file); event.target.value = '' }} /><small>BACKUPS CONTAIN CUSTOMER AND REFERRAL DATA — STORE THEM SECURELY.</small></div></aside></div>
    </>
  )
}
