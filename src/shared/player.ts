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
}

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
  error: null
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
