import type { SettingValues } from './settings-schema'

export interface Profile {
  name: string
  values: SettingValues
}

export interface SettingsFile {
  version: 1
  /** Global overrides of the defaults. */
  values: SettingValues
  /** null = no profile (global values). */
  activeProfile: string | null
  profiles: Record<string, Profile>
  /** UI state: control bar layout, shortcuts, sidebar sizes… */
  ui: Record<string, unknown>
}

/** What the renderer receives. */
export interface SettingsSnapshot {
  values: SettingValues
  activeProfile: string | null
  profiles: { id: string; name: string }[]
  ui: Record<string, unknown>
}
