// SQLite media library (node:sqlite, built into Electron's Node — no native module to rebuild).
import { mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import type { MediaItem, MediaType, Playlist, SortKey } from '@shared/library'

const SCHEMA = `
create table if not exists roots (path text primary key, added_at integer not null);
create table if not exists media (
  id integer primary key,
  path text unique not null,
  type text not null,
  title text not null,
  folder text not null,
  duration real not null default 0,
  size integer not null default 0,
  mtime integer not null default 0,
  width integer not null default 0,
  height integer not null default 0,
  artist text, album text, genre text, year integer, track integer,
  added_at integer not null,
  last_played integer,
  position real not null default 0,
  play_count integer not null default 0,
  favorite integer not null default 0,
  watched integer not null default 0,
  poster text,
  probed integer not null default 0,
  in_library integer not null default 1
);
create index if not exists media_folder on media(folder);
create index if not exists media_type on media(type);
create index if not exists media_played on media(last_played);
create table if not exists playlists (id integer primary key, name text not null, cover text, created_at integer not null);
create table if not exists playlist_items (playlist_id integer not null references playlists(id) on delete cascade, pos integer not null, path text not null);
create index if not exists playlist_items_pl on playlist_items(playlist_id, pos);
create table if not exists bookmarks (id integer primary key, path text not null, time real not null, name text not null, created_at integer not null);
create index if not exists bookmarks_path on bookmarks(path);
`

type Row = Record<string, unknown>

/**
 * Exact "is inside folder" test: col >= 'dir/' and col < 'dir0' ('0' sorts right after '/').
 * Unlike LIKE, this treats _ and % literally and is case-sensitive.
 */
const UNDER = (col: string) => `(${col} >= ? and ${col} < ?)`
const under = (dir: string) => [`${dir}/`, `${dir}0`]

const ORDER: Record<SortKey, string> = {
  name: 'title collate nocase asc',
  'name-desc': 'title collate nocase desc',
  added: 'added_at desc',
  'added-asc': 'added_at asc',
  modified: 'mtime desc',
  'modified-asc': 'mtime asc',
  duration: 'duration asc',
  'duration-desc': 'duration desc',
  size: 'size asc',
  'size-desc': 'size desc',
  played: 'coalesce(last_played, 0) desc',
  plays: 'play_count desc',
  artist: 'artist collate nocase, album collate nocase, disc, track',
  album: 'album collate nocase, disc, track',
  year: 'year desc, album collate nocase, disc, track',
  track: 'album collate nocase, disc, track, title collate nocase'
}

export { ORDER }

function toItem(r: Row): MediaItem {
  return {
    id: r.id as number,
    path: r.path as string,
    type: r.type as MediaType,
    title: r.title as string,
    folder: r.folder as string,
    duration: r.duration as number,
    size: r.size as number,
    mtime: r.mtime as number,
    width: r.width as number,
    height: r.height as number,
    artist: (r.artist as string) ?? null,
    album: (r.album as string) ?? null,
    genre: (r.genre as string) ?? null,
    year: (r.year as number) ?? null,
    track: (r.track as number) ?? null,
    addedAt: r.added_at as number,
    lastPlayed: (r.last_played as number) ?? null,
    position: r.position as number,
    playCount: r.play_count as number,
    favorite: !!r.favorite,
    watched: !!r.watched,
    poster: (r.poster as string) ?? null,
    inLibrary: !!r.in_library
  }
}

export class LibraryDb {
  db: DatabaseSync

  constructor(file = join(app.getPath('userData'), 'library.sqlite')) {
    mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('pragma journal_mode = wal; pragma foreign_keys = on;')
    this.db.exec(SCHEMA)
    this.migrate()
  }

  private migrate(): void {
    const cols = new Set((this.db.prepare('pragma table_info(media)').all() as Row[]).map((r) => r.name as string))
    if (!cols.has('disc')) {
      this.db.exec('alter table media add column disc integer; alter table media add column album_artist text')
      // Read tags again so multi-disc albums and album artists are known.
      this.db.exec("update media set probed = 0 where type = 'audio'")
    }
  }

  tx<T>(fn: () => T): T {
    this.db.exec('begin')
    try {
      const out = fn()
      this.db.exec('commit')
      return out
    } catch (err) {
      this.db.exec('rollback')
      throw err
    }
  }

  // Roots
  roots(): string[] {
    return (this.db.prepare('select path from roots order by added_at').all() as Row[]).map((r) => r.path as string)
  }
  addRoot(path: string): void {
    this.db.prepare('insert or ignore into roots(path, added_at) values (?, ?)').run(path, Date.now())
  }
  removeRoot(path: string): void {
    this.tx(() => {
      this.db.prepare('delete from roots where path = ?').run(path)
      // Keep history for played items; drop the rest.
      this.db.prepare(`delete from media where (path = ? or ${UNDER('path')}) and last_played is null and favorite = 0`).run(path, ...under(path))
      this.db.prepare(`update media set in_library = 0 where path = ? or ${UNDER('path')}`).run(path, ...under(path))
    })
  }

  // Media
  byPath(path: string): MediaItem | null {
    const r = this.db.prepare('select * from media where path = ?').get(path) as Row | undefined
    return r ? toItem(r) : null
  }
  byId(id: number): MediaItem | null {
    const r = this.db.prepare('select * from media where id = ?').get(id) as Row | undefined
    return r ? toItem(r) : null
  }

  /** Inserts or refreshes a scanned file. Returns true if it's new or changed (needs probing). */
  upsertScanned(f: { path: string; type: MediaType; size: number; mtime: number }): boolean {
    const old = this.db.prepare('select size, mtime, probed, in_library from media where path = ?').get(f.path) as Row | undefined
    if (old && old.size === f.size && old.mtime === f.mtime && old.probed) {
      if (!old.in_library) this.db.prepare('update media set in_library = 1 where path = ?').run(f.path)
      return false
    }
    const title = basename(f.path).replace(/\.[^.]+$/, '')
    this.db
      .prepare(
        `insert into media(path, type, title, folder, size, mtime, added_at, in_library) values (?, ?, ?, ?, ?, ?, ?, 1)
         on conflict(path) do update set size = excluded.size, mtime = excluded.mtime, probed = 0, in_library = 1`
      )
      .run(f.path, f.type, title, dirname(f.path), f.size, f.mtime, Date.now())
    return true
  }

  setProbe(path: string, p: Partial<{ duration: number; width: number; height: number; title: string; artist: string; album: string; albumArtist: string; genre: string; year: number; track: number; disc: number }>): void {
    this.db
      .prepare(
        `update media set duration = ?, width = ?, height = ?, title = coalesce(?, title), artist = ?, album = ?, album_artist = ?, genre = ?, year = ?, track = ?, disc = ?, probed = 1 where path = ?`
      )
      .run(p.duration ?? 0, p.width ?? 0, p.height ?? 0, p.title ?? null, p.artist ?? null, p.album ?? null, p.albumArtist ?? null, p.genre ?? null, p.year ?? null, p.track ?? null, p.disc ?? null, path)
  }

  setPoster(id: number, poster: string): void {
    this.db.prepare('update media set poster = ? where id = ?').run(poster, id)
  }

  /** Removes library rows under `root` that weren't seen in the latest scan (except under folders that couldn't be read). */
  prune(root: string, seen: Set<string>, unreadable: string[] = []): number {
    const rows = this.db.prepare(`select path from media where in_library = 1 and ${UNDER('path')}`).all(...under(root)) as Row[]
    let removed = 0
    for (const r of rows) {
      const p = r.path as string
      if (seen.has(p) || unreadable.some((d) => p.startsWith(`${d}/`))) continue
      this.db.prepare('update media set in_library = 0 where path = ?').run(p)
      removed++
    }
    return removed
  }

  unprobed(limit = 200): MediaItem[] {
    return (this.db.prepare('select * from media where probed = 0 and in_library = 1 limit ?').all(limit) as Row[]).map(toItem)
  }

  /** Files directly in `dir`; `history` also includes played files outside the library folders. */
  inFolder(dir: string, types: MediaType[], sort: SortKey, history = false): MediaItem[] {
    const t = types.map(() => '?').join(',')
    const scope = history ? '(in_library = 1 or last_played is not null)' : 'in_library = 1'
    return (this.db.prepare(`select * from media where ${scope} and folder = ? and type in (${t}) order by ${ORDER[sort]}`).all(dir, ...types) as Row[]).map(toItem)
  }

  /** Library folders below `dir` that contain media of the given types, with counts. */
  subfolderCounts(dir: string, types: MediaType[]): Map<string, { count: number; posters: string[]; firstId?: number }> {
    const t = types.map(() => '?').join(',')
    const rows = this.db
      .prepare(`select id, folder, poster, type from media where in_library = 1 and ${UNDER('folder')} and type in (${t}) order by path`)
      .all(...under(dir), ...types) as Row[]
    const out = new Map<string, { count: number; posters: string[]; firstId?: number }>()
    for (const r of rows) {
      const rest = (r.folder as string).slice(dir.length + 1)
      const child = `${dir}/${rest.split('/')[0]}`
      const e = out.get(child) ?? { count: 0, posters: [] as string[], firstId: undefined as number | undefined }
      e.count++
      if (e.firstId === undefined && r.type === 'video') e.firstId = r.id as number
      if (r.poster && e.posters.length < 4) e.posters.push(r.poster as string)
      out.set(child, e)
    }
    return out
  }

  countUnder(dir: string, types: MediaType[]): number {
    const t = types.map(() => '?').join(',')
    const r = this.db.prepare(`select count(*) n from media where in_library = 1 and (folder = ? or ${UNDER('folder')}) and type in (${t})`).get(dir, ...under(dir), ...types) as Row
    return r.n as number
  }

  search(q: string, types: MediaType[], limit = 200): MediaItem[] {
    const t = types.map(() => '?').join(',')
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    // Match the path below its library folder, not the whole path ("Movies" or the user name would match everything).
    const roots = this.roots()
    const rel = roots.map(() => `(${UNDER('path')} and substr(path, ?) like ? escape '\\')`).join(' or ') || '0'
    const relArgs = roots.flatMap((r) => [...under(r), r.length + 2, like])
    return (this.db
      .prepare(`select * from media where in_library = 1 and type in (${t}) and (title like ? escape '\\' or artist like ? escape '\\' or album like ? escape '\\' or genre like ? escape '\\' or ${rel}) order by title collate nocase limit ?`)
      .all(...types, like, like, like, like, ...relArgs, limit) as Row[]).map(toItem)
  }

  query(sql: string, ...params: (string | number | null)[]): MediaItem[] {
    return (this.db.prepare(sql).all(...params) as Row[]).map(toItem)
  }

  raw<T = Row>(sql: string, ...params: (string | number | null)[]): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }

  // Playback history
  touchPlayed(path: string, type: MediaType, title: string, duration: number): void {
    this.db
      .prepare(
        `insert into media(path, type, title, folder, duration, added_at, last_played, probed, in_library) values (?, ?, ?, ?, ?, ?, ?, 1, 0)
         on conflict(path) do update set last_played = excluded.last_played, duration = case when excluded.duration > 0 then excluded.duration else media.duration end`
      )
      .run(path, type, title, /^[a-z]+:\/\//i.test(path) ? '' : dirname(path), duration, Date.now(), Date.now())
  }
  savePosition(path: string, position: number, duration: number): void {
    // Live streams have no duration and nothing to resume.
    if (!(duration > 0)) return
    // Near the end counts as finished; stopping part-way through a rewatch makes it resumable again.
    const finished = position > duration - Math.min(30, duration * 0.05)
    this.db
      .prepare('update media set position = ?, watched = case when ? then 1 when ? > 10 then 0 else watched end, duration = ? where path = ?')
      .run(finished ? 0 : position, finished ? 1 : 0, finished ? 0 : position, duration, path)
  }
  finished(path: string): void {
    this.db.prepare('update media set position = 0, watched = 1, play_count = play_count + 1 where path = ?').run(path)
  }
  setFavorite(path: string, on: boolean): void {
    this.db.prepare('update media set favorite = ? where path = ?').run(on ? 1 : 0, path)
  }
  setWatched(path: string, on: boolean): void {
    this.db.prepare('update media set watched = ?, position = 0 where path = ?').run(on ? 1 : 0, path)
  }
  clearHistory(): void {
    this.tx(() => {
      this.db.exec('update media set last_played = null, position = 0, play_count = 0, watched = 0')
      this.db.exec('delete from media where in_library = 0 and favorite = 0')
    })
  }

  // Playlists
  playlists(): Playlist[] {
    return (this.db
      .prepare(`select p.*, (select count(*) from playlist_items i where i.playlist_id = p.id) n from playlists p order by p.created_at`)
      .all() as Row[]).map((r) => ({ id: r.id as number, name: r.name as string, count: r.n as number, cover: (r.cover as string) ?? null, createdAt: r.created_at as number }))
  }
  createPlaylist(name: string, paths: string[] = [], cover: string | null = null): number {
    return this.tx(() => {
      const res = this.db.prepare('insert into playlists(name, cover, created_at) values (?, ?, ?)').run(name, cover, Date.now())
      const id = Number(res.lastInsertRowid)
      this.appendToPlaylistRaw(id, paths)
      return id
    })
  }
  private appendToPlaylistRaw(id: number, paths: string[]) {
    const max = (this.db.prepare('select coalesce(max(pos), -1) m from playlist_items where playlist_id = ?').get(id) as Row).m as number
    const ins = this.db.prepare('insert into playlist_items(playlist_id, pos, path) values (?, ?, ?)')
    paths.forEach((p, i) => ins.run(id, max + 1 + i, p))
  }
  addToPlaylist(id: number, paths: string[]): void {
    this.tx(() => this.appendToPlaylistRaw(id, paths))
  }
  playlistPaths(id: number): string[] {
    return (this.db.prepare('select path from playlist_items where playlist_id = ? order by pos').all(id) as Row[]).map((r) => r.path as string)
  }
  setPlaylistPaths(id: number, paths: string[]): void {
    this.tx(() => {
      this.db.prepare('delete from playlist_items where playlist_id = ?').run(id)
      this.appendToPlaylistRaw(id, paths)
    })
  }
  renamePlaylist(id: number, name: string): void {
    this.db.prepare('update playlists set name = ? where id = ?').run(name, id)
  }
  setPlaylistCover(id: number, cover: string | null): void {
    this.db.prepare('update playlists set cover = ? where id = ?').run(cover, id)
  }
  deletePlaylist(id: number): void {
    this.db.prepare('delete from playlists where id = ?').run(id)
  }

  // Bookmarks
  bookmarks(path: string): { id: number; time: number; name: string }[] {
    return this.db.prepare('select id, time, name from bookmarks where path = ? order by time').all(path) as { id: number; time: number; name: string }[]
  }
  addBookmark(path: string, time: number, name: string): void {
    this.db.prepare('insert into bookmarks(path, time, name, created_at) values (?, ?, ?, ?)').run(path, time, name, Date.now())
  }
  removeBookmark(id: number): void {
    this.db.prepare('delete from bookmarks where id = ?').run(id)
  }
}
