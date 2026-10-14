import { createRequire } from 'node:module'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app, type BrowserWindow } from 'electron'
import { initialPlayerState, mediaKind, type Chapter, type PlayerState, type Track } from '@shared/player'

interface NativePlayer {
  command(args: unknown[]): unknown
  setProperty(name: string, value: unknown): void
  getProperty(name: string): unknown
  observe(name: string): void
  poll(): MpvEvent[]
  setBounds(x: number, y: number, w: number, h: number): void
  setVisible(visible: boolean): void
  setCornerRadius(radius: number): void
  destroy(): void
}

interface MpvEvent {
  event: string
  name?: string
  data?: unknown
  reason?: string
  error?: string
  prefix?: string
  level?: string
  text?: string
}

const require = createRequire(import.meta.url)
const { Player } = require(join(app.getAppPath(), 'native/mpv-view/build/Release/mpv_view.node')) as {
  Player: new (handle: Buffer, onWakeup: () => void, options?: Record<string, string>) => NativePlayer
}

// mpv property -> how it maps onto PlayerState.
const OBSERVED: Record<string, (v: any) => Partial<PlayerState>> = {
  path: (v) => ({ path: v ?? null }),
  'media-title': (v) => ({ title: v ?? null }),
  'idle-active': (v) => ({ idle: !!v }),
  pause: (v) => ({ paused: !!v }),
  'time-pos': (v) => ({ time: v ?? 0 }),
  duration: (v) => ({ duration: v ?? 0 }),
  volume: (v) => ({ volume: v ?? 100 }),
  mute: (v) => ({ muted: !!v }),
  speed: (v) => ({ speed: v ?? 1 }),
  'track-list': (v) => ({ tracks: toTracks(v) }),
  'chapter-list': (v) => ({ chapters: ((v ?? []) as any[]).map((c): Chapter => ({ title: c.title ?? '', time: c.time })) }),
  chapter: (v) => ({ chapter: v ?? -1 }),
  'paused-for-cache': (v) => ({ buffering: !!v }),
  'eof-reached': (v) => ({ eof: !!v }),
  'video-params': (v) => ({ videoWidth: v?.dw ?? 0, videoHeight: v?.dh ?? 0 }),
  playlist: (v) => ({
    playlist: ((v ?? []) as any[]).map((e) => ({ filename: e.filename, title: e.title, current: !!e.current }))
  }),
  'playlist-pos': (v) => ({ playlistPos: v ?? -1 }),
  'loop-file': (v) => ({ loopFile: v !== false && v !== 'no' && v !== 0 }),
  'loop-playlist': (v) => ({ loopPlaylist: v !== false && v !== 'no' && v !== 0 }),
  'ab-loop-a': (v) => ({ abA: typeof v === 'number' ? v : null }),
  'ab-loop-b': (v) => ({ abB: typeof v === 'number' ? v : null }),
  'sub-delay': (v) => ({ subDelay: v ?? 0 }),
  'audio-delay': (v) => ({ audioDelay: v ?? 0 }),
  'demuxer-cache-duration': (v) => ({ cacheAhead: v ?? 0 }),
  seekable: (v) => ({ seekable: v !== false }),
  'stream-record': (v) => ({ recording: !!v }),
  metadata: (v) => ({ metadata: (v ?? {}) as Record<string, string> })
}

function toTracks(list: any[] | null): Track[] {
  return (list ?? []).map((t) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    lang: t.lang,
    codec: t.codec,
    selected: !!t.selected,
    external: !!t.external,
    default: !!t.default,
    albumart: !!t.albumart,
    image: !!t.image,
    channels: t['demux-channels'],
    width: t['demux-w'],
    height: t['demux-h']
  }))
}

// Owns one libmpv instance drawn into a window. Emits 'state' with partial PlayerState patches.
export class PlayerBridge extends EventEmitter {
  private native: NativePlayer
  private lastTimeEmit = 0
  // Full merged state, so a renderer that (re)loads can catch up.
  state: PlayerState = { ...initialPlayerState }

  constructor(win: BrowserWindow) {
    super()
    this.on('state', (patch: Partial<PlayerState>) => {
      Object.assign(this.state, patch)
      if ('path' in patch || 'tracks' in patch) {
        const kind = mediaKind(this.state.path, this.state.tracks)
        if (kind !== this.state.kind) {
          this.state.kind = kind
          this.emit('state', { kind })
        }
      }
    })
    this.native = new Player(win.getNativeWindowHandle(), () => this.drain())
    for (const name of Object.keys(OBSERVED)) this.native.observe(name)
  }

  private drain(): void {
    for (const ev of this.native.poll()) {
      if (ev.event === 'property-change' && ev.name) {
        // time-pos fires every frame; ~10 updates a second is plenty for the UI.
        if (ev.name === 'time-pos') {
          const now = Date.now()
          if (now - this.lastTimeEmit < 100) {
            this.state.time = (ev.data as number) ?? 0
            continue
          }
          this.lastTimeEmit = now
        }
        this.emit('state', OBSERVED[ev.name]?.(ev.data) ?? {})
      } else if (ev.event === 'start-file') {
        this.emit('state', { error: null })
      } else if (ev.event === 'end-file' && ev.reason === 'error') {
        this.emit('state', { error: ev.error ?? 'Could not play this file' })
      } else if (ev.event === 'log-message' && ev.level === 'error') {
        console.error(`[mpv/${ev.prefix}] ${ev.text?.trim()}`)
      }
    }
  }

  command(args: unknown[]): unknown {
    return this.native.command(args)
  }
  set(name: string, value: unknown): void {
    this.native.setProperty(name, value)
  }
  get(name: string): unknown {
    return this.native.getProperty(name)
  }
  setBounds(x: number, y: number, w: number, h: number): void {
    this.native.setBounds(x, y, w, h)
  }
  setVisible(visible: boolean): void {
    this.native.setVisible(visible)
  }
  setCornerRadius(radius: number): void {
    this.native.setCornerRadius(radius)
  }
  destroy(): void {
    this.native.destroy()
  }
}
