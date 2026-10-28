import { useMemo } from 'react'
import { ArrowRight, ClipboardPaste, Info } from 'lucide-react'
import { exclusionLabel, parseLeads, type ImportPreview } from '../domain/import'
import { Modal } from './ui'

const example = 'Nomsa Example\t\tProspect\tConsumer\t5-12345678901234\t9005120000000\t2026-10-28\nAlex Example\t\tActive\tConsumer\t5-12345678901235\t8507210000000\t2026-10-28'

export function ImportModal({ now, isDemo, text, onText, mode, onMode, onClose, onImport }: {
  now: Date; isDemo: boolean; text: string; onText: (text: string) => void; mode: 'replace' | 'append'; onMode: (mode: 'replace' | 'append') => void;
  onClose: () => void; onImport: (preview: ImportPreview, mode: 'replace' | 'append') => void;
}) {
  const preview = useMemo(() => parseLeads(text, now), [text, now])
  const canImport = preview.leads.length + preview.excluded.length > 0
  const submit = () => { if (canImport) onImport(preview, mode) }
  const reasons = [...new Set(preview.excluded.map(item => exclusionLabel(item.reason)))].join(', ')
  return <Modal title="Bring in your leads." eyebrow="YOUR DAILY LIST / IMPORT" onClose={onClose} wide>
    <form className="modal-body" onSubmit={event => { event.preventDefault(); submit() }}>
      <p className="modal-intro">Paste the rows from your system. We'll find the account numbers and take care of the rest.</p>
      <label className="form-label" htmlFor="lead-paste">PASTE YOUR LEAD LIST <span>ONE CUSTOMER PER LINE</span></label>
      <div className="paste-wrap"><textarea id="lead-paste" data-autofocus value={text} onChange={event => onText(event.target.value)} onPaste={event => { const pasted = event.clipboardData.getData('text/plain'); if (pasted && !text) { event.preventDefault(); onText(pasted) } }} placeholder={example} spellCheck={false} /><ClipboardPaste size={17} /></div>
      <div className="input-help">Tabs or spaces are fine. Each row needs a name and a <strong>5-</strong> account number. Press <strong>Ctrl/⌘ + Enter</strong> to import.</div>
      {preview.totalRows > 0 && <div className="import-preview" aria-live="polite"><div><strong>{preview.leads.length}</strong><span>LEADS KEPT</span></div><div><strong>{preview.excluded.length}</strong><span>FILTERED OUT</span></div><div><strong>{preview.needsAgeReview}</strong><span>AGE REVIEW</span></div><div><strong>{preview.duplicates}</strong><span>DUPLICATES</span></div></div>}
      {preview.excluded.length > 0 && <div className="import-message"><Info size={15} /><span>Filtered from calling: {reasons}. Matching callbacks are removed; sales history stays.</span></div>}
      {preview.needsAgeReview > 0 && <div className="import-message warning-message"><Info size={15} /><span>{preview.needsAgeReview} lead{preview.needsAgeReview === 1 ? '' : 's'} without a readable date of birth will be held for age review, not called automatically.</span></div>}
      {preview.invalidRows.length > 0 && <div className="import-message warning-message"><Info size={15} /><span>{preview.invalidRows.length} row{preview.invalidRows.length === 1 ? '' : 's'} could not be read: {preview.invalidRows.slice(0, 3).map(row => `line ${row.line} (${row.reason.replace(/\.$/, '')})`).join(', ')}{preview.invalidRows.length > 3 ? '…' : ''}.</span></div>}
      <fieldset className="import-mode"><legend className="form-label">HOW SHOULD WE ADD THESE? <span>REMEMBERED NEXT TIME</span></legend><label className={`radio-card ${mode === 'replace' ? 'selected' : ''}`}><input type="radio" name="import-mode" value="replace" checked={mode === 'replace'} onChange={() => onMode('replace')} /><span><strong>Replace today's lead list</strong><small>Start fresh. Callbacks, sales and notes are kept.</small></span></label><label className={`radio-card ${mode === 'append' ? 'selected' : ''}`}><input type="radio" name="import-mode" value="append" checked={mode === 'append'} onChange={() => onMode('append')} /><span><strong>Add to current list</strong><small>Existing account numbers are updated, not duplicated.</small></span></label></fieldset>
      {isDemo && <div className="demo-import-note">Sample data will be cleared when you import your own list.</div>}
      <div className="modal-footer"><button type="button" className="button button-outline" onClick={onClose}>CANCEL</button><button type="submit" className="button button-primary" disabled={!canImport}>IMPORT LEADS <ArrowRight size={15} /></button></div>
    </form>
  </Modal>
}
