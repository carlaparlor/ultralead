import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import App from './App'

// jsdom has no layout or canvas, so colour contrast is checked separately in a real browser.
async function checkAccessibility() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  expect(result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))).toEqual([])
}

beforeEach(() => localStorage.clear())

describe('accessibility smoke checks', () => {
  it('has no detectable violations on the calling desk', async () => {
    render(<App />)
    await checkAccessibility()
  })
  it('keeps the insights page accessible', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Insights/ }))
    await checkAccessibility()
  })
  it('keeps the import dialog accessible', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'IMPORT LEADS' }))
    await checkAccessibility()
  })
})
