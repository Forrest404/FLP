import type { FolderEntry, MediaItem, Playlist } from '@shared/library'
import type { MenuEntry } from '@/components/Menu'
import { player } from '@/state/player'
import { confirmAction, showOsd, showToast, ui } from '@/state/ui'
import { getSetting } from '@/state/settings'

const lib = () => window.flp.library

/** Plays `paths` as the queue, starting at `start`. */
export async function playList(paths: string[], start = 0) {
  if (!paths.length) return
  if (getSetting('playback.shuffle') && paths.length > 1) {
    // Keep the chosen item first, shuffle the rest.
    const first = paths[start]
    const rest = paths.filter((_, i) => i !== start).sort(() => Math.random() - 0.5)
    paths = [first, ...rest]
    start = 0
  }
  await player.command('stop')
  await player.command('playlist-clear')
  for (const p of paths) await player.command('loadfile', p, 'append')
  await player.command('playlist-play-index', start)
  await player.set('pause', false)
  ui.set({ view: 'player' })
}

export async function enqueue(paths: string[], next = false) {
  for (const p of paths) {
    await player.command('loadfile', p, next ? 'insert-next' : 'append-play')
  }
  showOsd(`${paths.length === 1 ? 'Added 1 item' : `Added ${paths.length} items`} to the queue`)
}

export async function folderPaths(dir: string, kind: 'video' | 'audio' | 'all'): Promise<string[]> {
  const out: string[] = []
  const walk = async (d: string) => {
    const res = await lib().browse(kind, d, 'name')
    out.push(...res.items.map((i) => i.path))
    for (const f of res.folders) await walk(f.path)
  }
  await walk(dir)
  return out
}

async function playlistSubmenu(paths: () => Promise<string[]>): Promise<MenuEntry[]> {
  const lists = await lib().playlists()
  return [
    ...lists.map((pl): MenuEntry => ({
      label: pl.name,
      icon: 'playlist',
      iconState: 'default',
      run: async () => {
        await lib().addToPlaylist(pl.id, await paths())
        showOsd(`Added to ${pl.name}`)
      }
    })),
    ...(lists.length ? (['separator'] as MenuEntry[]) : []),
    { label: 'New playlist…', icon: 'add', iconState: 'default', run: async () => ui.openDialog('newPlaylist', { paths: await paths() }) }
  ]
}

/** Figma "file context menu". */
export async function fileMenu(item: MediaItem, siblings: MediaItem[], pos?: number): Promise<MenuEntry[]> {
  // `pos` tells copies of the same file apart (a playlist can hold one file twice).
  const idx = pos ?? siblings.findIndex((s) => s.path === item.path)
  const local = !/^[a-z]+:\/\//i.test(item.path)
  const playlists = await playlistSubmenu(async () => [item.path])
  return [
    { label: 'Play', icon: 'play', run: () => void playList(siblings.map((s) => s.path), Math.max(0, idx)) },
    { label: 'Play from start', icon: 'replay', run: async () => {
      await lib().setWatched(item.path, false)
      await playList([item.path])
    } },
    { label: 'Play next', icon: 'next', run: () => void enqueue([item.path], true) },
    { label: 'Add to queue', icon: 'queue', run: () => void enqueue([item.path]) },
    { label: 'Add to playlist', icon: 'playlist', submenu: playlists },
    'separator',
    { label: item.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'favorite', run: () => void lib().setFavorite(item.path, !item.favorite) },
    { label: item.watched ? 'Mark as unwatched' : 'Mark as watched', icon: 'check', run: () => void lib().setWatched(item.path, !item.watched) },
    'separator',
    ...(local ? [{ label: 'Show in Finder', icon: 'folder' as const, run: () => window.flp.shell.showInFolder(item.path) }] : []),
    { label: 'Copy path', icon: 'link', run: () => {
      void navigator.clipboard.writeText(item.path)
      showOsd('Path copied')
    } },
    { label: 'Convert…', icon: 'swap', run: () => ui.openDialog('convert', { paths: [item.path] }) },
    { label: 'Properties', icon: 'info', run: () => ui.openDialog('mediaInfo', { path: item.path }) }
  ]
}

/** Figma "folder context menu". */
export async function folderMenu(folder: FolderEntry, kind: 'video' | 'audio' | 'all'): Promise<MenuEntry[]> {
  const paths = () => folderPaths(folder.path, kind)
  return [
    { label: 'Play all', icon: 'play', run: async () => playList(await paths()) },
    { label: 'Shuffle', icon: 'shuffle', run: async () => playList((await paths()).sort(() => Math.random() - 0.5)) },
    { label: 'Add to queue', icon: 'queue', run: async () => enqueue(await paths()) },
    { label: 'Add to playlist', icon: 'playlist', submenu: await playlistSubmenu(paths) },
    { label: 'Show in Finder', icon: 'folder', run: () => window.flp.shell.openPath(folder.path) },
    { label: 'Add subtitles to this folder…', icon: 'subtitles', run: () => ui.openDialog('addSubtitles', { folder: folder.path }) }
  ]
}

/** Figma "playlist context menu". */
export function playlistMenu(pl: Playlist, open: () => void): MenuEntry[] {
  return [
    { label: 'Play', icon: 'play', run: async () => playList(await lib().playlistPaths(pl.id)) },
    { label: 'Shuffle play', icon: 'shuffle', run: async () => playList((await lib().playlistPaths(pl.id)).sort(() => Math.random() - 0.5)) },
    { label: 'Add to queue', icon: 'queue', run: async () => enqueue(await lib().playlistPaths(pl.id)) },
    { label: 'Open', icon: 'open', run: open },
    'separator',
    { label: 'Rename…', icon: 'edit', run: () => ui.openDialog('newPlaylist', { rename: pl }) },
    { label: 'Duplicate', icon: 'add', run: async () => lib().createPlaylist(`${pl.name} copy`, await lib().playlistPaths(pl.id), pl.cover) },
    { label: 'Export as .m3u8…', icon: 'save', run: () => void lib().exportPlaylist(pl.id) },
    { label: 'Delete', icon: 'remove', run: async () => {
      if (!(await confirmAction({ title: `Delete “${pl.name}”?`, message: 'The playlist is removed. Its media files are not deleted.', confirmLabel: 'Delete' }))) return
      await lib().deletePlaylist(pl.id)
      showToast(`Deleted “${pl.name}”`)
    } }
  ]
}
