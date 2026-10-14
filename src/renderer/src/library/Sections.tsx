// The library sections: Home, Videos (folder browser), Music, Playlists, Recent, Network.
import type { ReactNode } from 'react'
import type { BrowseResult, Crumb, FolderEntry, HomeData, MediaItem, MusicGroup, MusicView, Playlist } from '@shared/library'
import { Button } from '@/components/controls'
import { Icon } from '@/components/Icon'
import { openMenu } from '@/components/Menu'
import { Empty, QueueList } from '@/player/Sidebar'
import { useSettings } from '@/state/settings'
import { openPaths } from '@/state/playback'
import { ui } from '@/state/ui'
import { playList, playlistMenu } from './actions'
import { CompactHeader, LibraryHeader, SectionTitle } from './Header'
import { nav, useLibrary, useLibraryData, useLocation, useViewPrefs } from './state'
import { FolderRow, FolderTile, GroupTile, MediaRow, MediaTile } from './Tiles'

const lib = () => window.flp.library

/** Header + scrolling body; picks the full or compact header. */
function Frame({ compact, title, crumbs, count, onCrumb, children }: {
  compact?: boolean
  title: string
  crumbs: Crumb[]
  count?: number
  onCrumb?(c: Crumb): void
  children: ReactNode
}) {
  const go = onCrumb ?? ((c: Crumb) => nav.go({ dir: c.path }))
  return (
    <div className="flp-libframe">
      {compact ? <CompactHeader title={title} crumbs={crumbs} count={count} onCrumb={go} /> : <LibraryHeader crumbs={crumbs} count={count} onCrumb={go} />}
      <div className="flp-libbody">{children}</div>
    </div>
  )
}

function Items({ items, folders, kind, compact, columns }: {
  items: MediaItem[]
  folders?: FolderEntry[]
  kind: 'video' | 'audio' | 'all'
  compact?: boolean
  columns?: ('artist' | 'album' | 'duration' | 'folder')[]
}) {
  const { mode } = useViewPrefs()
  const list = compact || mode === 'list'
  if (!items.length && !folders?.length) return <Empty icon="search" text="Nothing here yet." />
  return (
    <div className={list ? (compact ? 'flp-rows' : 'flp-rows flp-rows--columns') : 'flp-grid'}>
      {folders?.map((f) => (list
        ? <FolderRow key={f.path} folder={f} kind={kind} onOpen={() => nav.go({ dir: f.path })} />
        : <FolderTile key={f.path} folder={f} kind={kind} onOpen={() => nav.go({ dir: f.path })} />))}
      {items.map((m) => (list ? <MediaRow key={m.path} item={m} siblings={items} columns={compact ? undefined : columns} /> : <MediaTile key={m.path} item={m} siblings={items} />))}
    </div>
  )
}

function NoFolders() {
  return (
    <Empty icon="folder" text="Add a folder with your videos and music, and FLP will keep this library up to date.">
      <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent('flp:add-library-folder'))}>Add a media folder</Button>
    </Empty>
  )
}

// ── Home ──

export function HomeSection({ compact }: { compact?: boolean }) {
  const data = useLibraryData<HomeData>(() => lib().home(), [])
  const roots = useLibraryData(() => lib().roots(), [])
  const crumbs = [{ name: 'Home', path: null }]
  if (!data) return <Frame compact={compact} title="Home" crumbs={crumbs}>{null}</Frame>
  const empty = !data.continueWatching.length && !data.listenAgain.length && !data.frequentFolders.length && !data.recentlyAdded.length
  return (
    <Frame compact={compact} title="Home" crumbs={crumbs}>
      {empty && (roots?.length ? <Empty icon="home" text="Play something and it'll show up here." /> : <NoFolders />)}
      {data.continueWatching.length > 0 && (
        <section className="flp-shelf">
          <SectionTitle title="Continue Watching" onMore={() => ui.set({ section: 'recent' })} />
          <div className={compact ? 'flp-rows' : 'flp-shelf__row'}>
            {data.continueWatching.map((m) => (compact ? <MediaRow key={m.path} item={m} siblings={[m]} /> : <MediaTile key={m.path} item={m} siblings={[m]} />))}
          </div>
        </section>
      )}
      {data.listenAgain.length > 0 && (
        <section className="flp-shelf">
          <SectionTitle title="Listen Again" onMore={() => ui.set({ section: 'music' })} />
          <div className={compact ? 'flp-rows' : 'flp-shelf__row flp-shelf__row--square'}>
            {data.listenAgain.map((m) => (compact ? <MediaRow key={m.path} item={m} siblings={data.listenAgain} /> : <MediaTile key={m.path} item={m} siblings={data.listenAgain} />))}
          </div>
        </section>
      )}
      {data.frequentFolders.length > 0 && (
        <section className="flp-shelf">
          <SectionTitle title="Frequently Visited Folders" />
          <div className={compact ? 'flp-rows' : 'flp-shelf__row flp-shelf__row--square'}>
            {data.frequentFolders.map((f) => (compact
              ? <FolderRow key={f.path} folder={f} kind="all" onOpen={() => openFolder(f.path)} />
              : <FolderTile key={f.path} folder={f} kind="all" onOpen={() => openFolder(f.path)} />))}
          </div>
        </section>
      )}
      {data.recentlyAdded.length > 0 && (
        <section className="flp-shelf">
          <SectionTitle title="Recently Added" onMore={() => ui.set({ section: 'videos' })} />
          <div className={compact ? 'flp-rows' : 'flp-shelf__row'}>
            {data.recentlyAdded.map((m) => (compact ? <MediaRow key={m.path} item={m} siblings={data.recentlyAdded} /> : <MediaTile key={m.path} item={m} siblings={data.recentlyAdded} />))}
          </div>
        </section>
      )}
    </Frame>
  )
}

function openFolder(path: string) {
  ui.set({ section: 'videos' })
  nav.go({ dir: path })
}

// ── Videos (folder browser) ──

export function BrowseSection({ kind, compact }: { kind: 'video' | 'all'; compact?: boolean }) {
  const loc = useLocation()
  const { sort } = useViewPrefs()
  const search = useLibrary((s) => s.search)
  const data = useLibraryData<BrowseResult>(() => lib().browse(kind, loc.dir, sort), [kind, loc.dir, sort])
  const results = useLibraryData<MediaItem[]>(() => (search ? lib().search(search, kind) : Promise.resolve([])), [search, kind])
  const roots = useLibraryData(() => lib().roots(), [])
  const crumbs = data?.crumbs ?? [{ name: 'Videos', path: null }]
  if (roots && !roots.length) return <Frame compact={compact} title="Videos" crumbs={crumbs}><NoFolders /></Frame>
  if (search) return <Frame compact={compact} title="Videos" crumbs={[...crumbs, { name: `“${search}”`, path: loc.dir }]} count={results?.length}><Items items={results ?? []} kind={kind} compact={compact} columns={['folder', 'duration']} /></Frame>
  return (
    <Frame compact={compact} title="Videos" crumbs={crumbs} count={data ? data.items.length + data.folders.length : undefined}>
      {data && <Items items={data.items} folders={data.folders} kind={kind} compact={compact} columns={['duration']} />}
    </Frame>
  )
}

// ── Music ──

const MUSIC_TABS: { id: MusicView; label: string; icon: 'songs' | 'album' | 'artist' | 'genre' }[] = [
  { id: 'songs', label: 'Songs', icon: 'songs' },
  { id: 'albums', label: 'Albums', icon: 'album' },
  { id: 'artists', label: 'Artists', icon: 'artist' },
  { id: 'genres', label: 'Genres', icon: 'genre' }
]

export function MusicSection({ compact }: { compact?: boolean }) {
  const view = useLibrary((s) => s.musicView)
  const loc = useLocation()
  const { sort } = useViewPrefs()
  const search = useLibrary((s) => s.search)
  const group = loc.group ?? null
  const data = useLibraryData(() => (search ? lib().search(search, 'audio') : lib().music(view, group, sort)), [view, group, sort, search])
  const tab = MUSIC_TABS.find((t) => t.id === view)!
  const crumbs: Crumb[] = [{ name: 'Music', path: null }, { name: tab.label, path: null }, ...(group ? [{ name: group, path: null }] : [])]
  const isGroups = data && data.length > 0 && !('path' in (data[0] as object))
  return (
    <Frame compact={compact} title="Music" crumbs={crumbs} count={data?.length} onCrumb={(c) => c.name === tab.label && nav.go({ dir: null, group: null })}>
      <div className="flp-tabs">
        {MUSIC_TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={view === t.id} onClick={() => { useLibrary.setState({ musicView: t.id }); nav.go({ dir: null, group: null }) }}>
            <Icon name={t.icon} size={18} state={view === t.id ? 'active' : 'default'} />
            {!compact && t.label}
          </button>
        ))}
        {group && (
          <Button onClick={() => void playList((data as MediaItem[]).map((m) => m.path))} style={{ marginLeft: 'auto' }}>
            <Icon name="play" size={16} /> Play all
          </Button>
        )}
      </div>
      {data && (isGroups ? (
        <div className={compact ? 'flp-rows' : 'flp-grid flp-grid--square'}>
          {(data as MusicGroup[]).map((g) => <GroupTile key={g.name} group={g} icon={tab.icon === 'songs' ? 'album' : tab.icon} onOpen={() => nav.go({ dir: null, group: g.name })} />)}
        </div>
      ) : (
        <Items items={data as MediaItem[]} kind="audio" compact={compact} columns={['artist', 'album', 'duration']} />
      ))}
    </Frame>
  )
}

// ── Playlists ──

export function PlaylistsSection({ compact }: { compact?: boolean }) {
  const loc = useLocation()
  const lists = useLibraryData<Playlist[]>(() => lib().playlists(), [])
  const open = lists?.find((p) => p.id === loc.playlist)
  if (open) return <PlaylistDetail playlist={open} compact={compact} />
  return (
    <Frame compact={compact} title="Playlists" crumbs={[{ name: 'Playlists', path: null }]} count={lists ? lists.length : undefined}>
      <div className="flp-rows">
        <div className="flp-row flp-row--action" tabIndex={0} onClick={() => ui.openDialog('newPlaylist')}>
          <span className="flp-row__thumb flp-row__thumb--icon"><Icon name="add" size={18} /></span>
          <span className="flp-row__name">Create playlist</span>
        </div>
        {lists?.map((pl) => (
          <div
            key={pl.id}
            className="flp-row"
            tabIndex={0}
            onClick={() => nav.go({ dir: null, playlist: pl.id })}
            onDoubleClick={async () => playList(await lib().playlistPaths(pl.id))}
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(playlistMenu(pl, () => nav.go({ dir: null, playlist: pl.id })), e)
            }}
          >
            <span className="flp-row__thumb flp-row__thumb--icon"><Icon name="playlist" size={18} /></span>
            <span className="flp-row__name">{pl.name}</span>
            <span className="flp-row__dur">{pl.count}</span>
          </div>
        ))}
      </div>
      <section className="flp-shelf">
        <SectionTitle title="Now Playing" />
        <QueueList />
      </section>
    </Frame>
  )
}

function PlaylistDetail({ playlist, compact }: { playlist: Playlist; compact?: boolean }) {
  const items = useLibraryData<MediaItem[]>(async () => {
    const paths = await lib().playlistPaths(playlist.id)
    const rows = await Promise.all(paths.map((p) => lib().item(p)))
    return rows.map((r, i) => r ?? placeholderItem(paths[i], i))
  }, [playlist.id])
  return (
    <Frame compact={compact} title={playlist.name} crumbs={[{ name: 'Playlists', path: null }, { name: playlist.name, path: null }]} count={items?.length}
      onCrumb={(c) => c.name === 'Playlists' && nav.go({ dir: null, playlist: null })}>
      <div className="flp-tabs">
        <Button variant="primary" onClick={() => items && void playList(items.map((m) => m.path))}><Icon name="play" size={16} filled /> Play</Button>
        <Button onClick={() => items && void playList(items.map((m) => m.path).sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={16} /> Shuffle</Button>
        <Button onClick={async () => {
          const files = await window.flp.dialog.openFiles({ title: `Add to ${playlist.name}` })
          if (files.length) await lib().addToPlaylist(playlist.id, files)
        }}><Icon name="add" size={16} /> Add files</Button>
      </div>
      {items && <Items items={items} kind="all" compact={compact} columns={['folder', 'duration']} />}
    </Frame>
  )
}

function placeholderItem(path: string, i: number): MediaItem {
  return {
    id: -1 - i, path, type: 'video', title: path.split('/').pop() ?? path, folder: '', duration: 0, size: 0, mtime: 0, width: 0, height: 0,
    artist: null, album: null, genre: null, year: null, track: null, addedAt: 0, lastPlayed: null, position: 0, playCount: 0,
    favorite: false, watched: false, poster: null, inLibrary: false
  }
}

// ── Recent ──

export function RecentSection({ compact }: { compact?: boolean }) {
  const items = useLibraryData<MediaItem[]>(() => lib().recent(), [])
  return (
    <Frame compact={compact} title="Recent" crumbs={[{ name: 'Recent', path: null }]} count={items?.length}>
      {items && <Items items={items} kind="all" compact={compact} columns={['folder', 'duration']} />}
    </Frame>
  )
}

// ── Network ──

const NO_URLS: string[] = []

export function NetworkSection({ compact }: { compact?: boolean }) {
  const recent = useSettings((s) => (s.ui.recentUrls as string[] | undefined) ?? NO_URLS)
  return (
    <Frame compact={compact} title="Network" crumbs={[{ name: 'Network', path: null }]}>
      <div className="flp-tabs">
        <Button variant="primary" onClick={() => ui.openDialog('network')}><Icon name="streaming" size={16} /> Open network stream</Button>
      </div>
      <section className="flp-shelf">
        <SectionTitle title="Recent streams" />
        {recent.length ? (
          <div className="flp-rows">
            {recent.map((u) => (
              <div key={u} className="flp-row" tabIndex={0} onDoubleClick={() => void openPaths([u])}>
                <span className="flp-row__thumb flp-row__thumb--icon"><Icon name="link" size={18} /></span>
                <span className="flp-row__name">{u}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="streaming" text="Streams you open will be listed here." />
        )}
      </section>
    </Frame>
  )
}
