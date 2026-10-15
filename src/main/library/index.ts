// Media library service: scans and watches folders, probes files, tracks playback progress.
import { execFile } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { typeOf, type BrowseResult, type Crumb, type FolderEntry, type HomeData, type MediaItem, type MediaType, type MusicGroup, type MusicView, type ScanStatus, type SortKey } from '@shared/library'
import { bin, posterFor, readTags } from '../media-tools'
import { LibraryDb, ORDER } from './db'

/** ".ts" is also TypeScript source; only count it as video if it starts like an MPEG transport stream. */
async function isTransportStream(path: string, size: number): Promise<boolean> {
  if (size < 188 * 4) return false
  const fh = await open(path, 'r').catch(() => null)
  if (!fh) return false
  try {
    const buf = Buffer.alloc(189)
    await fh.read(buf, 0, 189, 0)
    return buf[0] === 0x47 && buf[188] === 0x47
  } finally {
    await fh.close()
  }
}

const TYPES: Record<string, MediaType[]> = { video: ['video'], audio: ['audio'], image: ['image'], all: ['video', 'audio', 'image'] }

function ffprobe(path: string): Promise<{ duration?: number; width?: number; height?: number; title?: string }> {
  return new Promise((resolve) => {
    execFile(bin('ffprobe'), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { timeout: 15000, maxBuffer: 8 << 20 }, (err, out) => {
      if (err) return resolve({})
      try {
        const j = JSON.parse(out)
        const v = (j.streams ?? []).find((s: any) => s.codec_type === 'video' && !s.disposition?.attached_pic)
        resolve({
          duration: Number(j.format?.duration) || 0,
          width: v?.width ?? 0,
          height: v?.height ?? 0,
          title: j.format?.tags?.title
        })
      } catch {
        resolve({})
      }
    })
  })
}

export class Library extends EventEmitter {
  db = new LibraryDb()
  status: ScanStatus = { scanning: false, done: 0, total: 0, root: null }
  private watchers = new Map<string, FSWatcher>()
  private rescanTimers = new Map<string, NodeJS.Timeout>()
  private probing = false
  showHidden = false
  recursive = true

  start(): void {
    if (!this.enabled) return
    for (const root of this.db.roots()) this.watchRoot(root)
    void this.scanAll()
  }

  /** "Use the media library" off: stop watching and scanning (history and playlists still work). */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    if (on) this.start()
    else {
      for (const w of this.watchers.values()) w.close()
      this.watchers.clear()
      for (const t of this.rescanTimers.values()) clearTimeout(t)
      this.rescanTimers.clear()
    }
    this.emit('changed')
  }

  roots(): string[] {
    return this.db.roots()
  }

  async addRoot(path: string): Promise<void> {
    this.db.addRoot(path)
    this.watchRoot(path)
    this.emit('changed')
    await this.scan(path)
  }

  removeRoot(path: string): void {
    clearTimeout(this.rescanTimers.get(path))
    this.rescanTimers.delete(path)
    this.pendingScans.delete(path)
    this.watchers.get(path)?.close()
    this.watchers.delete(path)
    this.db.removeRoot(path)
    // A folder inside another library folder: the outer one still covers those files.
    for (const r of this.db.roots()) if (path.startsWith(`${r}/`)) void this.scan(r)
    this.emit('changed')
  }

  private watchRoot(root: string): void {
    if (this.watchers.has(root)) return
    try {
      const w = watch(root, { recursive: true }, (_ev, file) => {
        if (file && !typeOf(String(file)) && String(file).includes('.')) return
        clearTimeout(this.rescanTimers.get(root))
        this.rescanTimers.set(root, setTimeout(() => void this.scan(root), 2000))
      })
      w.on('error', () => this.watchers.delete(root))
      this.watchers.set(root, w)
    } catch {
      /* folder missing or not watchable; scans still work */
    }
  }

  async scanAll(): Promise<void> {
    for (const root of this.db.roots()) await this.scan(root)
  }

  private pendingScans = new Set<string>()
  enabled = true
  /** 'folder' also uses cover.jpg/folder.jpg next to the file; 'file' only embedded art. */
  artworkFromFolder = true

  async scan(root: string): Promise<void> {
    if (!this.enabled) return
    // One scan at a time; requests made meanwhile run afterwards instead of being dropped.
    if (this.status.scanning) {
      this.pendingScans.add(root)
      return
    }
    if (!this.db.roots().includes(root)) return
    // An unmounted drive or share: leave its files alone instead of emptying the folder.
    if (!(await stat(root).catch(() => null))?.isDirectory()) return
    this.watchRoot(root)
    this.setStatus({ scanning: true, done: 0, total: 0, root })
    const seen = new Set<string>()
    const unreadable: string[] = []
    const removed = () => !this.db.roots().includes(root)
    const walk = async (dir: string, depth: number): Promise<void> => {
      // Folder removed from the library while scanning.
      if (removed()) return
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        unreadable.push(dir)
        return
      }
      for (const e of entries) {
        if (!this.showHidden && e.name.startsWith('.')) continue
        const full = join(dir, e.name)
        if (e.isDirectory()) {
          // Skip bundles and system folders.
          if (/\.(app|photoslibrary|musiclibrary|tvlibrary|bundle|framework)$/i.test(e.name) || e.name === 'node_modules') continue
          if (this.recursive || depth === 0) await walk(full, depth + 1)
          continue
        }
        if (!e.isFile()) continue
        const type = typeOf(e.name)
        if (!type) continue
        try {
          const st = await stat(full)
          if (/\.m?ts$/i.test(e.name) && !(await isTransportStream(full, st.size))) continue
          if (removed()) return
          seen.add(full)
          this.db.upsertScanned({ path: full, type, size: st.size, mtime: Math.floor(st.mtimeMs) })
          this.status.total = seen.size
          if (seen.size % 200 === 0) this.emit('status', this.status)
        } catch {
          /* vanished mid-scan */
        }
      }
    }
    try {
      await walk(root, 0)
      if (!removed()) this.db.prune(root, seen, unreadable)
    } finally {
      this.setStatus({ scanning: false, done: seen.size, total: seen.size, root: null })
      this.emit('changed')
      void this.probeQueue()
      const next = this.pendingScans.values().next().value
      if (next !== undefined) {
        this.pendingScans.delete(next)
        void this.scan(next)
      }
    }
  }

  /** Reads duration, size and tags for new files in the background. */
  private async probeQueue(): Promise<void> {
    if (this.probing) return
    this.probing = true
    try {
      for (;;) {
        const batch = this.db.unprobed(32)
        if (!batch.length) break
        await Promise.all(
          batch.map(async (m) => {
            if (m.type === 'audio') {
              const t = await readTags(m.path, this.artworkFromFolder)
              this.db.setProbe(m.path, { duration: t.duration, title: t.title, artist: t.artist, album: t.album, albumArtist: t.albumArtist, genre: t.genre, year: t.year, track: t.track, disc: t.disc })
              if (t.cover) this.db.setPoster(m.id, t.cover)
            } else if (m.type === 'video') {
              this.db.setProbe(m.path, await ffprobe(m.path))
            } else {
              this.db.setProbe(m.path, {})
              this.db.setPoster(m.id, m.path)
            }
          })
        )
        this.emit('changed')
      }
    } finally {
      this.probing = false
    }
  }

  private setStatus(s: ScanStatus) {
    this.status = s
    this.emit('status', s)
  }

  /** Poster for a library item, generated on first request. */
  async poster(id: number): Promise<string | null> {
    const m = this.db.byId(id)
    if (!m) return null
    if (m.poster) return m.poster
    if (m.type === 'audio') {
      const t = await readTags(m.path, this.artworkFromFolder)
      if (t.cover) this.db.setPoster(id, t.cover)
      return t.cover ?? null
    }
    if (m.type !== 'video') return null
    // Not probed yet: find the length first, so the poster isn't the black frame at 1 s.
    let duration = m.duration
    if (!duration) {
      const info = await ffprobe(m.path)
      if (info.duration) {
        this.db.setProbe(m.path, info)
        duration = info.duration
      }
    }
    const p = await posterFor(m.path, duration)
    if (p) this.db.setPoster(id, p)
    return p
  }

  // ── Queries ──

  browse(kind: string, dir: string | null, sort: SortKey): BrowseResult {
    const types = TYPES[kind] ?? TYPES.all
    const roots = this.db.roots()
    const sectionName = kind === 'audio' ? 'Music' : kind === 'video' ? 'Videos' : 'Library'
    if (!dir) {
      const folders = roots
        .map((r): FolderEntry => ({ path: r, name: basename(r) || r, count: this.db.countUnder(r, types), posters: [] }))
        .filter((f) => f.count > 0)
      // One root: open it directly.
      if (folders.length === 1) return this.browse(kind, folders[0].path, sort)
      return { dir: null, crumbs: [{ name: sectionName, path: null }], folders, items: [] }
    }
    const inLibrary = roots.some((r) => dir === r || dir.startsWith(`${r}/`))
    const root = roots.find((r) => dir === r || dir.startsWith(`${r}/`)) ?? dir
    const rel = dir.slice(root.length).split('/').filter(Boolean)
    // With only one library folder holding this kind of media, the section name stands in for it.
    const multi = roots.filter((r) => this.db.countUnder(r, types) > 0).length > 1
    const crumbs: Crumb[] = [{ name: sectionName, path: multi ? null : root }]
    if (multi) crumbs.push({ name: basename(root), path: root })
    rel.forEach((part, i) => crumbs.push({ name: part, path: join(root, ...rel.slice(0, i + 1)) }))
    const folders = [...this.db.subfolderCounts(dir, types)].map(([path, v]) => ({ path, name: basename(path), count: v.count, posters: v.posters, firstId: v.firstId }))
    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    // Folders outside the library (e.g. from Home → Frequently Visited) show the files played there.
    return { dir, crumbs, folders, items: this.db.inFolder(dir, types, sort, !inLibrary) }
  }

  search(q: string, kind: string): MediaItem[] {
    return this.db.search(q, TYPES[kind] ?? TYPES.all)
  }

  home(): HomeData {
    const continueWatching = this.db.query(
      `select * from media where type = 'video' and position > 10 and watched = 0 and duration > 0 and position < duration - 10 order by last_played desc limit 12`
    )
    const listenAgain = this.db.query(`select * from media where type = 'audio' and last_played is not null order by last_played desc limit 12`)
    const folderRows = this.db.raw<{ folder: string; n: number }>(
      `select folder, count(*) n from media where last_played is not null and folder != '' group by folder order by max(last_played) desc, n desc limit 8`
    )
    const frequentFolders = folderRows.map((r) => ({ path: r.folder, name: basename(r.folder), count: r.n, posters: [] }))
    const recentlyAdded = this.db.query(`select * from media where in_library = 1 and type != 'image' order by added_at desc limit 12`)
    return { continueWatching, listenAgain, frequentFolders, recentlyAdded }
  }

  recent(limit = 100): MediaItem[] {
    return this.db.query('select * from media where last_played is not null order by last_played desc limit ?', limit)
  }

  favorites(): MediaItem[] {
    return this.db.query('select * from media where favorite = 1 order by title collate nocase')
  }

  music(view: MusicView, filter: string | null, sort: SortKey): MediaItem[] | MusicGroup[] {
    // Albums are told apart by album artist too ("Greatest Hits" by different artists).
    const albumArtist = "coalesce(album_artist, artist, '')"
    if (view === 'songs' || filter !== null) {
      let where = '1 = 1'
      let args: string[] = []
      if (view === 'albums' && filter !== null) {
        const [album, artist] = filter.split('\u001f')
        where = artist === undefined ? 'album = ?' : `album = ? and ${albumArtist} = ?`
        args = artist === undefined ? [album] : [album, artist]
      } else if (view !== 'songs' && filter !== null) {
        where = view === 'artists' ? "coalesce(artist, 'Unknown artist') = ?" : 'genre = ?'
        args = [filter]
      }
      const order = view === 'albums' ? 'disc, track, title collate nocase' : ORDER[sort] ?? ORDER.artist
      return this.db.query(`select * from media where in_library = 1 and type = 'audio' and ${where} order by ${order}`, ...args)
    }
    const col = view === 'albums' ? 'album' : view === 'artists' ? "coalesce(artist, 'Unknown artist')" : 'genre'
    const group = view === 'albums' ? `album, ${albumArtist}` : col
    const rows = this.db.raw<{ name: string; n: number; cover: string | null; sub: string | null }>(
      `select ${col} name, count(*) n, max(poster) cover, max(${albumArtist}) sub from media where in_library = 1 and type = 'audio' and ${col} is not null group by ${group} order by ${col} collate nocase, sub collate nocase`
    )
    return rows.map((r) => ({
      name: r.name,
      key: view === 'albums' ? `${r.name}\u001f${r.sub ?? ''}` : r.name,
      subtitle: view === 'albums' ? r.sub ?? '' : `${r.n} song${r.n === 1 ? '' : 's'}`,
      count: r.n,
      cover: r.cover
    }))
  }

  // ── Playback tracking ──

  private current: { path: string; type: MediaType } | null = null
  private lastSave = 0

  onFileStarted(path: string, title: string | null, duration: number): void {
    // Streams without a recognisable extension: online video, radio… (positions are only kept when there's a length).
    const type = typeOf(path) ?? (/^[a-z]+:\/\//i.test(path) ? 'video' : null)
    if (!type) return
    this.current = { path, type }
    // The first position save waits a few seconds (a 0 s update right at the start would wipe the resume point).
    this.lastSave = Date.now()
    this.db.touchPlayed(path, type, title || basename(path).replace(/\.[^.]+$/, ''), duration)
    this.emit('changed')
  }

  onTime(time: number, duration: number): void {
    if (!this.current || Date.now() - this.lastSave < 5000) return
    this.lastSave = Date.now()
    this.db.savePosition(this.current.path, time, duration)
  }

  /** mpv's keep-open stops on the last frame without an end-file event; count that as finished. */
  onEofReached(): void {
    if (!this.current) return
    this.db.finished(this.current.path)
    this.current = null
    this.emit('changed')
  }

  onStopped(time: number, duration: number, eof: boolean, keepPosition = true): void {
    if (!this.current) return
    if (eof) this.db.finished(this.current.path)
    else if (keepPosition) this.db.savePosition(this.current.path, time, duration)
    this.current = null
    this.emit('changed')
  }

  resumePosition(path: string): number {
    const m = this.db.byPath(path)
    if (!m || m.watched || m.position < 10 || !(m.duration > 0)) return 0
    if (m.duration && m.position > m.duration - 10) return 0
    return m.position
  }
}

