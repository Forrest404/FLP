// Network: streams, local media servers (UPnP/DLNA), shared folders, internet radio, podcasts.
import { useEffect, useState, type ReactNode } from 'react'
import type { Podcast, Station, UpnpDevice, UpnpEntry } from '@shared/api'
import { Button, IconButton, SearchField, TextField } from '@/components/controls'
import { Icon, type IconName } from '@/components/Icon'
import { openMenu } from '@/components/Menu'
import { Empty } from '@/player/Sidebar'
import { fmtTime } from '@/state/playback'
import { setUi, useSettings } from '@/state/settings'
import { showToast, ui } from '@/state/ui'
import { enqueue, playList } from './actions'
import { CompactHeader, LibraryHeader } from './Header'

type Tab = 'streams' | 'upnp' | 'shares' | 'radio' | 'podcasts'
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'streams', label: 'Streams', icon: 'link' },
  { id: 'upnp', label: 'Local Network', icon: 'tv' },
  { id: 'shares', label: 'Shared Folders', icon: 'folder' },
  { id: 'radio', label: 'Radio', icon: 'streaming' },
  { id: 'podcasts', label: 'Podcasts', icon: 'audio' }
]

const NO_LIST: never[] = []

function Row({ icon, title, sub, onPlay, actions, onClick }: { icon: IconName; title: string; sub?: string; onPlay?(): void; actions?: ReactNode; onClick?(): void }) {
  return (
    <div className="flp-row" tabIndex={0} onClick={onClick} onDoubleClick={onPlay} onKeyDown={(e) => e.key === 'Enter' && (onPlay ?? onClick)?.()}>
      <span className="flp-row__thumb flp-row__thumb--icon"><Icon name={icon} size={18} /></span>
      <span className="flp-row__name">{title}</span>
      {sub && <span className="flp-row__col">{sub}</span>}
      {actions}
    </div>
  )
}

function Streams() {
  const recent = useSettings((s) => (s.ui.recentUrls as string[] | undefined) ?? NO_LIST)
  return (
    <>
      <div className="flp-tabs"><Button variant="primary" onClick={() => ui.openDialog('network')}><Icon name="streaming" size={16} /> Open network stream</Button></div>
      {recent.length ? (
        <div className="flp-rows">
          {recent.map((u) => (
            <Row key={u} icon="link" title={u} onPlay={() => void playList([u])}
              actions={<IconButton icon="close" label="Forget" onClick={(e) => { e.stopPropagation(); setUi('recentUrls', recent.filter((x) => x !== u)) }} />} />
          ))}
        </div>
      ) : <Empty icon="streaming" text="Streams you open (web addresses, YouTube links, IPTV, RTSP cameras…) are listed here." />}
    </>
  )
}

function Upnp() {
  const [devices, setDevices] = useState<UpnpDevice[] | null>(null)
  const [path, setPath] = useState<{ device: UpnpDevice; stack: { id: string; title: string }[] } | null>(null)
  const [entries, setEntries] = useState<UpnpEntry[] | null>(null)
  const scan = () => {
    setDevices(null)
    window.flp.upnp.discover('server').then(setDevices)
  }
  useEffect(scan, [])
  useEffect(() => {
    if (!path) return
    setEntries(null)
    const top = path.stack[path.stack.length - 1]
    window.flp.upnp.browse(path.device, top.id).then(setEntries).catch((e: Error) => {
      showToast(e.message)
      setEntries([])
    })
  }, [path])

  if (path) {
    const media = (entries ?? []).filter((e) => e.url)
    return (
      <>
        <div className="flp-tabs">
          <Button onClick={() => (path.stack.length > 1 ? setPath({ ...path, stack: path.stack.slice(0, -1) }) : setPath(null))}><Icon name="arrow-left" size={16} /> Back</Button>
          <span className="flp-muted">{[path.device.name, ...path.stack.slice(1).map((s) => s.title)].join(' ▸ ')}</span>
          {media.length > 0 && <Button style={{ marginLeft: 'auto' }} onClick={() => void playList(media.map((m) => m.url!))}><Icon name="play" size={16} /> Play all</Button>}
        </div>
        {!entries ? <p className="flp-muted">Loading…</p> : !entries.length ? <Empty icon="folder" text="This folder is empty." /> : (
          <div className="flp-rows">
            {entries.map((e, i) => e.kind === 'folder'
              ? <Row key={e.id} icon="folder" title={e.title} sub={e.childCount ? `${e.childCount}` : undefined} onClick={() => setPath({ ...path, stack: [...path.stack, { id: e.id, title: e.title }] })} />
              : <Row key={e.id + i} icon={e.kind === 'audio' ? 'music' : e.kind === 'image' ? 'thumbnail' : 'video'} title={e.title} sub={e.duration ? fmtTime(e.duration) : undefined}
                  onPlay={() => e.url && void playList(media.map((m) => m.url!), Math.max(0, media.indexOf(e)))}
                  actions={e.url && <IconButton icon="queue" label="Add to queue" onClick={(ev) => { ev.stopPropagation(); void enqueue([e.url!]) }} />} />)}
          </div>
        )}
      </>
    )
  }
  return (
    <>
      <div className="flp-tabs"><Button onClick={scan}><Icon name="refresh" size={16} /> Search again</Button></div>
      {!devices ? <p className="flp-muted">Looking for media servers on your network…</p> : !devices.length ? (
        <Empty icon="tv" text="No media servers found. Plex, Jellyfin, a NAS, or a computer sharing media with UPnP/DLNA will appear here." />
      ) : (
        <div className="flp-rows">
          {devices.map((d) => <Row key={d.id} icon="tv" title={d.name} onClick={() => setPath({ device: d, stack: [{ id: '0', title: d.name }] })} />)}
        </div>
      )}
    </>
  )
}

function Shares() {
  const [shares, setShares] = useState<{ source: string; path: string; kind: string }[] | null>(null)
  const [server, setServer] = useState('smb://')
  useEffect(() => void window.flp.sources.networkShares().then(setShares), [])
  return (
    <>
      <div className="flp-tabs">
        <TextField value={server} onChange={(e) => setServer(e.target.value)} style={{ width: 280 }} />
        <Button onClick={() => window.flp.sources.connectServer(server)}>Connect to server…</Button>
      </div>
      {shares && !shares.length && <Empty icon="folder" text="No shared folders are connected. Connect to a server (smb://nas.local) and it appears here." />}
      <div className="flp-rows">
        {shares?.map((s) => (
          <Row key={s.path} icon="folder" title={s.path.replace('/Volumes/', '')} sub={`${s.kind.toUpperCase()} · ${s.source}`}
            onClick={() => window.flp.library.addRoot(s.path).then(() => showToast(`Added ${s.path} to your library`))} />
        ))}
      </div>
      {shares && shares.length > 0 && <p className="flp-muted">Click a shared folder to add it to your library.</p>}
    </>
  )
}

function Radio() {
  const favorites = useSettings((s) => (s.ui.radio as Station[] | undefined) ?? NO_LIST)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Station[] | null>(null)
  const [searching, setSearching] = useState(false)
  const search = async (q: string) => {
    setSearching(true)
    try {
      setResults(await window.flp.feeds.stations(q))
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setSearching(false)
    }
  }
  const isFav = (s: Station) => favorites.some((f) => f.id === s.id)
  const toggleFav = (s: Station) => setUi('radio', isFav(s) ? favorites.filter((f) => f.id !== s.id) : [...favorites, s])
  const list = (stations: Station[]) => (
    <div className="flp-rows">
      {stations.map((s) => (
        <Row key={s.id} icon="streaming" title={s.name} sub={[s.country, s.tags, s.bitrate ? `${s.bitrate} kb/s` : ''].filter(Boolean).join(' · ')}
          onPlay={() => void playList([s.url])}
          actions={<IconButton icon="favorite" label={isFav(s) ? 'Remove from favorites' : 'Add to favorites'} pressed={isFav(s)} onClick={(e) => { e.stopPropagation(); toggleFav(s) }} />} />
      ))}
    </div>
  )
  return (
    <>
      <div className="flp-tabs">
        <form onSubmit={(e) => { e.preventDefault(); void search(query) }} style={{ display: 'flex', gap: 8 }}>
          <SearchField placeholder="Search stations, genres…" value={query} onChange={(e) => setQuery(e.target.value)} width={300} />
          <Button type="submit">{searching ? 'Searching…' : 'Search'}</Button>
          <Button variant="ghost" onClick={() => void search('')}>Popular</Button>
        </form>
      </div>
      {favorites.length > 0 && !results && <>{list(favorites)}<p className="flp-muted">Double-click to listen. Search for more stations above.</p></>}
      {results && list(results)}
      {!favorites.length && !results && <Empty icon="streaming" text="Search thousands of internet radio stations (radio-browser.info). Nothing is sent until you search." />}
    </>
  )
}

function Podcasts() {
  const feeds = useSettings((s) => (s.ui.podcasts as string[] | undefined) ?? NO_LIST)
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState<Podcast | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async (feed: string) => {
    setLoading(true)
    try {
      setOpen(await window.flp.feeds.podcast(feed))
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  const subscribe = async () => {
    const u = url.trim()
    if (!u) return
    await load(u)
    if (!feeds.includes(u)) setUi('podcasts', [...feeds, u])
    setUrl('')
  }
  if (open)
    return (
      <>
        <div className="flp-tabs">
          <Button onClick={() => setOpen(null)}><Icon name="arrow-left" size={16} /> Back</Button>
          <span className="flp-form__title">{open.title}</span>
          <span className="flp-muted">{open.author}</span>
          <IconButton icon="remove" label="Unsubscribe" onClick={() => { setUi('podcasts', feeds.filter((f) => f !== open.feed)); setOpen(null) }} />
        </div>
        <div className="flp-rows">
          {open.episodes.map((ep, i) => (
            <Row key={ep.url + i} icon="audio" title={ep.title} sub={[ep.published ? new Date(ep.published).toLocaleDateString() : '', ep.duration ? fmtTime(ep.duration) : ''].filter(Boolean).join(' · ')}
              onPlay={() => void playList([ep.url])}
              actions={<IconButton icon="queue" label="Add to queue" onClick={(e) => { e.stopPropagation(); void enqueue([ep.url]) }} />} />
          ))}
        </div>
      </>
    )
  return (
    <>
      <div className="flp-tabs">
        <TextField placeholder="Podcast feed address (RSS)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && subscribe()} style={{ width: 360 }} />
        <Button onClick={subscribe}>{loading ? 'Loading…' : 'Subscribe'}</Button>
      </div>
      {feeds.length ? (
        <div className="flp-rows">
          {feeds.map((f) => <Row key={f} icon="audio" title={f} onClick={() => void load(f)} />)}
        </div>
      ) : <Empty icon="audio" text="Paste a podcast's RSS address to subscribe." />}
    </>
  )
}

export function NetworkSection({ compact }: { compact?: boolean }) {
  const [tab, setTab] = useState<Tab>('streams')
  const crumbs = [{ name: 'Network', path: null }, { name: TABS.find((t) => t.id === tab)!.label, path: null }]
  return (
    <div className="flp-libframe">
      {compact ? <CompactHeader title="Network" crumbs={crumbs} onCrumb={() => setTab('streams')} /> : <LibraryHeader crumbs={crumbs} onCrumb={() => setTab('streams')} />}
      <div className="flp-libbody">
        <div className="flp-tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} title={t.label}>
              <Icon name={t.icon} size={18} state={tab === t.id ? 'active' : 'default'} />
              {!compact && t.label}
            </button>
          ))}
        </div>
        {tab === 'streams' && <Streams />}
        {tab === 'upnp' && <Upnp />}
        {tab === 'shares' && <Shares />}
        {tab === 'radio' && <Radio />}
        {tab === 'podcasts' && <Podcasts />}
      </div>
    </div>
  )
}

/** "Cast to…" menu: finds TVs and speakers, then hands them the current file. */
export async function openCastMenu(at: { clientX: number; clientY: number } | HTMLElement) {
  openMenu([{ label: 'Looking for TVs and speakers…', disabled: true }], at)
  const devices = await window.flp.upnp.discover('renderer')
  openMenu(
    devices.length
      ? [
          ...devices.map((d) => ({
            label: d.name,
            icon: 'tv' as const,
            run: () => window.flp.cast.start(d).then(() => showToast(`Playing on ${d.name}`, { label: 'Stop casting', run: () => void window.flp.cast.stop() })).catch((e: Error) => showToast(`Couldn't cast: ${e.message}`))
          })),
          'separator' as const,
          { label: 'Stop casting', icon: 'stop' as const, run: () => void window.flp.cast.stop() }
        ]
      : [{ label: 'No TVs or speakers found (DLNA/UPnP)', disabled: true }],
    at
  )
}
