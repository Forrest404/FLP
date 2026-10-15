// Types shared by the plugin host, the main process and the renderer.
import type { SettingDef } from './settings-schema'

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** Entry file, default "main.js". */
  main?: string
  /** "network" allows flp.fetch. Shown to the user before enabling. */
  permissions?: ('network' | 'library' | 'files')[]
  /** Minimum FLP plugin API version. */
  api?: number
}

export interface PluginInfo {
  id: string
  dir: string
  manifest: PluginManifest
  enabled: boolean
  /** Shipped with FLP (can't be removed, only disabled). */
  builtIn: boolean
  status: 'running' | 'stopped' | 'error'
  error?: string
}

/** Plugin setting, a subset of the app's SettingDef (rendered by the same controls). */
export type PluginSettingDef = { key: string; label: string; info?: string } & (
  | { type: 'toggle'; default: boolean }
  | { type: 'select'; default: string | number; options: { value: string | number; label: string }[] }
  | { type: 'slider'; default: number; min: number; max: number; step: number }
  | { type: 'number'; default: number; min?: number; max?: number; step?: number; suffix?: string }
  | { type: 'text'; default: string; placeholder?: string; secret?: boolean }
  | { type: 'color'; default: string }
)

export interface PluginCommand {
  pluginId: string
  id: string
  title: string
  icon?: string
  keys?: string[]
  category?: string
}

export interface PluginPanel {
  pluginId: string
  id: string
  title: string
  html: string
}

export interface PluginContributions {
  commands: PluginCommand[]
  controlButtons: { pluginId: string; command: string }[]
  menuItems: { pluginId: string; label: string; command: string }[]
  panels: PluginPanel[]
  settings: Record<string, PluginSettingDef[]>
}

export const emptyContributions = (): PluginContributions => ({ commands: [], controlButtons: [], menuItems: [], panels: [], settings: {} })

/** Settings keys for plugin settings live under "plugin.<id>.<key>". */
export const pluginSettingKey = (pluginId: string, key: string) => `plugin.${pluginId}.${key}`

export function toSettingDef(pluginId: string, d: PluginSettingDef): SettingDef {
  return { ...d, key: pluginSettingKey(pluginId, d.key), page: 'extensions', section: pluginId } as SettingDef
}

export const PLUGIN_API_VERSION = 1

/** Messages between the main process and the plugin host. */
export type HostToMain =
  | { type: 'req'; reqId: number; pluginId: string; method: string; args: unknown[] }
  | { type: 'loaded'; pluginId: string; error?: string }
  | { type: 'log'; pluginId: string; level: 'log' | 'warn' | 'error'; text: string }
  | { type: 'result'; reqId: number; result?: unknown; error?: string }

export type MainToHost =
  | { type: 'load'; plugin: { id: string; dir: string; main: string; manifest: PluginManifest; settings: Record<string, unknown>; dataDir: string } }
  | { type: 'unload'; pluginId: string }
  | { type: 'reply'; reqId: number; result?: unknown; error?: string }
  | { type: 'event'; name: string; data: unknown }
  | { type: 'invoke'; pluginId: string; command: string; arg?: unknown; reqId: number }
  | { type: 'settings'; pluginId: string; values: Record<string, unknown> }
  | { type: 'panel-message'; pluginId: string; panelId: string; data: unknown }
