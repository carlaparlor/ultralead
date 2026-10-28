import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

describe('clipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'clipboard')
  })
  it('uses the modern clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await copyText('5-123')
    expect(writeText).toHaveBeenCalledWith('5-123')
  })
  it('falls back to a temporary selection if permission is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    await copyText('5-123')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).not.toBeInTheDocument()
  })
  it('reports failure if both mechanisms are unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
    await expect(copyText('5-123')).rejects.toThrow('Clipboard unavailable')
    expect(document.querySelector('textarea')).not.toBeInTheDocument()
  })
})
