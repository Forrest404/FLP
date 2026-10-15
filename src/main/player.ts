import { createRequire } from 'node:module'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app, type BrowserWindow } from 'electron'
import { initialPlayerState, mediaKind, type Chapter, type PlayerState, type Track } from '@shared/player'

interface NativePlayer {
  command(args: unknown[]): unknown
  commandAsync(id: number, args: unknown[]): number
  setPropertyAsync(id: number, name: string, value: unknown): number
  getPropertyAsync(id: number, name: string): number
  setProperty(name: string, value: unknown): void
  getProperty(name: string): unknown
  observe(name: string): void
  poll(): MpvEvent[]
  setBounds(x: number, y: number, w: number, h: number): void
  setVisible(visible: boolean): void
  setCornerRadius(radius: number): void
  setLogLevel(level: string): void
  destroy(): void
}

interface MpvEvent {
  event: string
  id?: number
  name?: string
  data?: unknown
  reason?: string
  error?: string
  prefix?: string
  level?: string
  text?: string
}

const require = createRequire(import.meta.url)
// Packaged: the addon and its libraries live in Resources/native (see scripts/bundle-macos.sh).
const addonPath = app.isPackaged
  ? join(process.resourcesPath, 'native', 'mpv_view.node')
  : join(app.getAppPath(), 'native/mpv-view/build/Release/mpv_view.node')
const { Player } = require(addonPath) as {
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
  private timeFlush: NodeJS.Timeout | undefined
  private nextId = 1
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; what: string }>()
  // Full merged state, so a renderer that (re)loads can catch up.
  state: PlayerState = { ...initialPlayerState }

  constructor(win: BrowserWindow, options: Record<string, string> = {}) {
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
    this.native = new Player(win.getNativeWindowHandle(), () => this.drain(), options)
    for (const name of Object.keys(OBSERVED)) this.native.observe(name)
  }

  private drain(): void {
    for (const ev of this.native.poll()) {
      if (process.env.FLP_DEBUG_MPV && ev.name !== 'time-pos') console.log('[mpv event]', JSON.stringify(ev).slice(0, 200))
      if (ev.id && this.pending.has(ev.id)) {
        const p = this.pending.get(ev.id)!
        this.pending.delete(ev.id)
        if (ev.error) p.reject(new Error(`${p.what}: ${ev.error}`))
        else p.resolve(ev.data ?? null)
        continue
      }
      if (ev.event === 'property-change' && ev.name) {
        // time-pos fires every frame; ~10 updates a second is plenty for the UI.
        if (ev.name === 'time-pos') {
          const now = Date.now()
          if (now - this.lastTimeEmit < 100) {
            // Hold back, but make sure the final position (e.g. after a seek while paused) still goes out.
            this.state.time = (ev.data as number) ?? 0
            this.timeFlush ??= setTimeout(() => {
              this.timeFlush = undefined
              this.lastTimeEmit = Date.now()
              this.emit('state', { time: this.state.time })
            }, 100)
            continue
          }
          clearTimeout(this.timeFlush)
          this.timeFlush = undefined
          this.lastTimeEmit = now
        }
        this.emit('state', OBSERVED[ev.name]?.(ev.data) ?? {})
      } else if (ev.event === 'start-file') {
        this.emit('state', { error: null })
      } else if (ev.event === 'file-loaded') {
        this.emit('file-loaded')
      } else if (ev.event === 'end-file') {
        this.emit('end-file', ev.reason)
        if (ev.reason === 'error') this.emit('state', { error: ev.error ?? 'Could not play this file' })
      } else if (ev.event === 'log-message') {
        this.emit('log', { level: ev.level ?? 'info', prefix: ev.prefix ?? '', text: (ev.text ?? '').trimEnd() })
        if (ev.level === 'error' || ev.level === 'fatal') console.error(`[mpv/${ev.prefix}] ${ev.text?.trim()}`)
      }
    }
  }

  // All calls are asynchronous: the main thread is also mpv's render thread, so a blocking call
  // that waits on the video output would deadlock.
  private call(what: string, start: (id: number) => number): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, what })
      const err = start(id)
      if (process.env.FLP_DEBUG_MPV) console.log('[mpv call]', id, what, err)
      if (typeof err === 'number' && err < 0) {
        this.pending.delete(id)
        reject(new Error(`${what}: error ${err}`))
      }
    })
  }
  command(args: unknown[]): Promise<unknown> {
    return this.call(String(args[0]), (id) => this.native.commandAsync(id, args))
  }
  set(name: string, value: unknown): Promise<unknown> {
    return this.call(name, (id) => this.native.setPropertyAsync(id, name, value))
  }
  get(name: string): Promise<unknown> {
    return this.call(name, (id) => this.native.getPropertyAsync(id, name)).catch(() => null)
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
  setLogLevel(level: string): void {
    this.native.setLogLevel(level)
  }
  destroy(): void {
    clearTimeout(this.timeFlush)
    this.native.destroy()
  }
}
