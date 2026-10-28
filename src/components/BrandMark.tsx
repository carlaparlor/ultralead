/** The ultralead mark: a light tile with a centred U. */
export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" focusable="false">
      <path d="M8.5 8v8.5a7.5 7.5 0 0 0 15 0V8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  </span>
}

/** Plus for the wordmark — drawn, not typed, so it centres on the text. */
export function BrandPlus() {
  return <svg className="brand-plus" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
    <path d="M6 1.1v9.8M1.1 6h9.8" stroke="currentColor" strokeWidth="2" />
  </svg>
}
