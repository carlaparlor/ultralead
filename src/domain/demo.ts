import { localDayKey } from './dates'
import { emptyProfile, type Activity, type Callback, type Lead, type Sale, type Workspace } from './types'
import { createEmptyWorkspace } from './workspace'

/** All examples are invented. IDs have deliberately non-real trailing digits. */
export function createDemoWorkspace(now = new Date()): Workspace {
  const base = createEmptyWorkspace(now)
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString()
  const minutesFromNow = (minutes: number) => new Date(now.getTime() + minutes * 60000).toISOString()
  const lead = (name: string, account: string, id: string): Lead => ({
    name, accountNumber: account, customerId: id, sourceStatus: 'Prospect',
    listDate: localDayKey(now), importedAt: minutesAgo(180), ageVerified: false,
  })
  const leads = [
    lead('Thandi Mokoena', '5-84729361000104', '9005120000000'),
    lead('Ayesha Daniels', '5-84729361000105', '9508130000000'),
    lead('Sipho Mahlangu', '5-84729361000106', '8802210000000'),
    lead('Naledi Khumalo', '5-84729361000107', '9207100000000'),
    lead('Lindiwe Jacobs', '5-84729361000108', '9701060000000'),
    lead('Kabelo Ndlovu', '5-84729361000109', '8506240000000'),
    lead('Zanele Nkosi', '5-84729361000110', '9104290000000'),
    lead('Pieter Marais', '5-84729361000111', '8901190000000'),
    lead('Nomsa Dube', '5-84729361000112', '9403300000000'),
    lead('Sizwe Molefe', '5-84729361000113', '9609150000000'),
    lead('Amara Williams', '5-84729361000114', '9802030000000'),
    lead('Neo Petersen', '5-84729361000115', '9308040000000'),
  ]
  const historical = [
    lead('Lerato Mthembu', '5-84729361000116', '9101120000000'),
    lead('Sam Williams', '5-84729361000117', '9206220000000'),
    lead('Mia Petersen', '5-84729361000118', '9604270000000'),
  ]
  const callbacks: Callback[] = [
    { id: 'demo-callback-1', lead: leads[0], dueAt: minutesAgo(23), note: 'Asked for a call back to discuss the data options.', createdAt: minutesAgo(1440) },
    { id: 'demo-callback-2', lead: leads[1], dueAt: minutesFromNow(90), note: 'Available later today.', createdAt: minutesAgo(65) },
  ]
  const sale = (id: string, customer: Lead, packageName: string, activationType: Sale['activationType'], stage: Sale['stage'], minutes: number): Sale => ({
    id, lead: customer, packageName, activationType, stage, createdAt: minutesAgo(minutes + 45),
    updatedAt: minutesAgo(minutes), activatedAt: stage === 'activated' ? minutesAgo(minutes) : null,
  })
  const sales: Sale[] = [
    sale('demo-sale-1', leads[2], 'Everyday 20GB', 'ATT', 'credit_vetting', 34),
    sale('demo-sale-2', leads[3], 'Unlimited Connect', 'Non-ATT', 'pending_confirmation', 72),
    sale('demo-sale-3', historical[0], 'Everyday 20GB', 'ATT', 'activated', 95),
    sale('demo-sale-4', historical[1], 'Home Connect', 'Non-ATT', 'activated', 150),
    sale('demo-sale-5', historical[2], 'Everyday 20GB', 'ATT', 'activated', 1740),
  ]
  const activity: Activity[] = [
    { id: 'demo-activity-1', at: minutesAgo(18), accountNumber: leads[4].accountNumber, name: leads[4].name, description: 'No answer · retry spaced out' },
    { id: 'demo-activity-2', at: minutesAgo(34), accountNumber: leads[2].accountNumber, name: leads[2].name, description: 'Sale recorded · credit vetting' },
    { id: 'demo-activity-3', at: minutesAgo(65), accountNumber: leads[1].accountNumber, name: leads[1].name, description: 'Callback scheduled' },
    { id: 'demo-activity-4', at: minutesAgo(95), accountNumber: historical[0].accountNumber, name: historical[0].name, description: 'Activation completed' },
  ]
  return {
    ...base,
    isDemo: true,
    leads,
    callbacks,
    sales,
    activity,
    packages: ['Everyday 20GB', 'Unlimited Connect', 'Home Connect'],
    profiles: {
      [leads[0].accountNumber]: { ...emptyProfile(), notes: 'Interested in a smaller data package. Wants to compare options before deciding.', attempts: [{ id: 'demo-attempt-1', at: minutesAgo(1440), outcome: 'callback' }] },
      [leads[1].accountNumber]: { ...emptyProfile(), attempts: [{ id: 'demo-attempt-2', at: minutesAgo(65), outcome: 'callback' }] },
      [leads[2].accountNumber]: { ...emptyProfile(), attempts: [{ id: 'demo-attempt-3', at: minutesAgo(34), outcome: 'sale' }] },
      [leads[3].accountNumber]: { ...emptyProfile(), attempts: [{ id: 'demo-attempt-4', at: minutesAgo(100), outcome: 'sale' }] },
      [leads[4].accountNumber]: { ...emptyProfile(), attempts: [{ id: 'demo-attempt-5', at: minutesAgo(18), outcome: 'no_answer' }] },
      [leads[11].accountNumber]: { ...emptyProfile(), doNotCall: true, attempts: [{ id: 'demo-attempt-6', at: minutesAgo(120), outcome: 'not_interested' }] },
    },
  }
}
