import type { Bounds, PlayerState } from './player'
import type { SettingsSnapshot } from './settings-store'

// The API the preload script exposes to the renderer as window.flp.
export interface RendererApi {
  player: {
    command(...args: (string | number | boolean)[]): Promise<unknown>
    set(name: string, value: unknown): Promise<void>
    get(name: string): Promise<unknown>
    snapshot(): Promise<PlayerState>
    setBounds(b: Bounds): void
    setVisible(visible: boolean): void
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
    zoom(): void
    close(): void
  }
  shell: {
    showInFolder(path: string): void
    openPath(path: string): void
  }
  platform: NodeJS.Platform
}
