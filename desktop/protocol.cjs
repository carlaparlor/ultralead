const path = require('node:path')
const { readFile } = require('node:fs/promises')

// Keep this origin stable: Chromium scopes the saved workspace to it.
const APP_SCHEME = 'ultralead'
const APP_ORIGIN = `${APP_SCHEME}://app`
const APP_URL = `${APP_ORIGIN}/`

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function isAppUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === `${APP_SCHEME}:` && url.hostname === 'app'
      && !url.port && !url.username && !url.password
  } catch {
    return false
  }
}

function isAppBlob(value) {
  return typeof value === 'string' && value.startsWith('blob:') && isAppUrl(value.slice(5))
}

function canWriteClipboard(webContents, permission, requestingUrl) {
  return permission === 'clipboard-sanitized-write' && !!webContents
    && isAppUrl(webContents.getURL()) && isAppUrl(requestingUrl)
}

/** Resolve only bundled assets, including on Windows (drive letters, ADS and backslashes). */
function resolveAsset(root, value) {
  if (!isAppUrl(value)) return null
  try {
    const pathname = decodeURIComponent(new URL(value).pathname)
    if (/[\\:\x00]/.test(pathname)) return null
    const segments = pathname.split('/').filter(Boolean)
    if (segments.some(segment => segment === '..' || segment === '.')) return null
    const file = path.resolve(root, ...(segments.length ? segments : ['index.html']))
    const relative = path.relative(path.resolve(root), file)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null
    return file
  } catch {
    return null
  }
}

function createProtocolHandler(root) {
  return async request => {
    const headers = {
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } })
    }
    const file = resolveAsset(root, request.url)
    if (!file) return new Response(null, { status: 403, headers })
    try {
      const body = await readFile(file)
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { ...headers, 'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream' },
      })
    } catch (error) {
      const status = ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) ? 404 : 500
      return new Response(null, { status, headers })
    }
  }
}

module.exports = {
  APP_SCHEME, APP_ORIGIN, APP_URL, CONTENT_SECURITY_POLICY,
  isAppUrl, isAppBlob, canWriteClipboard, resolveAsset, createProtocolHandler,
}
