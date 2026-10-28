import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { STORAGE_KEY } from './domain/storage'
import { makeLead } from './domain/testFixtures'
import { recordNoAnswer, recordNotInterested, recordSale, saveCallback, saveNotes, updateSaleStage } from './domain/workspace'
import { createEmptyWorkspace } from './domain/workspace'

const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
const openImport = () => fireEvent.click(screen.getByRole('button', { name: 'IMPORT LEADS' }))
const dialog = () => within(screen.getByRole('dialog'))
const importRows = (rows: string) => {
  openImport()
  fireEvent.change(dialog().getByLabelText(/PASTE YOUR LEAD LIST/), { target: { value: rows } })
  fireEvent.click(dialog().getByRole('button', { name: 'IMPORT LEADS' }))
}

beforeEach(() => {
  localStorage.clear()
  clipboard.writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
})

describe('calling workflow', () => {
  it('imports, filters, reviews age, schedules a callback and completes a sale', async () => {
    render(<App />)
    expect(screen.getByText('SAMPLE DATA')).toBeInTheDocument()
    openImport()
    fireEvent.change(dialog().getByLabelText(/PASTE YOUR LEAD LIST/), { target: { value: [
      'Active Person\tActive\tConsumer\t5-100\t9001010000000\t2026-09-01',
      'Older Person\tProspect\tConsumer\t5-101\t6001010000000\t2026-09-01',
      'Valid Person\tProspect\tConsumer\t5-102\t9908169875084\t2026-09-01',
      'Review Person\tProspect\tConsumer\t5-103\t2026-09-01',
    ].join('\n') } })
    expect(dialog().getByText(/Filtered from calling/)).toBeInTheDocument()
    expect(dialog().getByText(/held for age review/)).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: 'IMPORT LEADS' }))
    expect(screen.queryByText('SAMPLE DATA')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Valid Person' })).toBeInTheDocument()
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('5-102'))

    fireEvent.change(screen.getByLabelText('CUSTOMER NOTES'), { target: { value: 'Prefers afternoons' } })
    fireEvent.click(screen.getByRole('button', { name: /Callback C/ }))
    fireEvent.change(dialog().getByLabelText(/CALLBACK NOTE/), { target: { value: 'Call after work' } })
    fireEvent.click(dialog().getByRole('button', { name: /SAVE CALLBACK/ }))
    expect(screen.getByRole('heading', { name: 'Your queue is clear.' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /All leads/ }))
    expect(screen.getByText('Age review needed', { selector: '.status-pill' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /VERIFY AGE/ }))
    fireEvent.click(dialog().getByRole('button', { name: /YES, UNDER 60/ }))
    fireEvent.click(screen.getByRole('button', { name: /^CALL$/ }))
    expect(screen.getByRole('heading', { name: 'Review Person' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Made a sale/ }))
    fireEvent.change(dialog().getByLabelText(/PACKAGE/), { target: { value: 'A changing deal' } })
    // No ATT/non-ATT choice before vetting.
    expect(dialog().queryByLabelText(/NON-ATT/)).not.toBeInTheDocument()
    expect(dialog().getByText(/ATT or non-ATT\?/)).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: /START CREDIT VETTING/ }))
    fireEvent.click(screen.getByRole('button', { name: /Sales pipeline/ }))
    expect(screen.getByText('A changing deal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /VETTING APPROVED/ }))
    fireEvent.click(screen.getByRole('button', { name: /COMPLETE ACTIVATION/ }))
    // The type is asked for exactly here.
    expect(dialog().getByRole('radio', { name: /^ATT/ })).toBeInTheDocument()
    expect(dialog().getByRole('button', { name: /COMPLETE ACTIVATION/ })).toBeDisabled()
    fireEvent.click(dialog().getByLabelText(/NON-ATT/))
    fireEvent.click(dialog().getByRole('button', { name: /COMPLETE ACTIVATION/ }))
    fireEvent.click(screen.getByRole('button', { name: /Activations/ }))
    expect(screen.getByText('A changing deal')).toBeInTheDocument()
    expect(screen.getByText('NON-ATT', { selector: '.status-pill' })).toBeInTheDocument()

    importRows('Next Person\tProspect\tConsumer\t5-104\t9501010000000\t2026-10-28')
    fireEvent.click(screen.getByRole('button', { name: /Callbacks/ }))
    expect(screen.getByText('Valid Person')).toBeInTheDocument()
    expect(screen.getByText('Call after work')).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.profiles['5-102'].notes).toBe('Prefers afternoons')
    expect(saved.sales.filter((sale: { stage: string }) => sale.stage === 'activated')).toHaveLength(1)
  })

  it('imports a pasted lead list from anywhere on the desk and can undo it', async () => {
    render(<App />)
    const paste = new Event('paste', { bubbles: true }) as Event & { clipboardData: unknown }
    paste.clipboardData = { getData: () => 'Paste Person\tProspect\tConsumer\t5-880\t9001010000000' }
    fireEvent(window, paste)
    expect(screen.getByRole('heading', { name: 'Paste Person' })).toBeInTheDocument()
    expect(screen.queryByText('SAMPLE DATA')).not.toBeInTheDocument()
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('5-880'))
    fireEvent.click(screen.getByRole('button', { name: 'UNDO' }))
    expect(screen.getByText('SAMPLE DATA')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Paste Person' })).not.toBeInTheDocument()
  })

  it('keeps the chosen import mode for the next paste', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'ADD' }))
    expect(screen.getByRole('button', { name: 'ADD' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'REPLACE' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('uses n, x, c and the arrow keys on the calling desk', async () => {
    render(<App />)
    importRows('Cycle One Prospect Consumer 5-921 9001010000000\nCycle Two Prospect Consumer 5-922 9001010000000')
    const shown = () => screen.getByText(/^5-92[12]$/, { selector: '.account-box strong' }).textContent
    const first = shown()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    const second = shown()
    expect(second).not.toBe(first)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(shown()).toBe(first)
    // c opens the callback dialog
    fireEvent.keyDown(window, { key: 'c' })
    expect(dialog().getByLabelText(/CALLBACK NOTE/)).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: /CANCEL/ }))
    // n logs a no answer for the current lead; x marks not interested
    fireEvent.keyDown(window, { key: 'n' })
    fireEvent.keyDown(window, { key: 'x' })
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    const outcomes = Object.values(saved.profiles as Record<string, { attempts: { outcome: string }[]; doNotCall: boolean }>)
      .flatMap(profile => profile.attempts.map(attempt => attempt.outcome))
    expect(outcomes).toEqual(expect.arrayContaining(['no_answer', 'not_interested']))
  })

  it('keeps notes and call history reachable after a sale, in every stage', () => {
    const now = new Date()
    const a = makeLead('5-871', { name: 'Sold Person' }), b = makeLead('5-872', { name: 'Activated Person' })
    let ws = { ...createEmptyWorkspace(now), leads: [a, b] }
    ws = saveNotes(ws, a.accountNumber, 'Wants the family package')
    ws = recordSale(ws, a, 'Family 50GB', now)
    ws = saveNotes(ws, b.accountNumber, 'Happy on the call')
    ws = recordSale(ws, b, 'Solo 20GB', now)
    const id = ws.sales.find(sale => sale.packageName === 'Solo 20GB')!.id
    ws = updateSaleStage(ws, id, 'pending_confirmation', now)
    ws = updateSaleStage(ws, id, 'activated', now, 'ATT')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    render(<App />)

    // In credit vetting
    fireEvent.click(screen.getByRole('button', { name: /Sales pipeline/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Notes and history for Sold Person' }))
    expect(dialog().getByLabelText(/CUSTOMER NOTES/)).toHaveValue('Wants the family package')
    expect(dialog().getByText('Credit vetting')).toBeInTheDocument()
    fireEvent.change(dialog().getByLabelText(/CUSTOMER NOTES/), { target: { value: 'Prefers Friday delivery' } })
    fireEvent.click(dialog().getByRole('button', { name: /DONE/ }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles['5-871'].notes).toBe('Prefers Friday delivery')

    // Activated — from the activations list, including the recorded type and call history
    fireEvent.click(screen.getByRole('button', { name: /Activations/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Notes and history for Activated Person' }))
    expect(dialog().getByLabelText(/CUSTOMER NOTES/)).toHaveValue('Happy on the call')
    expect(dialog().getByText('Activated · ATT')).toBeInTheDocument()
    expect(dialog().getByText('Sale recorded', { selector: '.history-outcome' })).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: /DONE/ }))

    // Still reachable from All leads
    fireEvent.click(screen.getByRole('button', { name: /All leads/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Notes and history for Sold Person' }))
    expect(dialog().getByLabelText(/CUSTOMER NOTES/)).toHaveValue('Prefers Friday delivery')
  })

  it('shows calling insights for the chosen period', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const now = new Date(2026, 9, 28, 10)
      vi.setSystemTime(now)
      const a = makeLead('5-881', { name: 'Insight Person' }), b = makeLead('5-882', { name: 'Older Person' })
      let ws = { ...createEmptyWorkspace(now), leads: [a, b] }
      ws = recordNotInterested(ws, a, now)
      ws = recordNoAnswer(ws, b, new Date(now.getTime() - 2 * 60 * 60 * 1000))
      ws = recordSale(ws, b, 'Insight Deal', now)
      const saleId = ws.sales[0].id
      ws = updateSaleStage(ws, saleId, 'pending_confirmation', now)
      ws = updateSaleStage(ws, saleId, 'activated', now, 'ATT')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: /Insights/ }))
      expect(screen.getByRole('heading', { name: /How you're doing/ })).toBeInTheDocument()
      // Today: three attempts (not interested, no answer, sale)
      expect(screen.getByText('CALLS LOGGED').parentElement).toHaveTextContent('3')
      expect(screen.getByText('SALES').parentElement).toHaveTextContent('1')
      expect(screen.getByText('ACTIVATIONS').parentElement).toHaveTextContent('1')
      expect(screen.getByText('ATT vs non-ATT')).toBeInTheDocument()
      expect(screen.getAllByText(/Insight Deal/).length).toBeGreaterThan(0)
      // Narrow the period to today, then widen it: the counts follow the window.
      fireEvent.click(screen.getByRole('button', { name: 'TODAY' }))
      expect(screen.getByRole('button', { name: 'TODAY' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('CALLS LOGGED').parentElement).toHaveTextContent('3')
      fireEvent.click(screen.getByRole('button', { name: 'ALL TIME' }))
      expect(screen.getByText('CALLS LOGGED').parentElement).toHaveTextContent('3')
    } finally { vi.useRealTimers() }
  })

  it('shows no activation type for sales still in vetting or confirmation', () => {
    const now = new Date()
    const a = makeLead('5-861', { name: 'Vetting Person' }), b = makeLead('5-862', { name: 'Confirming Person' })
    let ws = { ...createEmptyWorkspace(now), leads: [a, b] }
    ws = recordSale(ws, a, 'Vetting Deal', now)
    ws = recordSale(ws, b, 'Confirm Deal', now)
    const id = ws.sales.find(sale => sale.packageName === 'Confirm Deal')!.id
    ws = updateSaleStage(ws, id, 'pending_confirmation', now)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Sales pipeline/ }))
    expect(screen.getAllByText('AT ACTIVATION')).toHaveLength(2)
    expect(screen.queryByText('ATT', { selector: '.sale-details strong' })).not.toBeInTheDocument()
  })

  it('cycles with the arrows and does not fire shortcuts while typing', async () => {
    render(<App />)
    importRows('Person One Prospect Consumer 5-201 9001010000000\nPerson Two Prospect Consumer 5-202 9001010000000')
    const initial = screen.getByText(/^5-20[12]$/, { selector: '.account-box strong' }).textContent
    clipboard.writeText.mockClear()
    fireEvent.keyDown(screen.getByLabelText('CUSTOMER NOTES'), { key: 'n' })
    expect(screen.getByText(/^5-20[12]$/, { selector: '.account-box strong' })).toHaveTextContent(initial!)
    fireEvent.click(screen.getByRole('button', { name: /SKIP LEAD/ }))
    const next = screen.getByText(/^5-20[12]$/, { selector: '.account-box strong' }).textContent
    expect(next).not.toBe(initial)
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(next))
    fireEvent.keyDown(window, { key: 'x' })
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.profiles[next!].doNotCall).toBe(true)
  })

  it('clears only the selected category after confirmation', () => {
    const now = new Date()
    const a = makeLead('5-301'), b = makeLead('5-302')
    let ws = { ...createEmptyWorkspace(now), leads: [a, b] }
    ws = saveNotes(ws, a.accountNumber, 'Keep my note')
    ws = saveCallback(ws, a, new Date(now.getTime() + 3600000).toISOString(), 'Keep until cleared', now)
    ws = recordSale(ws, b, 'Some package', now)
    const id = ws.sales[0].id
    ws = updateSaleStage(ws, id, 'pending_confirmation', now)
    ws = updateSaleStage(ws, id, 'activated', now, 'ATT')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Data & settings/ }))
    const row = screen.getByText('Callbacks', { selector: '.settings-row strong' }).closest('.settings-row')!
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'CLEAR' }))
    expect(dialog().getByText(/removes scheduled callbacks only/i)).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: /CLEAR THIS CATEGORY/ }))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.callbacks).toHaveLength(0)
    expect(saved.leads).toHaveLength(2)
    expect(saved.sales).toHaveLength(1)
    expect(saved.profiles['5-301'].notes).toBe('Keep my note')
  })

  it('can return a lead to the queue after its sale record is deleted without erasing history', () => {
    const now = new Date()
    const lead = makeLead('5-499', { name: 'Deleted Sale Person' })
    let ws = recordSale({ ...createEmptyWorkspace(now), leads: [lead] }, lead, 'Deal', now)
    ws = { ...ws, sales: [] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /All leads/ }))
    fireEvent.click(screen.getByRole('button', { name: /RETURN TO QUEUE/ }))
    expect(dialog().getByText(/previously had a sale recorded/)).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: /RETURN TO QUEUE/ }))
    expect(screen.getByRole('button', { name: 'CALL' })).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.profiles['5-499'].attempts).toHaveLength(1)
  })

  it('deletes one callback and one activation without deleting the daily leads or notes', () => {
    const now = new Date()
    const a = makeLead('5-451', { name: 'Callback Person' }), b = makeLead('5-452', { name: 'Sale Person' })
    let ws = { ...createEmptyWorkspace(now), leads: [a, b] }
    ws = saveNotes(ws, a.accountNumber, 'Keep note')
    ws = saveCallback(ws, a, new Date(now.getTime() + 3600000).toISOString(), '', now)
    ws = recordSale(ws, b, 'Deal', now)
    const id = ws.sales[0].id
    ws = updateSaleStage(updateSaleStage(ws, id, 'pending_confirmation', now), id, 'activated', now, 'ATT')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Callbacks/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete callback for Callback Person' }))
    fireEvent.click(dialog().getByRole('button', { name: /DELETE CALLBACK/ }))
    fireEvent.click(screen.getByRole('button', { name: /Activations/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete activation for Sale Person' }))
    fireEvent.click(dialog().getByRole('button', { name: /DELETE RECORD/ }))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.callbacks).toHaveLength(0)
    expect(saved.sales).toHaveLength(0)
    expect(saved.leads).toHaveLength(2)
    expect(saved.profiles['5-451'].notes).toBe('Keep note')
  })

  it('paginates large lead lists and resets the page when searching', () => {
    const now = new Date()
    const leads = Array.from({ length: 75 }, (_, index) => makeLead(`5-${500 + index}`, { name: `Customer ${index + 1}` }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createEmptyWorkspace(now), leads }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /All leads/ }))
    expect(screen.getAllByRole('row')).toHaveLength(51) // header plus 50 leads
    fireEvent.click(screen.getByRole('button', { name: 'Next leads page' }))
    expect(screen.getAllByRole('row')).toHaveLength(26)
    expect(screen.getByText('Customer 75')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search leads'), { target: { value: 'Customer 1' } })
    expect(screen.getByText('Customer 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next leads page' })).not.toBeInTheDocument()
  })

  it('copies and displays a callback that becomes due just before advancing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const start = new Date(2026, 9, 28, 10)
      vi.setSystemTime(start)
      const fresh = makeLead('5-601', { name: 'Fresh Person' })
      const callbackLead = makeLead('5-602', { name: 'Due Person' })
      let ws = { ...createEmptyWorkspace(start), leads: [fresh, callbackLead] }
      ws = saveCallback(ws, callbackLead, new Date(start.getTime() + 10000).toISOString(), '', start)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
      render(<App />)
      expect(screen.getByRole('heading', { name: 'Fresh Person' })).toBeInTheDocument()
      vi.setSystemTime(new Date(start.getTime() + 20000))
      clipboard.writeText.mockClear()
      fireEvent.click(screen.getByRole('button', { name: /No answer/ }))
      expect(screen.getByRole('heading', { name: 'Due Person' })).toBeInTheDocument()
      expect(clipboard.writeText).toHaveBeenCalledWith('5-602')
    } finally { vi.useRealTimers() }
  })

  it('filters activation totals and records by today or this month', () => {
    const now = new Date()
    const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 10)
    const a = makeLead('5-801', { name: 'Today Person' }), b = makeLead('5-802', { name: 'Old Person' })
    let ws = { ...createEmptyWorkspace(now), leads: [a, b] }
    ws = recordSale(ws, a, 'Current', now)
    let id = ws.sales[0].id
    ws = updateSaleStage(updateSaleStage(ws, id, 'pending_confirmation', now), id, 'activated', now, 'ATT')
    ws = recordSale(ws, b, 'Previous', lastYear)
    id = ws.sales[0].id
    ws = updateSaleStage(updateSaleStage(ws, id, 'pending_confirmation', lastYear), id, 'activated', lastYear, 'Non-ATT')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Activations/ }))
    expect(screen.getByText('Old Person')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Activation period'), { target: { value: 'today' } })
    expect(screen.getByText('Today Person')).toBeInTheDocument()
    expect(screen.queryByText('Old Person')).not.toBeInTheDocument()
    expect(screen.getByText('SHOWING 1 OF 1 ACTIVATIONS')).toBeInTheDocument()
  })

  it('accepts a valid workspace update from another tab on the same origin', () => {
    render(<App />)
    const now = new Date()
    const incoming = { ...createEmptyWorkspace(now), leads: [makeLead('5-700', { name: 'Another Tab' })] }
    fireEvent(window, new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(incoming) }))
    expect(screen.getByRole('heading', { name: 'Another Tab' })).toBeInTheDocument()
    expect(screen.queryByText('SAMPLE DATA')).not.toBeInTheDocument()
  })

  it('does not keep a manually selected customer on screen if another tab suppresses them', () => {
    const now = new Date()
    const a = makeLead('5-901', { name: 'Suppressed Person' }), b = makeLead('5-902', { name: 'Other Person' })
    const ws = { ...createEmptyWorkspace(now), leads: [a, b] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /All leads/ }))
    const row = screen.getByText('Suppressed Person').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'CALL' }))
    expect(screen.getByRole('heading', { name: 'Suppressed Person' })).toBeInTheDocument()
    const incoming = recordNotInterested(ws, a, now)
    fireEvent(window, new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(incoming) }))
    expect(screen.queryByRole('heading', { name: 'Suppressed Person' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other Person' })).toBeInTheDocument()
  })

  it('validates and confirms backups before replacing the workspace', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Data & settings/ }))
    const input = screen.getByLabelText('Choose backup file')
    const bad = new File(['invalid'], 'bad.json', { type: 'application/json' })
    Object.defineProperty(bad, 'text', { value: async () => 'invalid' })
    fireEvent.change(input, { target: { files: [bad] } })
    expect(await screen.findByText(/not a valid ultralead\+ backup/)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).isDemo).toBe(true)

    const now = new Date()
    const backup = { ...createEmptyWorkspace(now), leads: [makeLead('5-999', { name: 'Restored Person' })] }
    const good = new File([JSON.stringify(backup)], 'good.json', { type: 'application/json' })
    Object.defineProperty(good, 'text', { value: async () => JSON.stringify(backup) })
    fireEvent.change(input, { target: { files: [good] } })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(dialog().getByRole('button', { name: /RESTORE BACKUP/ }))
    expect(screen.getByRole('heading', { name: 'Restored Person' })).toBeInTheDocument()
  })

  it('does not clear real data if another tab replaces the demo while confirmation is open', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /CLEAR SAMPLE DATA/ }))
    const now = new Date()
    const incoming = { ...createEmptyWorkspace(now), leads: [makeLead('5-998', { name: 'Real Person' })] }
    fireEvent(window, new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(incoming) }))
    fireEvent.click(dialog().getByRole('button', { name: /CLEAR SAMPLE DATA/ }))
    expect(screen.getByRole('heading', { name: 'Real Person' })).toBeInTheDocument()
    expect(screen.getByText(/nothing was cleared/)).toBeInTheDocument()
  })

  it('restores saved work after unmount and remount', () => {
    const { unmount } = render(<App />)
    importRows('Persist Person Prospect Consumer 5-401 9001010000000')
    fireEvent.change(screen.getByLabelText('CUSTOMER NOTES'), { target: { value: 'A persistent note' } })
    unmount()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Persist Person' })).toBeInTheDocument()
    expect(screen.getByLabelText('CUSTOMER NOTES')).toHaveValue('A persistent note')
    expect(screen.queryByText('SAMPLE DATA')).not.toBeInTheDocument()
  })
})
