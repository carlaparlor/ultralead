/** Prices are stored as integer cents, never floating-point rands. */
export const MAX_PACKAGE_PRICE_CENTS = 9_999_999_999

export function isPackagePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PACKAGE_PRICE_CENTS
}

/** Accept a decimal point or comma, but not grouping separators or fractions of a cent. */
export function parsePriceCents(input: string): number | null {
  const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return isPackagePrice(cents) ? cents : null
}

export function referralRewardCents(priceCents: number): number | null {
  if (!isPackagePrice(priceCents)) return null
  return priceCents <= 20_000 ? 2_000 : 3_000
}

export function formatRand(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `R${whole}.${String(cents % 100).padStart(2, '0')}`
}

export function priceInputValue(cents: number | null): string {
  return cents === null ? '' : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}
