import { beforeEach, describe, expect, it } from 'vitest'
import { AUTH_STORAGE_KEY, emptyAuthState, hashCode, loadAuthState, saveAuthState, verifyCode } from './auth'

describe('desk lock', () => {
  beforeEach(() => localStorage.clear())

  it('starts unlocked with no code configured', () => {
    expect(emptyAuthState()).toMatchObject({ locked: false, lockOnStartup: false, unlockCodeHash: null })
  })

  it('hashes a code and verifies it', async () => {
    const hash = await hashCode('correct-horse-battery-staple')
    expect(hash).toHaveLength(64)
    expect(await verifyCode('correct-horse-battery-staple', hash)).toBe(true)
    expect(await verifyCode('correct-horse-battery-staple ', hash)).toBe(true)
    expect(await verifyCode('wrong code', hash)).toBe(false)
  })

  it('round-trips auth state through localStorage', () => {
    const state = { ...emptyAuthState(), locked: true, lockOnStartup: true, unlockCodeHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }
    saveAuthState(state)
    expect(loadAuthState()).toEqual(state)
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual(state)
  })

  it('ignores corrupt storage instead of locking the desk', () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{corrupt')
    expect(loadAuthState()).toEqual(emptyAuthState())
  })

  it('ignores storage with the wrong shape', () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ version: 1, locked: 'yes' }))
    expect(loadAuthState()).toEqual(emptyAuthState())
  })

  it('does not lock anyone out when storage cannot be written', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: () => null, setItem: () => { throw new Error('quota') } },
      configurable: true,
    })
    try {
      expect(() => saveAuthState({ ...emptyAuthState(), locked: true })).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', original)
    }
  })
})
