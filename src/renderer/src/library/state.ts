import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { MusicView, ScanStatus, SortKey } from '@shared/library'
import { setUi, useSettings } from '@/state/settings'
import { useUi, type LibrarySection } from '@/state/ui'

interface Location {
  dir: string | null
  /** Music: Songs/Albums/Artists/Genres tab (part of history, so Back restores the right grouping). */
  musicView?: MusicView
  /** Music: albums/artists/genres group being viewed. */
  group?: string | null
  /** Browse every kind of media here (a Home folder may hold music), not just the section's own. */
  allKinds?: boolean
  /** Playlists: open playlist id. */
  playlist?: number | null
}

interface NavState {
  history: Record<LibrarySection, { stack: Location[]; index: number }>
  search: string
  version: number
  status: ScanStatus | null
}

const start = (): { stack: Location[]; index: number } => ({ stack: [{ dir: null }], index: 0 })

export const useLibrary = create<NavState>(() => ({
  history: { home: start(), videos: start(), music: start(), network: start(), playlists: start(), recent: start() },
  search: '',
  version: 0,
  status: null
}))

window.flp.library.onChanged(() => useLibrary.setState((s) => ({ version: s.version + 1 })))
window.flp.library.onStatus((status) => useLibrary.setState({ status }))
window.flp.library.status().then((status) => useLibrary.setState({ status }))

export function useLocation(): Location {
  const section = useUi((s) => s.section)
  return useLibrary((s) => {
    const h = s.history[section]
    return h.stack[h.index]
  })
}

export const nav = {
  go(loc: Location) {
    const section = useUi.getState().section
    useLibrary.setState((s) => {
      const h = s.history[section]
      const stack = [...h.stack.slice(0, h.index + 1), loc]
      return { search: '', history: { ...s.history, [section]: { stack, index: stack.length - 1 } } }
    })
  },
  back() {
    const section = useUi.getState().section
    useLibrary.setState((s) => {
      const h = s.history[section]
      return { history: { ...s.history, [section]: { ...h, index: Math.max(0, h.index - 1) } } }
    })
  },
  forward() {
    const section = useUi.getState().section
    useLibrary.setState((s) => {
      const h = s.history[section]
      return { history: { ...s.history, [section]: { ...h, index: Math.min(h.stack.length - 1, h.index + 1) } } }
    })
  },
  canBack: () => {
    const h = useLibrary.getState().history[useUi.getState().section]
    return h.index > 0
  },
  canForward: () => {
    const h = useLibrary.getState().history[useUi.getState().section]
    return h.index < h.stack.length - 1
  }
}

const NO_PREFS = {}

/** Sort and grid/list choice are remembered per section. */
export function useViewPrefs(): { sort: SortKey; mode: 'grid' | 'list'; setSort(k: SortKey): void; setMode(m: 'grid' | 'list'): void } {
  const section = useUi((s) => s.section)
  const prefs = useSettings((s) => (s.ui.libraryPrefs as Record<string, { sort?: SortKey; mode?: 'grid' | 'list' }>) ?? NO_PREFS)
  const mine = prefs[section] ?? {}
  const save = (patch: object) => setUi('libraryPrefs', { ...prefs, [section]: { ...mine, ...patch } })
  return {
    sort: mine.sort ?? (section === 'music' ? 'artist' : 'name'),
    mode: mine.mode ?? (section === 'music' || section === 'recent' ? 'list' : 'grid'),
    setSort: (sort) => save({ sort }),
    setMode: (mode) => save({ mode })
  }
}

/** Fetches library data and refetches whenever the library changes. */
export function useLibraryData<T>(fetch: () => Promise<T>, deps: unknown[]): T | null {
  const version = useLibrary((s) => s.version)
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    fetch().then((d) => alive && setData(d))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps])
  return data
}
