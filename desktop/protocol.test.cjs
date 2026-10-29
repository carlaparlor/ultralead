const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises')
const {
  APP_URL, APP_ORIGIN, CONTENT_SECURITY_POLICY,
  isAppUrl, isAppBlob, canWriteClipboard, resolveAsset, createProtocolHandler,
} = require('./protocol.cjs')

const root = path.resolve('a build folder', 'dist')

describe('offline desktop origin', () => {
  it('accepts only the stable application host, not lookalikes or external URLs', () => {
    for (const url of [APP_URL, `${APP_ORIGIN}/assets/desk.js?version=1`, `${APP_URL}#main-content`]) {
      assert.equal(isAppUrl(url), true, url)
    }
    for (const url of ['https://app/', 'file:///app/index.html', 'javascript:alert(1)',
      'ultralead://app.evil.test/', 'ultralead://evil/app', 'ultralead://app:123/',
      'ultralead://user@app/', 'ultralead://app@evil/', 'not a URL', undefined]) {
      assert.equal(isAppUrl(url), false, String(url))
    }
  })

  it('allows local backup blobs but not arbitrary blob origins', () => {
    assert.equal(isAppBlob(`blob:${APP_ORIGIN}/backup-id`), true)
    assert.equal(isAppBlob('blob:https://evil.test/backup-id'), false)
    assert.equal(isAppBlob(APP_URL), false)
    assert.equal(isAppBlob(undefined), false)
  })

  it('permits clipboard writing only, from the local desk', () => {
    const contents = { getURL: () => APP_URL }
    assert.equal(canWriteClipboard(contents, 'clipboard-sanitized-write', APP_ORIGIN), true)
    for (const permission of ['clipboard-read', 'media', 'notifications', 'openExternal', 'unknown']) {
      assert.equal(canWriteClipboard(contents, permission, APP_URL), false)
    }
    assert.equal(canWriteClipboard(null, 'clipboard-sanitized-write', APP_URL), false)
    assert.equal(canWriteClipboard(contents, 'clipboard-sanitized-write', 'https://evil.test'), false)
    assert.equal(canWriteClipboard({ getURL: () => 'https://evil.test' }, 'clipboard-sanitized-write', APP_URL), false)
  })
})

describe('bundled asset resolution', () => {
  it('resolves the root, hashed assets, fonts and URL-encoded filenames', () => {
    assert.equal(resolveAsset(root, APP_URL), path.join(root, 'index.html'))
    assert.equal(resolveAsset(root, `${APP_URL}assets/index-123.js?v=1`), path.join(root, 'assets', 'index-123.js'))
    assert.equal(resolveAsset(root, `${APP_URL}assets/my%20font.woff2`), path.join(root, 'assets', 'my font.woff2'))
  })

  it('rejects encoded traversal, Windows separators, drive letters, ADS and malformed paths', () => {
    for (const suffix of ['..%2f..%2fsecret', '%2e%2e%2fsecret', 'assets%2f..%2fsecret',
      '..%5csecret', 'C:%5cWindows%5cwin.ini', 'assets/index.js:stream', '%00', '%invalid']) {
      assert.equal(resolveAsset(root, `${APP_URL}${suffix}`), null, suffix)
    }
    assert.equal(resolveAsset(root, 'file:///etc/passwd'), null)
    // The URL parser normalizes literal dot segments, but they cannot escape dist.
    assert.equal(resolveAsset(root, `${APP_URL}../../secret`), path.join(root, 'secret'))
  })
})

describe('bundled asset responses', () => {
  it('serves real build files with MIME types and a restrictive CSP, including HEAD', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ultralead-assets-'))
    try {
      await mkdir(path.join(temporary, 'assets'))
      await writeFile(path.join(temporary, 'index.html'), '<div id="root"></div>')
      await writeFile(path.join(temporary, 'assets', 'index.js'), 'export const offline = true')
      await writeFile(path.join(temporary, 'assets', 'font.woff2'), Buffer.from([1, 2, 3]))
      const handle = createProtocolHandler(temporary)
      const response = await handle({ method: 'GET', url: APP_URL })
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type'), /text\/html/)
      assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY)
      assert.match(CONTENT_SECURITY_POLICY, /connect-src 'none'/)
      assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/)
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(await response.text(), '<div id="root"></div>')
      const script = await handle({ method: 'GET', url: `${APP_URL}assets/index.js` })
      assert.match(script.headers.get('content-type'), /text\/javascript/)
      const font = await handle({ method: 'GET', url: `${APP_URL}assets/font.woff2` })
      assert.equal(font.headers.get('content-type'), 'font/woff2')
      const head = await handle({ method: 'HEAD', url: APP_URL })
      assert.equal(head.status, 200)
      assert.equal(await head.text(), '')
      assert.equal((await handle({ method: 'GET', url: `${APP_URL}missing.js` })).status, 404)
      assert.equal((await handle({ method: 'GET', url: 'https://evil.test/' })).status, 403)
      assert.equal((await handle({ method: 'GET', url: `${APP_URL}..%2fsecret` })).status, 403)
      const post = await handle({ method: 'POST', url: APP_URL })
      assert.equal(post.status, 405)
      assert.equal(post.headers.get('allow'), 'GET, HEAD')
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })
})
