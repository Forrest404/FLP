import { create } from 'zustand'
import { DEFAULT_LAYOUT, type LayoutZone } from './items'

export type Layout = Record<LayoutZone, string[]>

/** While Customize Player is open, the bars render (and edit) this draft. */
export const useCustomize = create<{ draft: Layout | null; dragging: { id: string; from: LayoutZone | 'palette'; index: number } | null }>(() => ({
  draft: null,
  dragging: null
}))

export const customize = {
  start(current: Partial<Layout>) {
    useCustomize.setState({ draft: { ...DEFAULT_LAYOUT, ...current } as Layout })
  },
  stop() {
    useCustomize.setState({ draft: null, dragging: null })
  },
  reset() {
    useCustomize.setState({ draft: { ...DEFAULT_LAYOUT } })
  },
  /** Moves the dragged item into `zone` at `index` (or removes it when zone is null). */
  drop(zone: LayoutZone | null, index: number) {
    const { draft, dragging } = useCustomize.getState()
    if (!draft || !dragging) return
    const next = { ...draft } as Layout
    let at = index
    if (dragging.from !== 'palette') {
      const src = [...next[dragging.from]]
      src.splice(dragging.index, 1)
      next[dragging.from] = src
      if (zone === dragging.from && dragging.index < index) at -= 1
    }
    if (zone) {
      const dst = [...next[zone]]
      dst.splice(Math.max(0, Math.min(at, dst.length)), 0, dragging.id)
      next[zone] = dst
    }
    useCustomize.setState({ draft: next, dragging: null })
  }
}
