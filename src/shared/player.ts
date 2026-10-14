// Shapes shared by the main process, preload and renderer.

export interface Track {
  id: number
  type: 'video' | 'audio' | 'sub'
  title?: string
  lang?: string
  codec?: string
  selected: boolean
  external: boolean
  default?: boolean
  /** Embedded cover art (shown as a still "video" track by mpv). */
  albumart?: boolean
  image?: boolean
  channels?: string
  width?: number
  height?: number
}

export interface PlaylistEntry {
  filename: string
  title?: string
  current: boolean
}

export type MediaKind = 'video' | 'audio' | 'image' | null

export interface Chapter {
  title: string
  time: number
}

export interface PlayerState {
  path: string | null
  title: string | null
  idle: boolean
  paused: boolean
  time: number
  duration: number
  volume: number
  muted: boolean
  speed: number
  tracks: Track[]
  chapters: Chapter[]
  chapter: number
  buffering: boolean
  eof: boolean
  videoWidth: number
  videoHeight: number
  error: string | null
  playlist: PlaylistEntry[]
  playlistPos: number
  loopFile: boolean
  loopPlaylist: boolean
  shuffled: boolean
  abA: number | null
  abB: number | null
  subDelay: number
  audioDelay: number
  /** Seconds of media buffered ahead (network streams). */
  cacheAhead: number
  seekable: boolean
  recording: boolean
  metadata: Record<string, string>
  kind: MediaKind
}

export const initialPlayerState: PlayerState = {
  path: null,
  title: null,
  idle: true,
  paused: true,
  time: 0,
  duration: 0,
  volume: 100,
  muted: false,
  speed: 1,
  tracks: [],
  chapters: [],
  chapter: -1,
  buffering: false,
  eof: false,
  videoWidth: 0,
  videoHeight: 0,
  error: null,
  playlist: [],
  playlistPos: -1,
  loopFile: false,
  loopPlaylist: false,
  shuffled: false,
  abA: null,
  abB: null,
  subDelay: 0,
  audioDelay: 0,
  cacheAhead: 0,
  seekable: true,
  recording: false,
  metadata: {},
  kind: null
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|ico|svg|heic|heif|tiff?|jxl|psd|raw|cr2|cr3|nef|arw|dng|orf|rw2)$/i

/** Decides how to present the current media from its tracks. */
export function mediaKind(path: string | null, tracks: Track[]): MediaKind {
  if (!path) return null
  if (IMAGE_EXT.test(path)) return 'image'
  const video = tracks.find((t) => t.type === 'video' && !t.albumart)
  if (video) return video.image ? 'image' : 'video'
  if (tracks.some((t) => t.type === 'audio')) return 'audio'
  return null
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXT.test(path)
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
