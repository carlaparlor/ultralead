const { app, BrowserWindow, dialog, Menu, protocol, session } = require('electron')
const { mkdirSync } = require('node:fs')
const path = require('node:path')
const {
  APP_SCHEME, APP_URL, isAppUrl, isAppBlob, canWriteClipboard, createProtocolHandler,
} = require('./protocol.cjs')

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

app.setName('ultralead+')
if (process.platform === 'win32') app.setAppUserModelId('com.ultralead.plus')

// Neither an upgrade nor the portable EXE's temporary extraction directory may
// change this location. --user-data-dir is useful for isolated acceptance tests.
const userData = app.commandLine.getSwitchValue('user-data-dir')
  || path.join(app.getPath('appData'), 'ultralead-plus')
mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)
app.setPath('sessionData', userData)

let mainWindow = null

function showWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function startupFailed(error) {
  console.error('Desktop startup failed:', error)
  dialog.showErrorBox('ultralead+ could not start',
    'Please close and reopen ultralead+. If this continues, reinstall the app. Your saved workspace is kept separately from the installation.')
  app.quit()
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'ultralead+',
    width: 1440,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#171918',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false, // No dictionary downloads: the desktop app is fully offline.
    },
  })
  const window = mainWindow
  window.once('ready-to-show', showWindow)
  window.on('closed', () => { mainWindow = null })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const guardNavigation = event => { if (!isAppUrl(event.url)) event.preventDefault() }
  window.webContents.on('will-navigate', guardNavigation)
  window.webContents.on('will-frame-navigate', guardNavigation)
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  await window.loadURL(APP_URL)
}

function configureSession() {
  const localSession = session.defaultSession
  protocol.handle(APP_SCHEME, createProtocolHandler(path.join(__dirname, '..', 'dist')))
  localSession.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    canWriteClipboard(contents, permission, requestingOrigin))
  localSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(canWriteClipboard(contents, permission, details.requestingUrl)))
  // No remote pages, analytics, update servers or external protocols are needed.
  localSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAppUrl(details.url) && !isAppBlob(details.url) && !details.url.startsWith('data:') })
  })
  localSession.on('will-download', (event, item, contents) => {
    if (!contents || !isAppUrl(contents.getURL()) || !isAppBlob(item.getURL())) {
      event.preventDefault()
      return
    }
    item.setSaveDialogOptions({
      title: 'Save ultralead+ backup',
      defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())),
      filters: [{ name: 'JSON backup', extensions: ['json'] }],
      buttonLabel: 'Save backup',
    })
    item.once('done', (_event, state) => {
      if (state === 'interrupted') {
        dialog.showErrorBox('Backup could not be saved',
          'Please export your backup again and choose a writable folder with enough free space.')
      }
    })
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch(startupFailed)
    else showWindow()
  })
  app.whenReady().then(async () => {
    configureSession()
    app.setAboutPanelOptions({
      applicationName: 'ultralead+',
      applicationVersion: app.getVersion(),
      copyright: 'A local-first calling workspace. No account or internet connection required.',
    })
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'File', submenu: [{ role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: 'Help', submenu: [{ label: 'About ultralead+', click: () => app.showAboutPanel() }] },
    ]))
    await createWindow()
  }).catch(startupFailed)
}
