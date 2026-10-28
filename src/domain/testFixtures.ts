import { emptyProfile, type Lead, type Workspace } from './types'
import { createEmptyWorkspace } from './workspace'

export const NOW = new Date(2026, 9, 28, 10, 0, 0)
export function makeLead(accountNumber: string, overrides: Partial<Lead> = {}): Lead {
  return { accountNumber, name: `Person ${accountNumber}`, customerId: '9001010000000', sourceStatus: 'Prospect', listDate: '2026-10-28', importedAt: NOW.toISOString(), ageVerified: false, ...overrides }
}
export function workspaceWith(...leads: Lead[]): Workspace {
  return { ...createEmptyWorkspace(NOW), deviceSeed: 'test-device', leads }
}
export { emptyProfile }
