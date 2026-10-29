const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { access, readFile } = require('node:fs/promises')
const { getConfig, validateConfiguration } = require('app-builder-lib/out/util/config/config')
const { DebugLogger } = require('builder-util')

const project = path.join(__dirname, '..')
let config

before(async () => { config = await getConfig(project) })

describe('Windows packaging contract', () => {
  it('uses a valid electron-builder configuration', async () => {
    await validateConfiguration(config, new DebugLogger())
    const metadata = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
    assert.equal(metadata.main, 'desktop/main.cjs')
    assert.ok(metadata.devDependencies.electron)
    assert.ok(!metadata.dependencies.electron, 'Electron must be bundled by the packager, not installed by end users')
    await access(path.join(project, metadata.main))
    await access(path.join(project, config.win.icon))
  })

  it('builds a full offline installer and portable executable, not a web bootstrapper', () => {
    assert.deepEqual(config.win.target, [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ])
    assert.equal(config.asar, true)
    const files = config.files.flatMap(file => file.filter || [])
    assert.ok(files.includes('dist/**/*'))
    assert.ok(files.includes('desktop/main.cjs'))
    assert.ok(files.includes('desktop/protocol.cjs'))
    assert.equal(config.publish, null, 'Do not publish untested packages from a developer build')
    assert.match(config.nsis.artifactName, /^ultralead-plus-Setup-/)
    assert.match(config.portable.artifactName, /^ultralead-plus-Portable-/)
  })

  it('installs in one click for the current user without elevation', () => {
    assert.equal(config.nsis.oneClick, true)
    assert.equal(config.nsis.perMachine, false)
    assert.equal(config.nsis.allowElevation, false)
    assert.equal(config.win.requestedExecutionLevel, 'asInvoker')
    assert.equal(config.portable.requestExecutionLevel, 'user')
    assert.equal(config.nsis.createDesktopShortcut, true)
    assert.equal(config.nsis.createStartMenuShortcut, true)
    assert.equal(config.nsis.runAfterFinish, true)
  })

  it('keeps application identity and saved data stable across upgrades/uninstalls', () => {
    assert.equal(config.appId, 'com.ultralead.plus')
    assert.equal(config.win.executableName, 'ultralead-plus')
    assert.equal(config.nsis.deleteAppDataOnUninstall, false)
  })
})
