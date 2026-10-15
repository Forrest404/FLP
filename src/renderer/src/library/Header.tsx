import { useState } from 'react'
import { SORT_OPTIONS, type Crumb } from '@shared/library'
import { IconButton, SearchField } from '@/components/controls'
import { Icon } from '@/components/Icon'
import { openMenu, type MenuEntry } from '@/components/Menu'
import { addMenu } from '@/player/Sidebar'
import { runCommand } from '@/commands/registry'
import { ui, useUi } from '@/state/ui'
import { nav, useLibrary, useViewPrefs } from './state'

function Breadcrumbs({ crumbs, onGo }: { crumbs: Crumb[]; onGo(c: Crumb): void }) {
  return (
    <nav className="flp-crumbs" aria-label="Location">
      {crumbs.map((c, i) => (
        <span key={`${c.path}-${i}`} className="flp-crumbs__item">
          {i > 0 && <span className="flp-crumbs__sep">▸</span>}
          <button type="button" aria-current={i === crumbs.length - 1} onClick={() => onGo(c)}>{c.name}</button>
        </span>
      ))}
    </nav>
  )
}

function sortMenu(sort: string, setSort: (k: (typeof SORT_OPTIONS)[number]['value']) => void, section: string): MenuEntry[] {
  const musicOnly = new Set(['artist', 'album', 'year', 'track'])
  return SORT_OPTIONS.filter((o) => section === 'music' || !musicOnly.has(o.value)).map((o) => ({
    label: o.label,
    checked: o.value === sort,
    run: () => setSort(o.value)
  }))
}

function moreMenu(): MenuEntry[] {
  return [
    { label: 'Rescan media folders', icon: 'refresh', run: () => void window.flp.library.rescan() },
    { label: 'Manage media folders…', icon: 'folder', run: () => ui.openSettings('library') },
    { label: 'Add a media folder…', icon: 'new-folder', run: () => window.dispatchEvent(new CustomEvent('flp:add-library-folder')) },
    'separator',
    { label: 'Clear playback history', icon: 'remove', run: () => void runCommand('library.clearHistory') }
  ]
}

/** Full-width header (Figma library frames). */
export function LibraryHeader({ crumbs, count, onCrumb }: { crumbs: Crumb[]; count?: number; onCrumb(c: Crumb): void }) {
  const section = useUi((s) => s.section)
  const search = useLibrary((s) => s.search)
  useLibrary((s) => s.history[section])
  const { sort, mode, setSort, setMode } = useViewPrefs()
  const status = useLibrary((s) => s.status)
  return (
    <header className="flp-libhead">
      <IconButton icon="arrow-left" label="Back" disabled={!nav.canBack()} onClick={nav.back} />
      <IconButton icon="arrow-right" label="Forward" disabled={!nav.canForward()} onClick={nav.forward} />
      <Breadcrumbs crumbs={crumbs} onGo={onCrumb} />
      <span style={{ flex: 1 }} />
      {status?.scanning && <span className="flp-libhead__status"><span className="flp-spinner flp-spinner--s" />Scanning… {status.total}</span>}
      {count !== undefined && <span className="flp-libhead__count">{count} item{count === 1 ? '' : 's'}</span>}
      <IconButton icon="sort" label="Sort" onClick={(e) => openMenu(sortMenu(sort, setSort, section), e.currentTarget)} />
      <IconButton icon={mode === 'grid' ? 'grid' : 'list'} label="View" onClick={(e) => openMenu([
        { label: 'Grid', icon: 'grid', iconState: mode === 'grid' ? 'active' : 'default', run: () => setMode('grid') },
        { label: 'List', icon: 'list', iconState: mode === 'list' ? 'active' : 'default', run: () => setMode('list') }
      ], e.currentTarget)} />
      <SearchField width={270} placeholder="Search" value={search} onChange={(e) => useLibrary.setState({ search: e.target.value })} />
      <IconButton icon="add" label="Add" onClick={(e) => openMenu(addMenu(), e.currentTarget)} />
      <IconButton icon="more" label="More" onClick={(e) => openMenu(moreMenu(), e.currentTarget)} />
    </header>
  )
}

/** Compact two-row header used in the player sidebar (Figma "Player" with sidebar open). */
export function CompactHeader({ title, crumbs, count, onCrumb }: { title: string; crumbs?: Crumb[]; count?: number; onCrumb(c: Crumb): void }) {
  const section = useUi((s) => s.section)
  useLibrary((s) => s.history[section])
  const search = useLibrary((s) => s.search)
  const { sort, mode, setSort, setMode } = useViewPrefs()
  const [searching, setSearching] = useState(!!search)
  return (
    <header className="flp-chead">
      <div className="flp-chead__row">
        <IconButton icon="arrow-left" label="Back" disabled={!nav.canBack()} onClick={nav.back} />
        <IconButton icon="arrow-right" label="Forward" disabled={!nav.canForward()} onClick={nav.forward} />
        {crumbs && crumbs.length > 1 ? <Breadcrumbs crumbs={crumbs.slice(-2)} onGo={onCrumb} /> : <span className="flp-chead__title">{title}</span>}
        <span style={{ flex: 1 }} />
        <IconButton icon="more" label="More" onClick={(e) => openMenu(moreMenu(), e.currentTarget)} />
        <IconButton icon="open" label="Open in library" onClick={() => ui.set({ view: 'library' })} />
      </div>
      <div className="flp-chead__row">
        {searching ? (
          <SearchField autoFocus width="100%" placeholder="Search" value={search}
            onChange={(e) => useLibrary.setState({ search: e.target.value })}
            onBlur={() => !search && setSearching(false)} />
        ) : (
          <>
            <span className="flp-chead__count">{count !== undefined ? `${count} item${count === 1 ? '' : 's'}` : ''}</span>
            <span style={{ flex: 1 }} />
            <IconButton icon="sort" label="Sort" onClick={(e) => openMenu(sortMenu(sort, setSort, section), e.currentTarget)} />
            <IconButton icon={mode === 'grid' ? 'grid' : 'list'} label="View" onClick={() => setMode(mode === 'grid' ? 'list' : 'grid')} />
            <IconButton icon="search" label="Search" onClick={() => setSearching(true)} />
          </>
        )}
      </div>
    </header>
  )
}

export function SectionTitle({ title, onMore }: { title: string; onMore?(): void }) {
  return (
    <h2 className="flp-rowtitle">
      <button type="button" onClick={onMore} disabled={!onMore}>
        {title}
        {onMore && <Icon name="chevron-right" size={18} />}
      </button>
    </h2>
  )
}
