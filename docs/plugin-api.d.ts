// Type definitions for FLP plugins. Copied into every new plugin so editors can autocomplete `flp`.
// In main.js:  /** @param {import('./plugin-api').FLP} flp */  export function activate(flp) { … }

export interface Disposable {
  dispose(): void
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
  kind: 'video' | 'audio' | 'image' | null
  tracks: { id: number; type: 'video' | 'audio' | 'sub'; title?: string; lang?: string; codec?: string; selected: boolean; external: boolean }[]
  chapters: { title: string; time: number }[]
  playlist: { filename: string; title?: string; current: boolean }[]
  playlistPos: number
  metadata: Record<string, string>
}

export type PlayerEvent =
  | 'state' // any change; receives a partial PlayerState
  | 'time' // receives seconds (about 4 times a second while playing)
  | 'pause' // receives true/false
  | 'file-loaded' // receives { path, title, duration, private } — private: Privacy settings say not to remember this file
  | 'ended' // receives { path, reason: 'eof' | 'stop' | 'error' | … }; 'eof' also fires when the last item finishes

export type SettingDef = { key: string; label: string; info?: string } & (
  | { type: 'toggle'; default: boolean }
  | { type: 'select'; default: string | number; options: { value: string | number; label: string }[] }
  | { type: 'slider'; default: number; min: number; max: number; step: number }
  | { type: 'number'; default: number; min?: number; max?: number; step?: number; suffix?: string }
  | { type: 'text'; default: string; placeholder?: string; secret?: boolean }
  | { type: 'color'; default: string }
)

export interface Panel extends Disposable {
  /** Send data to the panel (received with flp.onMessage inside the panel). */
  postMessage(data: unknown): Promise<void>
  /** Receive data the panel sends with flp.postMessage. */
  onMessage(cb: (data: any) => void): Disposable
}

export interface FLP {
  plugin: { id: string; name: string; version: string; dir: string }
  /** Writes to the plugin's log (shown in Settings → Extensions). */
  log(...args: unknown[]): void

  player: {
    play(): Promise<void>
    pause(): Promise<void>
    toggle(): Promise<void>
    stop(): Promise<void>
    next(): Promise<void>
    previous(): Promise<void>
    seek(seconds: number, mode?: 'absolute' | 'relative'): Promise<void>
    /** Opens files or URLs (replacing the queue unless append is true). */
    open(paths: string | string[], opts?: { append?: boolean }): Promise<void>
    state(): Promise<PlayerState>
    /** Any mpv property, e.g. get('video-codec'), set('speed', 1.5). See https://mpv.io/manual/stable/#properties */
    get(property: string): Promise<unknown>
    set(property: string, value: unknown): Promise<void>
    /** Any mpv command, e.g. command('screenshot'), command('sub-add', '/path/to.srt'). */
    command(...args: unknown[]): Promise<unknown>
    on(event: PlayerEvent, cb: (data: any) => void): Disposable
  }

  commands: {
    /**
     * Adds an action. It appears in the menus, the ⌘K palette, Keyboard Shortcuts and Customize Player.
     * `id` is local to your plugin (FLP prefixes it with your plugin id).
     * `icon` is any FLP icon name, e.g. 'play', 'subtitles', 'info', 'favorite', 'snapshot'.
     * `keys` are default shortcuts like ['Mod+Shift+T'] (Mod = ⌘ on macOS).
     */
    register(cmd: { id: string; title: string; icon?: string; keys?: string[]; category?: string; run(arg?: unknown): unknown }): Disposable
    /** Runs any command, including built-in ones like 'player.snapshot' or 'ui.settings'. */
    run(commandId: string, arg?: unknown): Promise<void>
  }

  ui: {
    /** A message at the bottom of the window, optionally with a button that runs a command. */
    notify(text: string, opts?: { action?: { label: string; command: string } }): Promise<void>
    /** A short on-screen message in the corner (like "Volume 80%"). */
    osd(text: string): Promise<void>
    /** Puts one of your commands on the control bar. */
    addControlButton(commandId: string): Disposable
    /** Adds an entry to the right-click menu (under Plugins). */
    addContextMenuItem(item: { label: string; command: string }): Disposable
    /** A tab in the effects sidebar with your own HTML (from `html` or a file, default panel.html). */
    addPanel(panel: { id: string; title: string; html?: string; file?: string }): Panel
  }

  settings: {
    /** Declares settings; FLP shows them under Settings → Extensions → your plugin. */
    define(defs: SettingDef[]): Promise<void>
    get<T = unknown>(key: string): T
    set(key: string, value: unknown): Promise<void>
    onChange(cb: (values: Record<string, unknown>) => void): Disposable
  }

  /** Small persistent key/value store for your plugin (JSON). */
  storage: {
    get<T = unknown>(key: string, fallback?: T): T
    set(key: string, value: unknown): void
    delete(key: string): void
  }

  /** Needs "library" in plugin.json permissions. */
  library: {
    search(query: string): Promise<{ path: string; title: string; type: string; duration: number }[]>
    recent(): Promise<{ path: string; title: string; lastPlayed: number | null }[]>
    playlists(): Promise<{ id: number; name: string; count: number }[]>
    createPlaylist(name: string, paths: string[]): Promise<number>
  }

  /** Standard fetch. Requires "network" in plugin.json permissions. */
  fetch(input: string, init?: RequestInit): Promise<Response>
}
