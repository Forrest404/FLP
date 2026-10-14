import { useEffect, type ReactNode } from 'react'
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="ui-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
