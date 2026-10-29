import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { _electron as electron } from 'playwright-core'

const { values } = parseArgs({ options: { executable: { type: 'string' } } })
const temporary = await mkdtemp(path.join(os.tmpdir(), 'ultralead-desktop-'))
const profile = path.join(temporary, 'workspace')
const backupFile = path.join(temporary, 'backup.json')
const storageKey = 'ultralead-plus.workspace.v1'
const errors = []
const remoteRequests = []
let application

// A packaged app must start even when Node.js is absent from the user's PATH.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['node_options', 'electron_run_as_node'].includes(key.toLowerCase())
  && !(process.platform === 'win32' && key.toLowerCase() === 'path')))
if (process.platform === 'win32') env.PATH = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')

async function launch() {
  application = await electron.launch({
    ...(values.executable ? { executablePath: path.resolve(values.executable) } : {}),
    args: [...(values.executable ? [] : ['.']), `--user-data-dir=${profile}`],
    env,
    timeout: 30_000,
  })
  const page = await application.firstWindow()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url())
  })
  // Reload with listeners attached so startup requests and renderer errors count.
  await page.reload()
  await page.getByRole('button', { name: 'IMPORT LEADS', exact: true }).waitFor()
  return page
}

try {
  let page = await launch()
  assert.equal(page.url(), 'ultralead://app/')
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile)
  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration }
  })
  assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false })
  assert.deepEqual(await page.evaluate(() => ({
    require: typeof window.require, process: typeof window.process, secure: window.isSecureContext,
  })), { require: 'undefined', process: 'undefined', secure: true })
  await page.getByText('SAMPLE DATA', { exact: true }).waitFor()

  await page.getByRole('button', { name: 'IMPORT LEADS', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/PASTE YOUR LEAD LIST/).fill('Desktop Example\tProspect\tConsumer\t5-9001\t9001010000000')
  await dialog.getByRole('button', { name: 'IMPORT LEADS', exact: true }).click()
  await page.getByRole('heading', { name: 'Desktop Example' }).waitFor()
  await page.getByLabel('CUSTOMER NOTES', { exact: true }).fill('Saved offline in the desktop app')
  await page.getByRole('button', { name: 'COPY', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Account number copied.' }).waitFor()
  assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), '5-9001')

  await page.getByRole('button', { name: 'Data & settings', exact: true }).click()
  // Bypass only the OS save dialog, not the app's actual Blob download path.
  await application.evaluate(({ session }, file) => {
    globalThis.backupDownload = new Promise(resolve => {
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(file)
        item.once('done', (_event, state) => resolve(state))
      })
    })
  }, backupFile)
  await page.getByRole('button', { name: 'EXPORT BACKUP', exact: true }).click()
  assert.equal(await application.evaluate(() => globalThis.backupDownload), 'completed')
  const backup = JSON.parse(await readFile(backupFile, 'utf8'))
  assert.equal(backup.isDemo, false)
  assert.equal(backup.profiles['5-9001'].notes, 'Saved offline in the desktop app')

  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.getByLabel('CUSTOMER NOTES', { exact: true }).fill('This change will be replaced')
  await page.getByRole('button', { name: 'Data & settings', exact: true }).click()
  await page.getByLabel('Choose backup file').setInputFiles(backupFile)
  await page.getByRole('dialog').getByRole('button', { name: 'RESTORE BACKUP', exact: true }).click()
  assert.equal(await page.getByLabel('CUSTOMER NOTES', { exact: true }).inputValue(), 'Saved offline in the desktop app')
  assert.equal(await page.evaluate(() => window.open('https://example.invalid')), null)

  // A full restart, not just a React remount, must keep the same workspace.
  await application.close()
  application = null
  page = await launch()
  await page.getByRole('heading', { name: 'Desktop Example' }).waitFor()
  assert.equal(await page.getByLabel('CUSTOMER NOTES', { exact: true }).inputValue(), 'Saved offline in the desktop app')
  assert.equal(await page.getByText('SAMPLE DATA', { exact: true }).count(), 0)
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey)
  assert.equal(saved.leads[0].accountNumber, '5-9001')
  await page.evaluate(() => document.fonts.ready)
  assert.equal(await page.evaluate(() => document.fonts.check('16px "Courier Prime"')), true)
  assert.deepEqual(remoteRequests, [], 'Desktop startup and calling workflow must not request remote resources')
  assert.deepEqual(errors, [], 'Desktop renderer must not throw')
  console.log('Desktop smoke passed: isolated renderer, offline assets, import, clipboard, backup/restore and restart persistence; no Node.js on Windows PATH.')
} finally {
  if (application) await application.close()
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
