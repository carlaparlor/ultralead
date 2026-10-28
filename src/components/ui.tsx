import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const titleId = useId()
  const container = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = container.current
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button')
    first?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab' || !panel) return
      const elements = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]')]
        .filter(element => !element.hasAttribute('hidden'))
      if (!elements.length) return
      const firstElement = elements[0]
      const lastElement = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === firstElement) { event.preventDefault(); lastElement.focus() }
      else if (!event.shiftKey && document.activeElement === lastElement) { event.preventDefault(); firstElement.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={container}>
        <div className="modal-header">
          <div>{eyebrow && <div className="eyebrow modal-eyebrow">{eyebrow}</div>}<h2 id={titleId}>{title}</h2></div>
          <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>, document.body,
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
}

export function Initials({ name, className = '' }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('')
  return <span className={`initials ${className}`} aria-hidden="true">{initials || '—'}</span>
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-symbol" aria-hidden="true">+</div><h3>{title}</h3><p>{children}</p>{action}</div>
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'muted' | 'warning' }) {
  return <span className={`status-pill status-${tone}`}><span className="status-dot" />{children}</span>
}
