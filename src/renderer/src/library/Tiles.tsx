import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '@shared/api'
import type { FolderEntry, MediaItem, MusicGroup } from '@shared/library'
import { Icon } from '@/components/Icon'
import { openMenu } from '@/components/Menu'
import { usePlayer } from '@/state/player'
import { fmtTime } from '@/state/playback'
import { fileMenu, folderMenu, playList } from './actions'

/** Loads a poster when the tile scrolls into view. */
function usePoster(item: MediaItem): [React.RefObject<HTMLDivElement | null>, string | null] {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(item.poster ? mediaUrl(item.poster) : null)
  useEffect(() => {
    if (item.poster) return setSrc(mediaUrl(item.poster))
    // Videos get a frame; music gets its embedded or folder cover.
    if (item.type !== 'video' && item.type !== 'audio') return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      window.flp.library.poster(item.id).then((p) => p && setSrc(mediaUrl(p)))
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [item.id, item.poster, item.type])
  return [ref, src]
}

const progressOf = (m: MediaItem) => (m.watched ? 100 : m.duration > 0 ? Math.min(100, (m.position / m.duration) * 100) : 0)

function Poster({ item, square }: { item: MediaItem; square?: boolean }) {
  const [ref, src] = usePoster(item)
  const progress = progressOf(item)
  return (
    <div ref={ref} className={`flp-poster ${square ? 'flp-poster--square' : ''}`}>
      {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <Icon name={item.type === 'audio' ? 'music' : item.type === 'image' ? 'thumbnail' : 'video'} size={32} />}
      {item.type === 'video' && item.duration > 0 && <span className="flp-poster__dur">{fmtTime(item.duration).replace(/^00:/, '')}</span>}
      {progress > 0 && <div className="flp-poster__progress" style={{ width: `${progress}%` }} />}
      {item.favorite && <Icon name="favorite" size={16} state="active" filled className="flp-poster__fav" />}
    </div>
  )
}

export function MediaTile({ item, siblings, pos = siblings.indexOf(item), subtitle }: { item: MediaItem; siblings: MediaItem[]; pos?: number; subtitle?: string }) {
  const playing = usePlayer((s) => s.path === item.path)
  const square = item.type === 'audio'
  return (
    <div
      className="flp-tile"
      data-watched={item.watched}
      data-playing={playing}
      title={item.path}
      tabIndex={0}
      onDoubleClick={() => void playList(siblings.map((s) => s.path), pos)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && void playList(siblings.map((s) => s.path), pos)}
      onContextMenu={async (e) => {
        e.preventDefault()
        const at = { clientX: e.clientX, clientY: e.clientY }
        openMenu(await fileMenu(item, siblings, pos), at)
      }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/uri-list', item.path)}
    >
      <Poster item={item} square={square} />
      <button type="button" className="flp-tile__play" aria-label={`Play ${item.title}`} onClick={() => void playList(siblings.map((s) => s.path), pos)}>
        <Icon name="play" size={18} filled />
      </button>
      <div className="flp-tile__name">{square ? item.title : fileLabel(item)}</div>
      {(subtitle ?? (square ? item.artist : null)) && <div className="flp-tile__sub">{subtitle ?? item.artist}</div>}
    </div>
  )
}

/** Files show their file name (as in Figma); fall back to the title for streams. */
function fileLabel(item: MediaItem): string {
  if (/^[a-z]+:\/\//i.test(item.path)) return item.title
  return item.path.split('/').pop() ?? item.title
}

/** `pos`: the item's place in `siblings` (defaults to finding it), what plays on double-click. */
export function MediaRow({ item, siblings, pos = siblings.indexOf(item), index, columns }: { item: MediaItem; siblings: MediaItem[]; pos?: number; index?: number; columns?: ('artist' | 'album' | 'duration' | 'folder')[] }) {
  const [ref, src] = usePoster(item)
  const playing = usePlayer((s) => s.path === item.path)
  return (
    <div
      ref={ref}
      className="flp-row"
      data-watched={item.watched}
      data-playing={playing}
      title={item.path}
      tabIndex={0}
      onDoubleClick={() => void playList(siblings.map((s) => s.path), pos)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && void playList(siblings.map((s) => s.path), pos)}
      onContextMenu={async (e) => {
        e.preventDefault()
        const at = { clientX: e.clientX, clientY: e.clientY }
        openMenu(await fileMenu(item, siblings, pos), at)
      }}
    >
      {index !== undefined && <span className="flp-row__index">{index + 1}</span>}
      <span className="flp-row__thumb">
        {playing ? <Icon name="play" size={16} state="active" /> : src ? <img src={src} alt="" loading="lazy" /> : <Icon name={item.type === 'audio' ? 'music' : 'video'} size={16} />}
        {progressOf(item) > 0 && <i style={{ width: `${progressOf(item)}%` }} />}
      </span>
      <span className="flp-row__name">{item.type === 'audio' ? item.title : fileLabel(item)}</span>
      {columns?.includes('artist') && <span className="flp-row__col">{item.artist ?? ''}</span>}
      {columns?.includes('album') && <span className="flp-row__col">{item.album ?? ''}</span>}
      {columns?.includes('folder') && <span className="flp-row__col">{item.folder.split('/').pop()}</span>}
      {columns?.includes('duration') && <span className="flp-row__dur">{item.duration ? fmtTime(item.duration).replace(/^00:/, '') : ''}</span>}
    </div>
  )
}

function useFolderCover(folder: FolderEntry): string | undefined {
  const [cover, setCover] = useState(folder.posters[0])
  useEffect(() => {
    if (folder.posters[0]) return setCover(folder.posters[0])
    if (folder.firstId !== undefined) window.flp.library.poster(folder.firstId).then((p) => p && setCover(p))
  }, [folder.path, folder.posters[0], folder.firstId])
  return cover
}

export function FolderTile({ folder, kind, onOpen }: { folder: FolderEntry; kind: 'video' | 'audio' | 'all'; onOpen(): void }) {
  const cover = useFolderCover(folder)
  return (
    <div
      className="flp-tile flp-tile--folder"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      onContextMenu={async (e) => {
        e.preventDefault()
        const at = { clientX: e.clientX, clientY: e.clientY }
        openMenu(await folderMenu(folder, kind), at)
      }}
    >
      <div className="flp-poster flp-poster--folder">
        {cover ? <img src={mediaUrl(cover)} alt="" loading="lazy" /> : null}
        <span className="flp-poster__foldericon"><Icon name="folder" size={30} /></span>
      </div>
      <div className="flp-tile__name">{folder.name}</div>
      <div className="flp-tile__sub">{folder.count} item{folder.count === 1 ? '' : 's'}</div>
    </div>
  )
}

export function FolderRow({ folder, kind, onOpen }: { folder: FolderEntry; kind: 'video' | 'audio' | 'all'; onOpen(): void }) {
  return (
    <div
      className="flp-row"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      onContextMenu={async (e) => {
        e.preventDefault()
        const at = { clientX: e.clientX, clientY: e.clientY }
        openMenu(await folderMenu(folder, kind), at)
      }}
    >
      <span className="flp-row__thumb flp-row__thumb--icon"><Icon name="folder" size={18} /></span>
      <span className="flp-row__name">{folder.name}</span>
      <span className="flp-row__dur">{folder.count}</span>
    </div>
  )
}

export function GroupTile({ group, icon, onOpen }: { group: MusicGroup; icon: 'album' | 'artist' | 'genre'; onOpen(): void }) {
  return (
    <div className="flp-tile" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="flp-poster flp-poster--square">
        {group.cover ? <img src={mediaUrl(group.cover)} alt="" loading="lazy" /> : <Icon name={icon} size={36} />}
      </div>
      <div className="flp-tile__name">{group.name}</div>
      <div className="flp-tile__sub">{group.subtitle}</div>
    </div>
  )
}
