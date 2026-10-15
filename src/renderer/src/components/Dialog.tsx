import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useUi } from '@/state/ui'
import { IconButton } from './controls'

export function Dialog({ title, width, height, onClose, footer, children, head }: {
  title?: ReactNode
  width?: number
  height?: number
  onClose(): void
  footer?: ReactNode
  /** Replaces the default header (used by Settings, whose header holds a search field). */
  head?: ReactNode
  children: ReactNode
}) {
  const backdrop = useRef<HTMLDivElement>(null)
  useEscapeToClose(backdrop, onClose)

  return (
    <div ref={backdrop} className="ui-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-dialog" role="dialog" aria-modal style={{ width, height }}>
        {head ?? (
          <div className="ui-dialog__head">
            <span className="ui-dialog__title">{title}</span>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
        )}
        <div className="ui-dialog__body">{children}</div>
        {footer && <div className="ui-dialog__foot">{footer}</div>}
      </div>
    </div>
  )
}

/** Escape closes the dialog whose backdrop is `backdrop`, if it's the topmost one and nothing else wants Escape. */
export function useEscapeToClose(backdrop: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Already used (e.g. the palette closed itself).
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Only the topmost dialog closes (a confirmation can sit over another dialog).
      const all = document.querySelectorAll('.ui-backdrop')
      if (all[all.length - 1] !== backdrop.current) return
      // Let a focused key recorder or an open palette/menu handle Escape first.
      if ((e.target as Element | null)?.closest?.('[data-capture-keys]') || useUi.getState().paletteOpen || document.querySelector('.ui-menu')) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [backdrop, onClose])
}
