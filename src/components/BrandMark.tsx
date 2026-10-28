/** The ultralead+ mark: a light tile with an optically centred plus. */
export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" focusable="false">
      <path d="M16 6.5v19M6.5 16h19" stroke="currentColor" strokeWidth="3.4" />
    </svg>
  </span>
}

/** Plus for the wordmark — drawn, not typed, so it centres on the text. */
export function BrandPlus() {
  return <svg className="brand-plus" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
    <path d="M6 1.1v9.8M1.1 6h9.8" stroke="currentColor" strokeWidth="2" />
  </svg>
}
