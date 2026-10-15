export type MediaType = 'video' | 'audio' | 'image'

export interface MediaItem {
  id: number
  path: string
  type: MediaType
  title: string
  folder: string
  duration: number
  size: number
  mtime: number
  width: number
  height: number
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
  track: number | null
  addedAt: number
  lastPlayed: number | null
  position: number
  playCount: number
  favorite: boolean
  watched: boolean
  poster: string | null
  inLibrary: boolean
}

export interface FolderEntry {
  path: string
  name: string
  count: number
  /** A few poster paths from inside, for the folder tile. */
  posters: string[]
  /** A media id inside, used to generate a poster when none exists yet. */
  firstId?: number
}

export interface Crumb {
  name: string
  path: string | null
}

export interface BrowseResult {
  dir: string | null
  crumbs: Crumb[]
  folders: FolderEntry[]
  items: MediaItem[]
}

export interface Playlist {
  id: number
  name: string
  count: number
  cover: string | null
  createdAt: number
}

export interface HomeData {
  continueWatching: MediaItem[]
  listenAgain: MediaItem[]
  frequentFolders: FolderEntry[]
  recentlyAdded: MediaItem[]
}

export type MusicView = 'songs' | 'albums' | 'artists' | 'genres'

export interface MusicGroup {
  name: string
  /** What to pass back as the filter (albums: album + album artist, so same-named albums stay apart). */
  key?: string
  subtitle: string
  count: number
  cover: string | null
}

export type SortKey =
  | 'name' | 'name-desc' | 'added' | 'added-asc' | 'modified' | 'modified-asc' | 'duration' | 'duration-desc'
  | 'size' | 'size-desc' | 'played' | 'plays' | 'artist' | 'album' | 'year' | 'track'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'added', label: 'Recently added' },
  { value: 'added-asc', label: 'Oldest added' },
  { value: 'modified', label: 'Recently modified' },
  { value: 'modified-asc', label: 'Oldest modified' },
  { value: 'duration', label: 'Shortest first' },
  { value: 'duration-desc', label: 'Longest first' },
  { value: 'size', label: 'Smallest first' },
  { value: 'size-desc', label: 'Largest first' },
  { value: 'played', label: 'Recently played' },
  { value: 'plays', label: 'Most played' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'year', label: 'Year' },
  { value: 'track', label: 'Track number' }
]

export interface ScanStatus {
  scanning: boolean
  done: number
  total: number
  root: string | null
}

export const VIDEO_EXT = new Set([
  'mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'm2ts', 'mts', 'ts', 'vob', '3gp', 'ogv', 'rm', 'rmvb',
  'asf', 'divx', 'f4v', 'mxf', 'dv', 'y4m', 'hevc', 'h264', 'h265', 'av1', 'ivf', 'nut'
])
export const AUDIO_EXT = new Set([
  'mp3', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'aiff', 'aif', 'alac', 'wma', 'ape', 'wv', 'mka', 'dsf', 'dff',
  'mpc', 'tta', 'ac3', 'eac3', 'dts', 'mid', 'midi', 'mod', 'xm', 's3m', 'it', 'caf', 'amr', 'au', 'spx'
])
export const IMAGE_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'jxl', 'svg', 'ico', 'psd', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2'
])

export function typeOf(path: string): MediaType | null {
  // For URLs only the path counts ("ep.mp3?dest=1" is audio, "radio.example/stream" is unknown).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      return null
    }
  }
  const name = path.split('/').pop() ?? ''
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (VIDEO_EXT.has(ext)) return 'video'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (IMAGE_EXT.has(ext)) return 'image'
  return null
}
