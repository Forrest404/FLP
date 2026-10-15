import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Icon, type IconName } from './Icon'

export type MenuEntry =
  | {
      label: string
      icon?: IconName
      iconState?: 'default' | 'active' | 'two-tone'
      hint?: string
      checked?: boolean
      disabled?: boolean
      run?: () => void
      submenu?: MenuEntry[] | (() => MenuEntry[])
    }
  | 'separator'

interface MenuState {
  open: { items: MenuEntry[]; x: number; y: number } | null
  show(items: MenuEntry[], x: number, y: number): void
  close(): void
}

export const useMenu = create<MenuState>((set) => ({
  open: null,
  show: (items, x, y) => set({ open: { items, x, y } }),
  close: () => set({ open: null })
}))

/** Opens a menu at the mouse position (for onContextMenu) or under an element. */
export function openMenu(items: MenuEntry[], at: { clientX: number; clientY: number } | HTMLElement) {
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect()
    useMenu.getState().show(items, r.left, r.bottom + 6)
  } else {
    useMenu.getState().show(items, at.clientX, at.clientY)
  }
}

function MenuPanel({ items, x, y, altX, depth, onDone, onBack, autoFocus }: {
  items: MenuEntry[]
  x: number
  y: number
  /** Where a submenu goes if it doesn't fit to the right (left edge of its parent). */
  altX?: number
  depth: number
  onDone(): void
  /** Closes this submenu (← key). */
  onBack?(): void
  /** Focus the first item on open (keyboard navigation). */
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [sub, setSub] = useState<{ index: number; x: number; altX: number; y: number; keyboard?: boolean } | null>(null)

  const enabledItems = () => [...(ref.current?.querySelectorAll<HTMLElement>(':scope > .ui-menu__item:not([aria-disabled="true"])') ?? [])]
  useEffect(() => {
    if (autoFocus) enabledItems()[0]?.focus()
  }, [autoFocus])

  // Keyboard: ↑/↓ move, Enter/Space choose, → opens a submenu, ← goes back.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = enabledItems()
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length
      list[next]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      ;(document.activeElement as HTMLElement)?.click()
    } else if (e.key === 'ArrowRight') {
      const el = document.activeElement as HTMLElement
      const idx = Number(el?.dataset.index)
      const entry = items[idx]
      if (entry && entry !== 'separator' && entry.submenu) openSub(idx, el, true)
    } else if (e.key === 'ArrowLeft' && onBack) {
      onBack()
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect()
    const overflowX = x + r.width > window.innerWidth - 8
    const nx = !overflowX ? x : altX !== undefined ? altX - r.width : window.innerWidth - r.width - 8
    const ny = y + r.height > window.innerHeight - 8 ? window.innerHeight - r.height - 8 : y
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) })
  }, [x, y, altX])

  const openSub = (i: number, el: HTMLElement, keyboard = false) => {
    const r = el.getBoundingClientRect()
    setSub({ index: i, x: r.right + 4, altX: r.left - 4, y: r.top - 6, keyboard })
  }

  const subEntry = sub ? items[sub.index] : null
  const subItems = subEntry && subEntry !== 'separator' && subEntry.submenu
    ? typeof subEntry.submenu === 'function' ? subEntry.submenu() : subEntry.submenu
    : null

  return (
    <>
      <div ref={ref} className="ui-menu" role="menu" style={{ left: pos.x, top: pos.y, zIndex: 1000 + depth }} onKeyDown={onKeyDown}>
        {items.map((it, i) =>
          it === 'separator' ? (
            <div key={i} className="ui-menu__sep" />
          ) : (
            <div
              key={i}
              role="menuitem"
              className="ui-menu__item"
              tabIndex={-1}
              data-index={i}
              aria-disabled={it.disabled}
              aria-haspopup={it.submenu ? 'menu' : undefined}
              data-open={sub?.index === i}
              onMouseEnter={(e) => (it.submenu ? openSub(i, e.currentTarget) : setSub(null))}
              onClick={(e) => {
                if (it.submenu) return openSub(i, e.currentTarget)
                onDone()
                it.run?.()
              }}
            >
              {it.checked !== undefined && !it.icon ? (
                <span className="ui-menu__check">{it.checked && <Icon name="check" size={20} state="active" />}</span>
              ) : it.icon ? (
                <Icon name={it.icon} size={22} state={it.iconState ?? 'two-tone'} />
              ) : null}
              <span className="ui-menu__label">{it.label}</span>
              {it.hint && <span className="ui-menu__hint">{it.hint}</span>}
              {it.checked && it.icon && <Icon name="check" size={20} state="active" />}
              {it.submenu && <Icon name="chevron-right" size={18} />}
            </div>
          )
        )}
      </div>
      {sub && subItems && (
        <MenuPanel
          items={subItems}
          x={sub.x}
          y={sub.y}
          altX={sub.altX}
          depth={depth + 1}
          onDone={onDone}
          autoFocus={sub.keyboard}
          onBack={() => {
            const index = sub.index
            setSub(null)
            ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus()
          }}
        />
      )}
    </>
  )
}

/** Mount once at the app root. */
export function MenuHost() {
  const { open, close } = useMenu()
  useEffect(() => {
    if (!open) return
    // Capture phase + preventDefault so Escape only closes the menu (not fullscreen, dialogs…).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('.ui-menu')) return
      close()
      // The click that follows only dismisses the menu; it mustn't reach what's underneath (clicking the video pauses).
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, true)
      // Disarm right after this press's mouseup (its click, if any, is dispatched before the timeout runs).
      window.addEventListener('mouseup', () => setTimeout(() => window.removeEventListener('click', swallow, true)), { capture: true, once: true })
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', close)
    }
  }, [open, close])
  if (!open) return null
  return <MenuPanel key={`${open.x},${open.y}`} items={open.items} x={open.x} y={open.y} depth={0} onDone={close} autoFocus />
}
