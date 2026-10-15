// ⌘K: search every action and every setting by name. The fix for VLC's buried tools.
import { useEffect, useMemo, useRef, useState } from 'react'
import { SETTINGS, PAGES } from '@shared/settings-schema'
import { formatKey, runCommand, useCommands } from '@/commands/registry'
import { keysFor } from '@/commands/keys'
import { ui, useUi } from '@/state/ui'
import { Icon, type IconName } from './Icon'

interface Hit {
  id: string
  title: string
  subtitle: string
  icon: IconName
  hint?: string
  run(): void
  score: number
}

function score(query: string, text: string): number {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  if (!q) return 1
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  const words = t.split(/[^a-z0-9]+/)
  if (words.some((w) => w.startsWith(q))) return 60
  if (t.includes(q)) return 40
  // All query words appear somewhere.
  const parts = q.split(/\s+/)
  if (parts.every((p) => t.includes(p))) return 30
  return 0
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const commands = useCommands((s) => s.commands)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setTimeout(() => input.current?.focus(), 0)
    }
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const out: Hit[] = []
    for (const c of Object.values(commands)) {
      // Hidden, or not available right now (e.g. developer tools without developer mode).
      if (c.hidden || (c.enabled && !c.enabled())) continue
      const s = Math.max(score(query, c.title), ...(c.keywords ?? []).map((k) => score(query, k) * 0.8), score(query, c.category) * 0.5)
      if (s <= 0) continue
      const key = keysFor(c)[0]
      out.push({ id: c.id, title: c.title, subtitle: c.category, icon: c.icon ?? 'wrench', hint: key ? formatKey(key) : undefined, run: () => void runCommand(c.id), score: s + 5 })
    }
    if (query.trim()) {
      for (const st of SETTINGS) {
        const s = Math.max(score(query, st.label), ...(st.keywords ?? []).map((k) => score(query, k) * 0.8), score(query, st.section) * 0.4)
        if (s <= 0) continue
        const page = PAGES.find((p) => p.id === st.page)!
        out.push({
          id: `setting:${st.key}`,
          title: st.label,
          subtitle: `Setting · ${page.nav} › ${st.section}`,
          icon: 'settings',
          run: () => {
            ui.openSettings(st.page)
            setTimeout(() => window.dispatchEvent(new CustomEvent('flp:highlight-setting', { detail: st.key })), 50)
          },
          score: s
        })
      }
    }
    return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 60)
  }, [commands, query, open])

  if (!open) return null

  const choose = (h?: Hit) => {
    if (!h) return
    ui.set({ paletteOpen: false })
    h.run()
  }

  return (
    <div className="ui-backdrop flp-palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && ui.set({ paletteOpen: false })}>
      <div className="flp-palette" role="dialog" aria-label="Find any action or setting" data-capture-keys>
        <div className="flp-palette__search">
          <Icon name="search" size={20} />
          <input
            ref={input}
            value={query}
            placeholder="Find any action or setting…"
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setIndex(Math.min(hits.length - 1, index + 1))
              else if (e.key === 'ArrowUp') setIndex(Math.max(0, index - 1))
              else if (e.key === 'Enter') choose(hits[index])
              else if (e.key === 'Escape') ui.set({ paletteOpen: false })
              else return
              e.preventDefault()
            }}
          />
        </div>
        <ul className="flp-palette__list">
          {hits.map((h, i) => (
            <li key={h.id} data-active={i === index} onMouseEnter={() => setIndex(i)} onClick={() => choose(h)}>
              <Icon name={h.icon} size={20} state={i === index ? 'active' : 'default'} />
              <span className="flp-palette__title">{h.title}</span>
              <span className="flp-palette__sub">{h.subtitle}</span>
              {h.hint && <kbd>{h.hint}</kbd>}
            </li>
          ))}
          {!hits.length && <li className="flp-palette__none">Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  )
}
