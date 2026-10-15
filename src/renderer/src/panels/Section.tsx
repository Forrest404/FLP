import { useState, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'

/** Collapsible group used in the effects sidebar (Figma "Expand / Collapse Settings"). */
export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="flp-section" data-open={open}>
      <div className="flp-section__head">
        <button type="button" className="flp-section__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>{title}</span>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={18} />
        </button>
        {aside && <span className="flp-section__aside">{aside}</span>}
      </div>
      {open && <div className="flp-section__body">{children}</div>}
    </section>
  )
}
