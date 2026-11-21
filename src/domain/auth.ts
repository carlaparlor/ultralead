export const AUTH_STORAGE_KEY = 'ultralead-plus.auth.v1'

export interface AuthState {
  version: 1
  /** The calling desk is locked and unusable until unlocked. */
  locked: boolean
  /** Lock again whenever the app is opened. */
  lockOnStartup: boolean
  /** SHA-256 of the unlock code; null when no unlock code is configured. */
  unlockCodeHash: string | null
}

export function emptyAuthState(): AuthState {
  return { version: 1, locked: false, lockOnStartup: false, unlockCodeHash: null }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'

const hex = (bytes: Uint8Array): string =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

/** Hash an unlock code so the plain code is never persisted. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim()))
  return hex(new Uint8Array(digest))
}

export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return (await hashCode(code)) === hash
}

const HASH_PATTERN = /^[0-9a-f]{64}$/

const isAuthState = (value: unknown): value is AuthState =>
  isObject(value) && value.version === 1 && typeof value.locked === 'boolean'
  && typeof value.lockOnStartup === 'boolean'
  && (value.unlockCodeHash === null || (isString(value.unlockCodeHash) && HASH_PATTERN.test(value.unlockCodeHash)))

/** Read the persisted auth state, falling back to an unlocked desk. */
export function loadAuthState(): AuthState {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw === null) return emptyAuthState()
    const parsed = JSON.parse(raw)
    return isAuthState(parsed) ? parsed : emptyAuthState()
  } catch {
    return emptyAuthState()
  }
}

/**
 * Persist auth state. Fails silently when storage is full: a lock that cannot
 * be saved must not lock anyone out.
 */
export function saveAuthState(state: AuthState): void {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
  } catch { /* the desk stays unlocked if its lock cannot be persisted */ }
}
