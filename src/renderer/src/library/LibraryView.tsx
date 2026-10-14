import { Icon } from '@/components/Icon'
import { openMenu } from '@/components/Menu'
import { ui, useUi } from '@/state/ui'
import { SECTIONS, addMenu } from '@/player/Sidebar'
import { LibraryPanel } from './LibraryPanel'

/** Full-window library (Figma library frames): labelled sidebar + content. */
export function LibraryView() {
  const section = useUi((s) => s.section)
  return (
    <div className="flp-library">
      <nav className="flp-libnav">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="flp-libnav__item" aria-pressed={section === s.id} onClick={() => ui.set({ section: s.id })}>
            <Icon name={s.icon} size={20} state={section === s.id ? 'active' : 'default'} filled={section === s.id && s.id === 'home'} />
            {s.label}
          </button>
        ))}
        <button type="button" className="flp-libnav__item" onClick={(e) => openMenu(addMenu(), e.currentTarget)}>
          <Icon name="add" size={20} />
          Add item
        </button>
      </nav>
      <main className="flp-libmain">
        <LibraryPanel />
      </main>
    </div>
  )
}
