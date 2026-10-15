import type { Bounds, PlayerState } from './player'
import type { SettingsSnapshot } from './settings-store'
import type { PluginContributions, PluginInfo } from './plugins'
import type { BrowseResult, HomeData, MediaItem, MusicGroup, MusicView, Playlist, ScanStatus, SortKey } from './library'

export interface AudioTags {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: number
  track?: number
  disc?: number
  duration?: number
  cover?: string
}

export type MenuSpecItem =
  | { label: string; command?: string; accelerator?: string; checked?: boolean; submenu?: MenuSpecItem[] }
  | 'separator'

export interface MenuSpec {
  label: string
  items: MenuSpecItem[]
}

/** URL the UI can load a local file from. */
export function mediaUrl(path: string): string {
  return `flp-media://file${path.split('/').map(encodeURIComponent).join('/')}`
}

// The API the preload script exposes to the renderer as window.flp.
export interface RendererApi {
  player: {
    command(...args: (string | number | boolean)[]): Promise<unknown>
    set(name: string, value: unknown): Promise<void>
    get(name: string): Promise<unknown>
    snapshot(): Promise<PlayerState>
    setBounds(b: Bounds): void
    setVisible(visible: boolean): void
    setCornerRadius(radius: number): void
    onState(cb: (patch: Partial<PlayerState>) => void): () => void
  }
  settings: {
    snapshot(): Promise<SettingsSnapshot>
    set(key: string, value: unknown): Promise<void>
    setMany(patch: Record<string, unknown>): Promise<void>
    resetAll(): Promise<void>
    setProfile(id: string | null): Promise<void>
    createProfile(name: string): Promise<string>
    renameProfile(id: string, name: string): Promise<void>
    deleteProfile(id: string): Promise<void>
    setUi(key: string, value: unknown): Promise<void>
    onChange(cb: (snap: SettingsSnapshot) => void): () => void
  }
  dialog: {
    openFiles(opts?: { folders?: boolean; multiple?: boolean; title?: string }): Promise<string[]>
  }
  window: {
    toggleFullscreen(): void
    isFullscreen(): Promise<boolean>
    onFullscreen(cb: (fs: boolean) => void): () => void
    setAlwaysOnTop(on: boolean): void
    minimize(): void
    pip(on: boolean): void
    zoom(): void
    close(): void
  }
  media: {
    thumbnail(path: string, time: number): Promise<string | null>
    waveform(path: string): Promise<number[]>
    tags(path: string): Promise<AudioTags>
    displayableImage(path: string): Promise<string>
    poster(path: string, duration?: number): Promise<string | null>
  }
  library: {
    roots(): Promise<string[]>
    addRoot(path: string): Promise<void>
    removeRoot(path: string): Promise<void>
    rescan(): Promise<void>
    status(): Promise<ScanStatus>
    browse(kind: 'video' | 'audio' | 'image' | 'all', dir: string | null, sort: SortKey): Promise<BrowseResult>
    search(query: string, kind: string): Promise<MediaItem[]>
    home(): Promise<HomeData>
    recent(): Promise<MediaItem[]>
    favorites(): Promise<MediaItem[]>
    music(view: MusicView, filter: string | null, sort: SortKey): Promise<MediaItem[] | MusicGroup[]>
    poster(id: number): Promise<string | null>
    item(path: string): Promise<MediaItem | null>
    setFavorite(path: string, on: boolean): Promise<void>
    setWatched(path: string, on: boolean): Promise<void>
    clearHistory(): Promise<void>
    playlists(): Promise<Playlist[]>
    createPlaylist(name: string, paths: string[], cover?: string | null): Promise<number>
    playlistPaths(id: number): Promise<string[]>
    addToPlaylist(id: number, paths: string[]): Promise<void>
    setPlaylistPaths(id: number, paths: string[]): Promise<void>
    renamePlaylist(id: number, name: string): Promise<void>
    deletePlaylist(id: number): Promise<void>
    exportPlaylist(id: number): Promise<void>
    bookmarks(path: string): Promise<{ id: number; time: number; name: string }[]>
    addBookmark(path: string, time: number, name: string): Promise<void>
    removeBookmark(id: number): Promise<void>
    onChanged(cb: () => void): () => void
    onStatus(cb: (s: ScanStatus) => void): () => void
  }
  plugins: {
    list(): Promise<PluginInfo[]>
    contributions(): Promise<PluginContributions>
    logs(): Promise<{ pluginId: string; level: string; text: string; at: number }[]>
    setEnabled(id: string, enabled: boolean): Promise<void>
    reload(id?: string): Promise<void>
    invoke(pluginId: string, command: string, arg?: unknown): Promise<{ result?: unknown; error?: string }>
    panelMessage(pluginId: string, panelId: string, data: unknown): void
    install(): Promise<string | null>
    remove(id: string): Promise<void>
    create(name: string): Promise<string>
    openFolder(): void
    openGuide(): void
    onList(cb: (list: PluginInfo[]) => void): () => void
    onContributions(cb: (c: PluginContributions) => void): () => void
    onNotify(cb: (plugin: string, text: string, action: { label: string; command: string } | null) => void): () => void
    onOsd(cb: (text: string) => void): () => void
    onPanelMessage(cb: (pluginId: string, panelId: string, data: unknown) => void): () => void
    onLog(cb: (entry: { pluginId: string; level: string; text: string; at: number }) => void): () => void
  }
  onView(cb: (view: 'player' | 'library') => void): () => void
  onResumeOffer(cb: (offer: { path: string; position: number }) => void): () => void
  menu: {
    set(specs: MenuSpec[]): void
    onCommand(cb: (id: string, arg?: unknown) => void): () => void
  }
  app: {
    homeDir(): Promise<string>
    displays(): Promise<{ id: number; label: string }[]>
    opticalDrives(): Promise<string[]>
    openConfigFolder(): void
    /** Registers system-wide hotkeys { commandId: 'Mod+Shift+P' }; returns the ones that failed. */
    registerGlobalShortcuts(map: Record<string, string>): Promise<string[]>
  }
  subs: {
    listVideos(dir: string): Promise<string[]>
    install(pairs: { sub: string; video: string; lang: string }[], overwrite: boolean): Promise<{ video: string; target: string; ok: boolean; error?: string }[]>
  }
  shell: {
    showInFolder(path: string): void
    openExternal(url: string): void
    openPath(path: string): void
  }
  /** Absolute path of a dropped File. */
  pathForFile(file: File): string
  platform: NodeJS.Platform
}
