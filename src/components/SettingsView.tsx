import { useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { ClearCategory, Workspace } from '../domain/types'
import { Toggle } from './ui'

const categories: { id: ClearCategory; title: string; description: string }[] = [
  { id: 'leads', title: 'Lead list', description: 'Remove the current daily list. Callbacks, sales and notes stay.' },
  { id: 'callbacks', title: 'Callbacks', description: 'Remove scheduled callbacks only. Leads and sales stay.' },
  { id: 'pipeline', title: 'Sales pipeline', description: 'Remove vetting, pending and declined sales. Activations stay.' },
  { id: 'activations', title: 'Activations', description: 'Remove completed activations only. Pipeline sales stay.' },
  { id: 'history', title: 'Customer notes & call history', description: 'Remove notes, attempts and do-not-call flags. Other records stay.' },
]

export function SettingsView({ workspace, onAutoCopy, onAddPackage, onRemovePackage, onClear, onExport, onRestore }: {
  workspace: Workspace; onAutoCopy: (value: boolean) => void; onAddPackage: (name: string) => void; onRemovePackage: (name: string) => void;
  onClear: (category: ClearCategory) => void; onExport: () => void; onRestore: (file: File) => void;
}) {
  const [packageName, setPackageName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const counts: Record<ClearCategory, number> = {
    leads: workspace.leads.length, callbacks: workspace.callbacks.length,
    pipeline: workspace.sales.filter(sale => sale.stage !== 'activated').length,
    activations: workspace.sales.filter(sale => sale.stage === 'activated').length,
    history: Object.keys(workspace.profiles).length,
  }
  return <>
    <div className="page-heading view-heading"><h1>Data &amp; settings</h1></div>
    <div className="settings-grid"><div className="settings-main">
      <section className="settings-section"><div className="settings-title"><div><h2>Preferences</h2></div></div><div className="settings-card"><div className="settings-row"><div><strong>Auto-copy next account</strong><p>Copy the next 5- number when you log an outcome or skip a lead. Browser permission may be required.</p></div><Toggle checked={workspace.settings.autoCopy} onChange={onAutoCopy} label="Auto-copy next account" /></div></div></section>
      <section className="settings-section"><div className="settings-title"><div><h2>Packages</h2><p>Suggestions only — any package can be typed when recording a sale.</p></div></div><div className="settings-card package-card"><form onSubmit={event => { event.preventDefault(); if (packageName.trim()) { onAddPackage(packageName); setPackageName('') } }} className="package-form"><label className="sr-only" htmlFor="package-name">Add a package</label><input id="package-name" value={packageName} onChange={event => setPackageName(event.target.value)} maxLength={120} placeholder="Add a package name" /><button className="button button-primary" type="submit" disabled={!packageName.trim()}><Plus size={15} /> ADD</button></form>{workspace.packages.length ? <div className="package-list">{workspace.packages.map(name => <div key={name}><span>{name}</span><button className="icon-button row-delete" onClick={() => onRemovePackage(name)} aria-label={`Remove package suggestion ${name}`}><Trash2 size={15} /></button></div>)}</div> : <div className="settings-empty">No package suggestions yet.</div>}<div className="settings-footnote">Removing a suggestion never changes an existing sale.</div></div></section>
      <section className="settings-section"><div className="settings-title"><div><h2>Clear data</h2><p>Each category is separate.</p></div></div><div className="settings-card">{categories.map(item => <div className="settings-row data-row" key={item.id}><div><strong>{item.title} <span className="data-count">{String(counts[item.id]).padStart(2, '0')}</span></strong><p>{item.description}</p></div><button className="button button-outline button-small" onClick={() => onClear(item.id)} disabled={!counts[item.id]}>CLEAR</button></div>)}</div></section>
    </div><aside className="settings-side" aria-label="Privacy and backups"><div className="privacy-card"><ShieldCheck size={21} strokeWidth={1.5} /><h3>Backups</h3><p>Data is saved only on this device, not to an account. Export a backup regularly before removing the app or clearing local data.</p><div className="privacy-line" /><button className="button button-primary full-button" onClick={onExport}><ArrowDownToLine size={16} /> EXPORT BACKUP</button><button className="button button-outline full-button" onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={16} /> RESTORE BACKUP</button><input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose backup file" onChange={event => { const file = event.target.files?.[0]; if (file) onRestore(file); event.target.value = '' }} /><small>BACKUPS CONTAIN CUSTOMER DATA — STORE THEM SECURELY.</small></div></aside></div>
  </>
}
