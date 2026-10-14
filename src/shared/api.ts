import type { Bounds, PlayerState } from './player'
import type { SettingsSnapshot } from './settings-store'

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
  menu: {
    set(specs: MenuSpec[]): void
    onCommand(cb: (id: string) => void): () => void
  }
  shell: {
    showInFolder(path: string): void
    openPath(path: string): void
  }
  /** Absolute path of a dropped File. */
  pathForFile(file: File): string
  platform: NodeJS.Platform
}
