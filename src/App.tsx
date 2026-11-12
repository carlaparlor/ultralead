import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CircleHelp, Menu, Upload, X } from 'lucide-react'
import { Dashboard } from './components/Dashboard'
import { Sidebar } from './components/Sidebar'
import { LeadsView } from './components/LeadsView'
import { CallbacksView } from './components/CallbacksView'
import { PipelineView } from './components/PipelineView'
import { ActivationsView } from './components/ActivationsView'
import { SettingsView } from './components/SettingsView'
import { InsightsView } from './components/InsightsView'
import { ReferralsView } from './components/ReferralsView'
import { PaymentHistoryModal, ReferralModal, ReferrerModal, type ReferralFormValues } from './components/ReferralModals'
import { ImportModal } from './components/ImportModal'
import { CustomerModal } from './components/CustomerModal'
import { ActivationModal, CallbackModal, HelpModal, SaleModal } from './components/OutcomeModals'
import { Modal } from './components/ui'
import { copyText } from './domain/clipboard'
import { localDayKey } from './domain/dates'
import { parseLeads, type ImportPreview } from './domain/import'
import { formatRand } from './domain/money'
import { activePayment, addReferralToLeads, addReferrer, editReferrer, markReferralPaid, removeReferral, removeReferrer, saveReferral, voidReferralPayment, type ReferralState } from './domain/referrals'
import { findLead, getSmartQueue, readiness } from './domain/queue'
import { parseBackup } from './domain/storage'
import { applyImport, clearCategory, createEmptyWorkspace, editSale, findCustomerLead, pruneExcluded, recordNoAnswer, recordNotInterested, recordSale, removeCallback, removeLead, removeSale, resetToQueue, saveCallback, saveNotes, updateSaleStage, verifyAge } from './domain/workspace'
import type { Callback, ClearCategory, Lead, Referral, Referrer, Sale, SaleStage, View, Workspace } from './domain/types'
import { useWorkspace } from './hooks/useWorkspace'

type ModalState =
  | { type: 'import' }
  | { type: 'callback'; lead: Lead; existing?: Callback; recordCall: boolean }
  | { type: 'sale'; lead: Lead; sale?: Sale }
  | { type: 'activation'; sale: Sale }
  | { type: 'referral'; referral?: Referral }
  | { type: 'referrer'; referrer: Referrer }
  | { type: 'referral-history'; referralId: string }
  | { type: 'customer'; account: string }
  | { type: 'help' }
  | { type: 'confirm'; title: string; description: string; confirmLabel: string; action: () => void; danger?: boolean }
  | null

const sameSaleDetails = (a: Sale, b: Sale) => a.updatedAt === b.updatedAt && a.stage === b.stage
  && a.packageName === b.packageName && a.packagePriceCents === b.packagePriceCents
  && a.activationType === b.activationType && a.activatedAt === b.activatedAt

const IMPORT_MODE_KEY = 'ultralead-plus.import-mode'
const readImportMode = (): 'replace' | 'append' => {
  try { return window.localStorage.getItem(IMPORT_MODE_KEY) === 'append' ? 'append' : 'replace' } catch { return 'replace' }
}

const viewNames: Record<View, string> = { overview: 'OVERVIEW', leads: 'ALL LEADS', callbacks: 'CALLBACKS', pipeline: 'SALES PIPELINE', activations: 'ACTIVATIONS', referrals: 'REFERRALS', insights: 'INSIGHTS', settings: 'DATA & SETTINGS' }
const clearDescriptions: Record<ClearCategory, { title: string; description: string }> = {
  leads: { title: 'Clear the lead list?', description: 'This removes your current daily lead list only. Callbacks, sales, activations and customer notes will stay.' },
  callbacks: { title: 'Clear all callbacks?', description: 'This removes scheduled callbacks only. Your leads, sales, activations and customer notes will stay. Leads may return to the calling queue.' },
  pipeline: { title: 'Clear the sales pipeline?', description: 'This removes all sales in credit vetting, awaiting confirmation and declined. Completed activations and referral records will stay.' },
  activations: { title: 'Clear all activations?', description: 'This removes completed activations. Referral and payment records stay, but unpaid rewards will no longer be due and paid referrals will need review.' },
  referrals: { title: 'Clear all referrals?', description: 'This permanently removes all referrers, referrals and payment history. Sales, activations and leads stay. Payment history cannot be recovered without a backup.' },
  history: { title: 'Clear customer history?', description: 'This removes all customer notes, call attempts and not-interested flags. Leads, callbacks and sales stay, but previously suppressed leads may return to the queue.' },
}

export default function App() {
  const { workspace, setWorkspace, now, setNow, storageWarning, persistNow } = useWorkspace()
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const [view, setView] = useState<View>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [selection, setSelection] = useState<{ account: string; manual: boolean } | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState('')
  const [importMode, setImportMode] = useState<'replace' | 'append'>(readImportMode)
  const [importText, setImportText] = useState('')
  const [undoImport, setUndoImport] = useState<(() => void) | null>(null)
  const queue = useMemo(() => getSmartQueue(workspace, now), [workspace, now])
  const selectedIsQueued = selection && queue.some(item => item.lead.accountNumber === selection.account)
  const selectedLead = selection ? findLead(workspace, selection.account) : undefined
  const selectedReadiness = selectedLead ? readiness(workspace, selectedLead, now) : undefined
  // Manual selection can bypass timing, never exclusions, age review, do-not-call or sales.
  const manualIsSafe = selection?.manual && selectedReadiness && ['ready', 'callback_due', 'callback_scheduled', 'cooldown', 'daily_limit'].includes(selectedReadiness)
  const lead = selectedLead && (selectedIsQueued || manualIsSafe) ? selectedLead : queue[0]?.lead
  const callback = lead ? workspace.callbacks.find(item => item.lead.accountNumber === lead.accountNumber) : undefined

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), undoImport ? 12000 : 4200)
    return () => window.clearTimeout(timer)
  }, [toast, undoImport])

  useEffect(() => {
    if (!undoImport) return
    const timer = window.setTimeout(() => setUndoImport(null), 12000)
    return () => window.clearTimeout(timer)
  }, [undoImport])

  const notify = (message: string) => setToast(message)
  const rememberImportMode = (value: 'replace' | 'append') => {
    setImportMode(value)
    try { window.localStorage.setItem(IMPORT_MODE_KEY, value) } catch { /* the choice simply is not remembered */ }
  }
  const openImport = () => { setImportText(''); setModal({ type: 'import' }) }
  /** Paste-to-import: one step, with a short-lived undo of the whole import. */
  const quickImport = (text: string) => {
    const at = new Date()
    const preview = parseLeads(text, at)
    if (!preview.leads.length && !preview.excluded.length) {
      notify('That paste had no lead rows. Each row needs a name and a 5- account number.')
      return
    }
    const before = workspaceRef.current
    const next = applyImport(before, preview, importMode, at)
    const filtered = preview.excluded.length ? `, ${preview.excluded.length} filtered out` : ''
    advanceAfter(next, `${preview.leads.length} lead${preview.leads.length === 1 ? '' : 's'} imported${filtered}.`)
    // Set after advancing: any later call outcome clears the undo offer so it can never swallow newer work.
    setUndoImport(() => () => {
      setWorkspace(before)
      setSelection(null)
      setUndoImport(null)
      notify('Import undone. Everything is back the way it was.')
    })
  }
  const quickImportRef = useRef(quickImport)
  quickImportRef.current = quickImport
  const modalOpenRef = useRef(false)
  modalOpenRef.current = modal !== null
  const copyAccount = (account: string, success = 'Account number copied.') => {
    void copyText(account).then(() => notify(success)).catch(() => notify('Could not access clipboard. Select and copy the account number instead.'))
  }
  const selectLead = (selected: Lead) => {
    setSelection({ account: selected.accountNumber, manual: true })
    setView('overview')
    if (workspace.settings.autoCopy) copyAccount(selected.accountNumber, 'Account number copied. Ready when you are.')
  }
  const advanceAfter = (next: Workspace, message: string) => {
    setUndoImport(null)
    const currentTime = new Date()
    const first = getSmartQueue(next, currentTime)[0]?.lead
    setNow(currentTime)
    setWorkspace(next)
    setSelection(first ? { account: first.accountNumber, manual: false } : null)
    if (first && next.settings.autoCopy) copyAccount(first.accountNumber, `${message} Next account copied.`)
    else notify(message)
  }
  /** Arrow keys and the desk arrows walk the queue without logging an outcome. */
  const cycle = (direction: 1 | -1) => {
    if (!lead || queue.length < 2) { notify('There are no other leads ready right now.'); return }
    const index = queue.findIndex(item => item.lead.accountNumber === lead.accountNumber)
    const from = index < 0 ? 0 : index
    const next = queue[(from + direction + queue.length) % queue.length]?.lead
    if (!next || next.accountNumber === lead.accountNumber) { notify('There are no other leads ready right now.'); return }
    setSelection({ account: next.accountNumber, manual: false })
    if (workspace.settings.autoCopy) copyAccount(next.accountNumber, direction > 0 ? 'Next lead. Account copied.' : 'Previous lead. Account copied.')
    else notify(direction > 0 ? 'Next lead.' : 'Previous lead.')
  }
  const noAnswer = () => { if (lead) advanceAfter(recordNoAnswer(workspace, lead, new Date()), 'No answer saved.') }
  const notInterested = () => { if (lead) advanceAfter(recordNotInterested(workspace, lead, new Date()), 'Marked not interested.') }
  const openCallback = () => { if (lead) setModal({ type: 'callback', lead, existing: callback, recordCall: true }) }
  const openSale = () => { if (lead) setModal({ type: 'sale', lead }) }

  // Pasting a lead list anywhere on the desk imports it immediately. Fields keep normal paste behaviour.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (modalOpenRef.current) return
      const target = event.target as HTMLElement | null
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (!text.trim() || parseLeads(text, new Date()).totalRows === 0) return
      event.preventDefault()
      quickImportRef.current(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    if (view !== 'overview' || modal || !lead) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.altKey || event.ctrlKey || event.metaKey || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return
      if (event.key === 'ArrowRight') { event.preventDefault(); cycle(1); return }
      if (event.key === 'ArrowLeft') { event.preventDefault(); cycle(-1); return }
      const key = event.key.toLowerCase()
      if (key === 'n') { event.preventDefault(); noAnswer() }
      else if (key === 'x') { event.preventDefault(); notInterested() }
      else if (key === 'c') { event.preventDefault(); openCallback() }
      else if (key === 's') { event.preventDefault(); openSale() }
      else if (key === 'v') { event.preventDefault(); copyAccount(lead.accountNumber) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // The current render's workspace and queue are intentionally captured by the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, modal, lead, workspace, queue])

  const onImport = (preview: ImportPreview, mode: 'replace' | 'append') => {
    const next = applyImport(workspace, preview, mode, new Date())
    setModal(null)
    setImportText('')
    setView('overview')
    advanceAfter(next, `${preview.leads.length} lead${preview.leads.length === 1 ? '' : 's'} imported.`)
  }
  const onCall = (selected: Lead, override: boolean) => {
    if (!override) { selectLead(selected); return }
    setModal({ type: 'confirm', title: 'Call this lead now?', description: `${selected.name} is scheduled for later or in a retry cooldown. Calling now overrides smart cycling for this call.`, confirmLabel: 'CALL NOW', action: () => selectLead(selected) })
  }
  const onVerify = (selected: Lead) => setModal({ type: 'confirm', title: 'Verify customer age?', description: `Only continue if you have independently confirmed that ${selected.name} is under 60. Their ID did not contain a readable date of birth.`, confirmLabel: 'YES, UNDER 60', action: () => { setWorkspace(previous => verifyAge(previous, selected.accountNumber)); notify('Age verified for this lead list.') } })
  const onReset = (selected: Lead) => {
    const reason = readiness(workspace, selected, now) === 'not_interested' ? 'was marked not interested' : 'previously had a sale recorded'
    setModal({ type: 'confirm', title: 'Return to the queue?', description: `${selected.name} ${reason}. Only return them if it is appropriate to contact them again. Their notes and call history will remain.`, confirmLabel: 'RETURN TO QUEUE', action: () => { setWorkspace(previous => resetToQueue(previous, selected.accountNumber, new Date())); notify('Lead returned to the queue.') } })
  }
  const onRemoveLead = (selected: Lead) => setModal({ type: 'confirm', title: 'Remove this lead?', description: `${selected.name} will be removed from the daily lead list. Their callbacks, sales and notes will stay.`, confirmLabel: 'REMOVE LEAD', danger: true, action: () => { setWorkspace(previous => removeLead(previous, selected.accountNumber)); notify('Lead removed from the list.') } })
  const onRemoveCallback = (item: Callback) => setModal({ type: 'confirm', title: 'Delete this callback?', description: `The callback for ${item.lead.name} will be removed. Their other records will stay and the lead may return to the queue.`, confirmLabel: 'DELETE CALLBACK', danger: true, action: () => { setWorkspace(previous => removeCallback(previous, item.id)); notify('Callback deleted.') } })
  const referralImpact = (sale: Sale) => {
    const referral = workspace.referrals.find(item => item.accountNumber === sale.lead.accountNumber)
    if (!referral) return ''
    return activePayment(referral) ? ' The recorded referral payment stays and will be flagged for review.' : ' The referral stays, but any unpaid reward may no longer be due.'
  }
  const onRemoveSale = (sale: Sale) => setModal({ type: 'confirm', title: sale.stage === 'activated' ? 'Delete this activation?' : 'Delete this sale?', description: `Only the ${sale.stage === 'activated' ? 'activation' : 'sale'} for ${sale.lead.name} will be deleted. Customer notes and call history will stay.${referralImpact(sale)}`, confirmLabel: 'DELETE RECORD', danger: true, action: () => { setUndoImport(null); setWorkspace(previous => removeSale(previous, sale.id)); notify('Record deleted.') } })
  const applyStage = (sale: Sale, stage: SaleStage, message: string, activationType?: 'ATT' | 'Non-ATT', packagePriceCents?: number | null) => {
    const current = workspaceRef.current
    const next = updateSaleStage(current, sale.id, stage, new Date(), stage === 'activated' ? activationType : undefined, stage === 'activated' ? packagePriceCents : undefined)
    if (next === current) { notify('Sale could not be moved; it may have changed in another tab or already have an open sale.'); return }
    setUndoImport(null)
    setWorkspace(next)
    notify(message)
  }
  const onStage = (sale: Sale, stage: SaleStage) => {
    if (stage === 'declined') {
      setModal({ type: 'confirm', title: 'Vetting declined?', description: `Move ${sale.lead.name}'s sale to declined. You can reopen it later if needed.`, confirmLabel: 'MARK DECLINED', action: () => applyStage(sale, stage, 'Sale marked declined.') })
      return
    }
    if (stage === 'activated') {
      // The ATT/non-ATT split is decided here, when the activation is real — never at sale entry.
      setModal({ type: 'activation', sale })
      return
    }
    applyStage(sale, stage, stage === 'pending_confirmation' ? 'Moved to awaiting confirmation.' : 'Moved to credit vetting.')
  }
  const onClear = (category: ClearCategory) => setModal({ type: 'confirm', ...clearDescriptions[category], confirmLabel: 'CLEAR THIS CATEGORY', danger: true, action: () => { setUndoImport(null); setWorkspace(previous => clearCategory(previous, category)); setSelection(null); notify('Selected category cleared.') } })
  const startFresh = () => setModal({ type: 'confirm', title: 'Start with a clean workspace?', description: 'This clears the sample leads, callbacks, sales, activations, referrals and notes. You can then import your own list.', confirmLabel: 'CLEAR SAMPLE DATA', danger: true, action: () => { const latest = workspaceRef.current; if (!latest.isDemo) { notify('Sample data is no longer active; nothing was cleared.'); return } const clean = createEmptyWorkspace(); clean.settings = latest.settings; setUndoImport(null); setWorkspace(clean); setSelection(null); setView('overview'); notify('Your workspace is ready for your leads.') } })
  const onExport = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `ultralead-backup-${localDayKey(new Date())}.json`; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('Backup downloaded. Keep it somewhere secure.')
  }
  const onRestore = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      if (!backup) { notify('This is not a valid ultralead+ backup. Nothing was changed.'); return }
      setModal({ type: 'confirm', title: 'Restore this backup?', description: 'Restoring replaces your entire current workspace with the selected backup. Export your current data first if you want to keep it.', confirmLabel: 'RESTORE BACKUP', danger: true, action: () => { setWorkspace(pruneExcluded(backup, new Date())); setSelection(null); setView('overview'); notify('Backup restored.') } })
    } catch { notify('Could not read that backup. Nothing was changed.') }
  }
  const openCustomer = (account: string) => setModal({ type: 'customer', account })
  const onAutoCopy = (value: boolean) => setWorkspace(previous => ({ ...previous, settings: { ...previous.settings, autoCopy: value } }))

  const onAddReferral = () => {
    if (!workspaceRef.current.isDemo) { setModal({ type: 'referral' }); return }
    setModal({ type: 'confirm', title: 'Start with your own referrals?', description: 'You are viewing sample data. Start with a clean workspace so your referrals will not be discarded when you import leads. This removes all sample leads, sales, activations and referrals.', confirmLabel: 'CLEAR SAMPLE & CONTINUE', action: () => {
      const latest = workspaceRef.current
      if (latest.isDemo) {
        const clean = createEmptyWorkspace()
        clean.settings = latest.settings
        clean.deviceSeed = latest.deviceSeed
        setUndoImport(null); setWorkspace(clean); setSelection(null)
      }
      setModal({ type: 'referral' })
    } })
  }
  const onSaveReferral = (values: ReferralFormValues, existing?: Referral) => {
    const current = workspaceRef.current
    if (existing) {
      const latest = current.referrals.find(item => item.id === existing.id)
      if (!latest || JSON.stringify(latest) !== JSON.stringify(existing)) { setModal(null); notify('Referral changed in another tab. Open it again to review.'); return }
    }
    let candidate = current
    let referrerId = values.referrerId
    const at = new Date()
    if (referrerId === 'new') {
      candidate = addReferrer(current, values.newReferrerName, values.newReferrerContact, at)
      if (candidate === current) { notify('The referrer could not be saved. Check their details.'); return }
      referrerId = candidate.referrers[candidate.referrers.length - 1].id
    }
    const next = saveReferral(candidate, { referrerId, customerName: values.customerName, customerContact: values.customerContact, accountNumber: values.accountNumber }, at, existing?.id)
    if (next === candidate) { notify('Referral not saved. The account may already be linked or the record may have changed.'); return }
    setUndoImport(null)
    setWorkspace(next)
    setModal(null)
    notify(existing ? 'Referral updated.' : 'Referral added.')
  }
  const onRemoveReferral = (referral: Referral) => setModal({
    type: 'confirm', title: 'Delete this referral?', description: `This removes the referral for ${referral.customerName}, not their lead, sale or customer history.`, confirmLabel: 'DELETE REFERRAL', danger: true,
    action: () => { const current = workspaceRef.current; const next = removeReferral(current, referral.id); if (next === current) { notify('Referral could not be deleted; it may have payment history or have changed.'); return } setUndoImport(null); setWorkspace(next); notify('Referral deleted.') },
  })
  const onAddReferralToLeads = (referral: Referral) => setModal({
    type: 'confirm', title: 'Add to the lead list?', description: `Add ${referral.customerName} (${referral.accountNumber}) to your calling list. First check in your calling system that the customer is not active or archived. Their age must be verified before calling; existing exclusions and do-not-call decisions still apply.`, confirmLabel: 'ADD TO LEADS',
    action: () => { const current = workspaceRef.current; const latest = current.referrals.find(item => item.id === referral.id); if (latest?.accountNumber !== referral.accountNumber) { notify('The referral changed. Check the account and try again.'); return } const next = addReferralToLeads(current, referral.id, new Date()); if (next === current) { notify('This customer could not be added. They may already be listed, have a sale, be excluded or be marked not interested.'); return } setUndoImport(null); setWorkspace(next); notify('Added to leads. Verify their age before calling.') },
  })
  const onPayReferral = (state: ReferralState) => {
    const { referral, referrer, sale, dueCents } = state
    if (state.status !== 'ready' || !sale || sale.packagePriceCents === null || !sale.activatedAt || !referral.accountNumber) return
    const expected = { referrerId: referrer.id, referrerName: referrer.name, referrerContact: referrer.contact, customerName: referral.customerName, accountNumber: referral.accountNumber, saleId: sale.id, activatedAt: sale.activatedAt, packageName: sale.packageName, packagePriceCents: sale.packagePriceCents, amountCents: dueCents }
    setModal({ type: 'confirm', title: 'Record this payment?', description: `Mark ${formatRand(dueCents)} as paid to ${referrer.name} for ${referral.customerName} (${sale.packageName}, ${formatRand(sale.packagePriceCents)}). Only confirm after you have sent the money yourself; this app does not make payments.`, confirmLabel: 'MARK AS PAID', action: () => {
      const current = workspaceRef.current
      const next = markReferralPaid(current, referral.id, new Date(), expected)
      if (next === current) { notify('Payment not recorded. The referral or activation changed; review it and try again.'); return }
      const saved = persistNow(next)
      setUndoImport(null); setWorkspace(next)
      notify(saved ? 'Payment recorded. No money was sent by the app.' : 'Payment marked paid in this session only. Export a backup before leaving.')
    } })
  }
  const onRemoveReferrer = (referrer: Referrer) => setModal({ type: 'confirm', title: 'Delete this referrer?', description: `Remove ${referrer.name} from your referrer list. A person with referrals cannot be deleted.`, confirmLabel: 'DELETE REFERRER', danger: true, action: () => {
    const current = workspaceRef.current; const next = removeReferrer(current, referrer.id)
    if (next === current) { notify('Referrer could not be deleted; they may still have referrals.'); return }
    setUndoImport(null); setWorkspace(next); notify('Referrer deleted.')
  } })

  return <div className="app-shell">
    <div className="app-layout" inert={modal ? true : undefined}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Sidebar view={view} onNavigate={setView} workspace={workspace} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    <div className="app-main">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><strong>{viewNames[view]}</strong></div><div className="topbar-right"><button className="topbar-help" onClick={() => setModal({ type: 'help' })} aria-label="How smart cycling works"><CircleHelp size={17} /></button><button className="button top-import" onClick={openImport}><Upload size={15} /> IMPORT LEADS</button></div></header>
      {workspace.isDemo && <section className="demo-banner" aria-label="Sample workspace notice"><div><span className="demo-tag">SAMPLE DATA</span><span>Sample leads. Import your own list to replace them.</span></div><button onClick={startFresh}>CLEAR SAMPLE DATA <ArrowRight size={14} /></button></section>}
      {storageWarning && <div className="storage-warning" role="alert">{storageWarning}</div>}
      <main className="main-content" id="main-content">
        {view === 'overview' && <Dashboard workspace={workspace} now={now} queue={queue} lead={lead} callback={callback} importMode={importMode} onImportMode={rememberImportMode} onQuickImport={quickImport} onCopy={() => lead && copyAccount(lead.accountNumber)} onCycle={cycle} onNoAnswer={noAnswer} onNotInterested={notInterested} onCallback={openCallback} onSale={openSale} onNotes={notes => lead && setWorkspace(previous => saveNotes(previous, lead.accountNumber, notes))} onNavigate={setView} onImport={openImport} onAutoCopy={onAutoCopy} />}
        {view === 'leads' && <LeadsView workspace={workspace} now={now} onImport={openImport} onOpenCustomer={openCustomer} onCopy={selected => copyAccount(selected.accountNumber)} onCall={onCall} onVerify={onVerify} onReset={onReset} onRemove={onRemoveLead} />}
        {view === 'callbacks' && <CallbacksView workspace={workspace} now={now} onOpenCustomer={openCustomer} onCall={onCall} onVerify={onVerify} onEdit={item => setModal({ type: 'callback', lead: findLead(workspace, item.lead.accountNumber) ?? item.lead, existing: item, recordCall: false })} onRemove={onRemoveCallback} />}
        {view === 'pipeline' && <PipelineView workspace={workspace} onStage={onStage} onEdit={sale => setModal({ type: 'sale', lead: sale.lead, sale })} onRemove={onRemoveSale} onOpenCustomer={openCustomer} />}
        {view === 'activations' && <ActivationsView workspace={workspace} now={now} onEdit={sale => setModal({ type: 'sale', lead: sale.lead, sale })} onUndo={sale => setModal({ type: 'confirm', title: 'Move back to confirmation?', description: `${sale.lead.name}'s sale will no longer count as an activation until it is completed again.${referralImpact(sale)}`, confirmLabel: 'MOVE BACK', action: () => applyStage(sale, 'pending_confirmation', 'Moved back to confirmation.') })} onRemove={onRemoveSale} onOpenCustomer={openCustomer} />}
        {view === 'referrals' && <ReferralsView workspace={workspace} now={now} onAdd={onAddReferral} onEdit={referral => setModal({ type: 'referral', referral })} onRemove={onRemoveReferral} onAddToLeads={onAddReferralToLeads} onVerify={onVerify} onCall={onCall} onEditSale={sale => setModal({ type: 'sale', lead: sale.lead, sale })} onPay={onPayReferral} onHistory={referral => setModal({ type: 'referral-history', referralId: referral.id })} onEditReferrer={referrer => setModal({ type: 'referrer', referrer })} onRemoveReferrer={onRemoveReferrer} onOpenCustomer={openCustomer} />}
        {view === 'insights' && <InsightsView workspace={workspace} now={now} />}
        {view === 'settings' && <SettingsView workspace={workspace} onAutoCopy={onAutoCopy} onAddPackage={name => { const trimmed = name.trim(); if (trimmed) setWorkspace(previous => previous.packages.some(item => item.toLowerCase() === trimmed.toLowerCase()) ? previous : { ...previous, packages: [...previous.packages, trimmed] }) }} onRemovePackage={name => setWorkspace(previous => ({ ...previous, packages: previous.packages.filter(item => item !== name) }))} onClear={onClear} onExport={onExport} onRestore={file => { void onRestore(file) }} />}
      </main>
    </div>
    </div>
    {toast && <div className="toast" role="status"><span className="tiny-dot" />{toast}{undoImport && <button className="toast-action" onClick={undoImport}>UNDO</button>}<button onClick={() => { setToast(''); setUndoImport(null) }} aria-label="Dismiss notification"><X size={14} /></button></div>}
    {modal?.type === 'import' && <ImportModal now={now} isDemo={workspace.isDemo} text={importText} onText={setImportText} mode={importMode} onMode={rememberImportMode} onClose={() => setModal(null)} onImport={onImport} />}
    {modal?.type === 'callback' && <CallbackModal key={`${modal.lead.accountNumber}-${modal.existing?.id ?? 'new'}`} lead={modal.lead} existing={modal.existing} now={now} onClose={() => setModal(null)} onSave={(dueAt, note) => { const next = saveCallback(workspace, modal.lead, dueAt, note, new Date(), modal.recordCall); setModal(null); if (modal.recordCall) advanceAfter(next, 'Callback scheduled.'); else { setWorkspace(next); notify('Callback updated.') } }} />}
    {modal?.type === 'sale' && <SaleModal key={modal.sale?.id ?? modal.lead.accountNumber} lead={modal.lead} sale={modal.sale} workspace={workspace} onClose={() => setModal(null)} onSave={(packageName, type, priceCents) => {
      const current = workspaceRef.current
      if (modal.sale) {
        const latest = current.sales.find(item => item.id === modal.sale!.id)
        if (!latest || !sameSaleDetails(latest, modal.sale)) { setModal(null); notify('Sale changed in another tab. Open it again to review.'); return }
        const next = editSale(current, modal.sale.id, packageName, type, new Date(), priceCents)
        if (next === current) { notify('Sale details could not be saved.'); return }
        setUndoImport(null); setWorkspace(next); notify('Sale details updated.')
      } else {
        const next = recordSale(current, modal.lead, packageName, new Date(), priceCents)
        if (next === current) notify('Sale not recorded. This account already has an open or completed sale.')
        else advanceAfter(next, 'Sale sent to credit vetting.')
      }
      setModal(null)
    }} />}
    {modal?.type === 'activation' && <ActivationModal key={modal.sale.id} sale={modal.sale} workspace={workspace} onClose={() => setModal(null)} onSave={(type, priceCents) => {
      const latest = workspaceRef.current.sales.find(item => item.id === modal.sale.id)
      if (!latest || !sameSaleDetails(latest, modal.sale) || latest.stage !== 'pending_confirmation') { setModal(null); notify('Sale changed in another tab. Open it again to review.'); return }
      applyStage(modal.sale, 'activated', `Activation completed as ${type === 'ATT' ? 'ATT' : 'non-ATT'}.`, type, priceCents); setModal(null)
    }} />}
    {modal?.type === 'referral' && <ReferralModal key={modal.referral?.id ?? 'new'} workspace={workspace} referral={modal.referral} onClose={() => setModal(null)} onSave={values => onSaveReferral(values, modal.referral)} />}
    {modal?.type === 'referrer' && <ReferrerModal key={modal.referrer.id} referrer={modal.referrer} onClose={() => setModal(null)} onSave={(name, contact) => {
      const current = workspaceRef.current
      const latest = current.referrers.find(item => item.id === modal.referrer.id)
      if (!latest || latest.name !== modal.referrer.name || latest.contact !== modal.referrer.contact) { setModal(null); notify('Referrer changed in another tab. Open it again to review.'); return }
      const next = editReferrer(current, modal.referrer.id, name, contact)
      if (next === current) { notify('Referrer could not be updated.'); return }
      setUndoImport(null); setWorkspace(next); setModal(null); notify('Referrer updated.')
    }} />}
    {modal?.type === 'referral-history' && (() => {
      const referral = workspace.referrals.find(item => item.id === modal.referralId)
      return referral ? <PaymentHistoryModal referral={referral} onClose={() => setModal(null)} onCorrect={payment => setModal({ type: 'confirm', title: 'Correct this paid mark?', description: `Only continue if the ${formatRand(payment.amountCents)} payment was marked paid by mistake. This does not reverse a real payment. If the activation still qualifies, it will appear as due again. The correction remains in payment history.`, confirmLabel: 'CORRECT PAID MARK', danger: true, action: () => {
        const current = workspaceRef.current; const next = voidReferralPayment(current, referral.id, payment.id, new Date())
        if (next === current) { notify('Payment could not be corrected; it may have changed.'); return }
        const saved = persistNow(next)
        setUndoImport(null); setWorkspace(next)
        notify(saved ? 'Paid mark corrected. No money was reversed.' : 'Paid mark corrected in this session only. Export a backup before leaving.')
      } })} /> : <Modal title="Referral no longer available." onClose={() => setModal(null)}><div className="modal-body"><p className="modal-intro">This referral may have been removed in another tab.</p><div className="modal-footer"><button className="button button-primary" onClick={() => setModal(null)}>DONE</button></div></div></Modal>
    })()}
    {modal?.type === 'customer' && (() => {
      const customerLead = findCustomerLead(workspace, modal.account)
      return customerLead ? <CustomerModal workspace={workspace} lead={customerLead} account={modal.account} now={now} onCopy={account => copyAccount(account)} onNotes={notes => setWorkspace(previous => saveNotes(previous, modal.account, notes))} onClose={() => setModal(null)} /> : null
    })()}
    {modal?.type === 'help' && <HelpModal onClose={() => setModal(null)} />}
    {modal?.type === 'confirm' && <Modal title={modal.title} eyebrow="PLEASE CONFIRM" onClose={() => setModal(null)}><div className="modal-body"><p className="modal-intro confirm-description">{modal.description}</p><div className="modal-footer"><button className="button button-outline" onClick={() => setModal(null)}>CANCEL</button><button className={`button ${modal.danger ? 'button-danger' : 'button-primary'}`} onClick={() => { const action = modal.action; setModal(null); action() }}>{modal.confirmLabel} <ArrowRight size={15} /></button></div></div></Modal>}
  </div>
}
