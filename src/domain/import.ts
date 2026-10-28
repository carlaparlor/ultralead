import { ageFromCustomerId } from './dates'
import type { ExclusionReason, Lead } from './types'

export interface ExcludedLead {
  lead: Lead
  reason: ExclusionReason
}

export interface InvalidRow {
  line: number
  reason: string
}

export interface ImportPreview {
  totalRows: number
  leads: Lead[]
  excluded: ExcludedLead[]
  duplicates: number
  invalidRows: InvalidRow[]
  needsAgeReview: number
}

export function exclusionReason(lead: Lead, now: Date): ExclusionReason | null {
  const status = lead.sourceStatus.trim().toLowerCase()
  if (status === 'active') return 'active'
  if (status === 'archived') return 'archived'
  if (status === '60+') return 'age_60_plus'
  const age = ageFromCustomerId(lead.customerId, now)
  return age !== null && age >= 60 ? 'age_60_plus' : null
}

export function needsAgeReview(lead: Lead, now: Date): boolean {
  return ageFromCustomerId(lead.customerId, now) === null && !lead.ageVerified
}

export function exclusionLabel(reason: ExclusionReason): string {
  if (reason === 'active') return 'Active'
  if (reason === 'archived') return 'Archived'
  return '60 or older'
}

/** Parse both tab-separated CRM rows and whitespace-separated pasted rows. */
export function parseLeads(text: string, now: Date): ImportPreview {
  const rows = text.split(/\r?\n/).map((line, index) => ({ text: line.trim(), line: index + 1 })).filter(row => row.text.length > 0)
  const valid = new Map<string, Lead>()
  const excluded = new Map<string, ExcludedLead>()
  const seen = new Set<string>()
  const invalidRows: InvalidRow[] = []
  let duplicates = 0

  for (const row of rows) {
    const account = /\b5-\d+\b/i.exec(row.text)
    if (!account || account.index === undefined) {
      invalidRows.push({ line: row.line, reason: 'Missing a 5- account number.' })
      continue
    }
    const beforeAccount = row.text.slice(0, account.index)
    // Use the last status token: a customer's name may itself contain a word like Active.
    const matches = [...beforeAccount.matchAll(/(?:^|\s)(active|archived|prospect|60\+)(?=\s|$)/gi)]
    const statusMatch = matches[matches.length - 1]
    const namePart = statusMatch && statusMatch.index !== undefined
      ? beforeAccount.slice(0, statusMatch.index)
      : beforeAccount.replace(/\bconsumer\b.*$/i, '')
    const name = namePart.replace(/\s+/g, ' ').trim()
    if (!name) {
      invalidRows.push({ line: row.line, reason: 'Missing a customer name.' })
      continue
    }
    const remainder = row.text.slice(account.index + account[0].length)
    const customerId = /(?:^|\D)(\d{13})(?!\d)/.exec(remainder)?.[1] ?? ''
    const listDate = /\b\d{4}-\d{2}-\d{2}\b/.exec(remainder)?.[0] ?? null
    const rawStatus = statusMatch?.[1] ?? 'Unknown'
    const status = rawStatus === '60+' ? rawStatus : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()
    const lead: Lead = {
      accountNumber: account[0].toUpperCase(), name, customerId, sourceStatus: status,
      listDate, importedAt: now.toISOString(), ageVerified: false,
    }
    if (seen.has(lead.accountNumber)) duplicates++
    seen.add(lead.accountNumber)
    const reason = exclusionReason(lead, now)
    if (reason) {
      // If contradictory rows appear, the safe choice wins regardless of order.
      excluded.set(lead.accountNumber, { lead, reason })
      valid.delete(lead.accountNumber)
    } else if (!excluded.has(lead.accountNumber)) {
      valid.set(lead.accountNumber, lead)
    }
  }

  const leads = [...valid.values()]
  return {
    totalRows: rows.length, leads, excluded: [...excluded.values()], duplicates, invalidRows,
    needsAgeReview: leads.filter(lead => needsAgeReview(lead, now)).length,
  }
}
