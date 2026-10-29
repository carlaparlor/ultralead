const { it } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { readFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { APP_URL, APP_ORIGIN } = require('./protocol.cjs')

// Exercise the real entry point without a display, native runtime or disk writes.
async function boot({ ownsLock = true, profile = '' } = {}) {
  const state = { windows: [], paths: {}, quits: 0, errors: [] }
  const app = Object.assign(new EventEmitter(), {
    setName() {}, setAppUserModelId() {}, setAboutPanelOptions() {}, showAboutPanel() {},
    getVersion: () => '1.0.0',
    getPath: name => state.paths[name] || path.join(os.tmpdir(), name),
    setPath: (name, value) => { state.paths[name] = value },
    commandLine: { getSwitchValue: () => profile },
    requestSingleInstanceLock: () => ownsLock,
    whenReady: () => Promise.resolve(),
    quit: () => { state.quits++ },
  })
  class BrowserWindow extends EventEmitter {
    static getAllWindows() { return state.windows }
    constructor(options) {
      super()
      this.options = options
      this.webContents = Object.assign(new EventEmitter(), {
        getURL: () => this.url,
        setWindowOpenHandler: handler => { this.openHandler = handler },
      })
      this.restores = 0
      this.focuses = 0
      state.windows.push(this)
    }
    isMinimized() { return true }
    restore() { this.restores++ }
    show() {}
    focus() { this.focuses++ }
    async loadURL(url) { this.url = url; this.emit('ready-to-show') }
  }
  const localSession = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: handler => { state.checkPermission = handler },
    setPermissionRequestHandler: handler => { state.requestPermission = handler },
    webRequest: { onBeforeRequest: handler => { state.beforeRequest = handler } },
  })
  const electron = {
    app, BrowserWindow, session: { defaultSession: localSession },
    dialog: { showErrorBox: (...args) => state.errors.push(args) },
    protocol: {
      registerSchemesAsPrivileged: schemes => { state.schemes = schemes },
      handle: (scheme, handler) => { state.protocol = { scheme, handler } },
    },
    Menu: {
      buildFromTemplate: template => template,
      setApplicationMenu: menu => { state.menu = menu },
    },
  }
  vm.runInNewContext(await readFile(path.join(__dirname, 'main.cjs'), 'utf8'), {
    __dirname, process: { platform: 'win32' }, console,
    require: name => {
      if (name === 'electron') return electron
      if (name === 'node:fs') return { mkdirSync() {} }
      return require(name)
    },
  }, { filename: 'desktop/main.cjs' })
  await new Promise(setImmediate)
  assert.deepEqual(state.errors, [])
  return { ...state, app, localSession }
}

it('boots the real entry point with a secure CORS-capable origin and isolated renderer', async () => {
  const state = await boot()
  assert.equal(state.schemes[0].scheme, 'ultralead')
  for (const privilege of ['standard', 'secure', 'supportFetchAPI', 'corsEnabled']) {
    assert.equal(state.schemes[0].privileges[privilege], true, privilege)
  }
  assert.equal(state.protocol.scheme, 'ultralead')
  assert.equal(typeof state.protocol.handler, 'function')
  const window = state.windows[0]
  assert.equal(window.url, APP_URL)
  const preferences = window.options.webPreferences
  assert.equal(preferences.sandbox, true)
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.nodeIntegration, false)
  assert.equal(preferences.webSecurity, true)
  assert.equal(preferences.allowRunningInsecureContent, false)
  assert.equal(preferences.spellcheck, false)
  assert.equal(preferences.preload, undefined)
  assert.ok(state.menu.some(item => item.role === 'editMenu'), 'Keep native copy/paste keyboard shortcuts')
  assert.equal(state.paths.userData, path.join(os.tmpdir(), 'appData', 'ultralead-plus'))
  assert.equal(state.paths.sessionData, state.paths.userData)
})

it('blocks remote requests/navigation/popups and grants only local clipboard writes', async () => {
  const state = await boot()
  const contents = state.windows[0].webContents
  for (const [url, cancel] of [[APP_URL, false], [`blob:${APP_ORIGIN}/id`, false],
    ['https://evil.test/', true], ['file:///private.txt', true], ['mailto:test@example.invalid', true]]) {
    state.beforeRequest({ url }, result => assert.equal(result.cancel, cancel, url))
  }
  for (const name of ['will-navigate', 'will-frame-navigate']) {
    let blocked = false
    contents.emit(name, { url: 'https://evil.test', preventDefault: () => { blocked = true } })
    assert.equal(blocked, true, name)
    contents.emit(name, { url: APP_URL, preventDefault: () => assert.fail('Local navigation was blocked') })
  }
  assert.equal(state.windows[0].openHandler().action, 'deny')
  assert.equal(state.checkPermission(contents, 'clipboard-sanitized-write', APP_ORIGIN), true)
  assert.equal(state.checkPermission(contents, 'clipboard-read', APP_ORIGIN), false)
  state.requestPermission(contents, 'media', granted => assert.equal(granted, false), { requestingUrl: APP_URL })
  state.requestPermission(contents, 'clipboard-sanitized-write', granted => assert.equal(granted, true), { requestingUrl: APP_URL })
})

it('uses a native backup save dialog only for a blob created by the trusted desk', async () => {
  const { localSession, windows } = await boot()
  const item = Object.assign(new EventEmitter(), {
    getURL: () => `blob:${APP_ORIGIN}/backup`, getFilename: () => 'backup.json',
    setSaveDialogOptions: options => {
      assert.equal(options.title, 'Save ultralead+ backup')
      assert.equal(options.defaultPath, path.join(os.tmpdir(), 'downloads', 'backup.json'))
      assert.equal(options.filters[0].extensions[0], 'json')
    },
  })
  localSession.emit('will-download', { preventDefault: () => assert.fail('Local backup was blocked') }, item, windows[0].webContents)
  let blocked = false
  localSession.emit('will-download', { preventDefault: () => { blocked = true } }, item, { getURL: () => 'https://evil.test' })
  assert.equal(blocked, true)
})

it('prevents duplicate instances and supports isolated profiles for native tests', async () => {
  const duplicate = await boot({ ownsLock: false })
  assert.equal(duplicate.windows.length, 0)
  assert.equal(duplicate.quits, 1)
  const profile = path.join(os.tmpdir(), 'isolated workspace')
  const state = await boot({ profile })
  assert.equal(state.paths.userData, profile)
  assert.equal(state.paths.sessionData, profile)
  const window = state.windows[0]
  const focuses = window.focuses
  state.app.emit('second-instance')
  assert.equal(state.windows.length, 1)
  assert.equal(window.focuses, focuses + 1)
  assert.ok(window.restores > 0)
})
