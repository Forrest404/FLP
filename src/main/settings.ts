// Persistent settings with profiles. Effective values = defaults ← global ← active profile.
// Changes made while a profile is active are saved into that profile.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { defaultValues, type SettingValues } from '@shared/settings-schema'
import { FX_DEFAULTS } from '@shared/audio-effects'
import type { Profile, SettingsFile } from '@shared/settings-store'

const DEFAULT_PROFILES: Record<string, Profile> = {
  movies: { name: 'Movies', values: { 'subtitles.enabled': true, 'audio.nightMode': false, 'playback.resume': 'always' } },
  shows: { name: 'Shows', values: { 'playback.resume': 'always', 'playback.whenFinished': 'stop' } },
  music: { name: 'Music', values: { 'audio.visualizer': 'waveform', 'audio.normalize': true, 'playback.repeat': 'all', 'interface.coverArt': true } },
  work: { name: 'Work', values: { 'audio.startupVolume': 50, 'audio.rememberVolume': false, 'interface.alwaysOnTop': 'always' } }
}

export class Settings extends EventEmitter {
  private file: string
  data: SettingsFile
  private defaults: SettingValues = { ...defaultValues(), ...FX_DEFAULTS }
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.file = join(app.getPath('userData'), 'settings.json')
    this.data = this.load()
  }

  private load(): SettingsFile {
    const fresh: SettingsFile = { version: 1, values: {}, activeProfile: null, profiles: DEFAULT_PROFILES, ui: {} }
    if (!existsSync(this.file)) return fresh
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SettingsFile>
      return { ...fresh, ...parsed, profiles: parsed.profiles ?? DEFAULT_PROFILES, ui: parsed.ui ?? {} }
    } catch (err) {
      console.error('Settings file unreadable; starting fresh', err)
      renameSync(this.file, `${this.file}.broken-${Date.now()}`)
      return fresh
    }
  }

  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2))
      renameSync(tmp, this.file) // atomic replace
    }, 200)
  }

  /** Effective values for the active profile. */
  values(): SettingValues {
    const profile = this.data.activeProfile ? this.data.profiles[this.data.activeProfile]?.values : undefined
    return { ...this.defaults, ...this.data.values, ...profile }
  }

  get(key: string): unknown {
    return this.values()[key]
  }

  set(key: string, value: unknown): void {
    const target = this.data.activeProfile ? this.data.profiles[this.data.activeProfile]?.values : this.data.values
    ;(target ?? this.data.values)[key] = value
    this.save()
    this.emit('changed', [key])
  }

  setMany(patch: SettingValues): void {
    const target = (this.data.activeProfile && this.data.profiles[this.data.activeProfile]?.values) || this.data.values
    Object.assign(target, patch)
    this.save()
    this.emit('changed', Object.keys(patch))
  }

  resetAll(): void {
    this.data.values = {}
    this.data.profiles = structuredClone(DEFAULT_PROFILES)
    this.data.activeProfile = null
    this.save()
    this.emit('changed', Object.keys(this.defaults))
  }

  setProfile(id: string | null): void {
    if (id && !this.data.profiles[id]) return
    this.data.activeProfile = id
    this.save()
    this.emit('changed', Object.keys(this.defaults))
  }

  createProfile(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile'
    let id = base
    for (let i = 2; this.data.profiles[id]; i++) id = `${base}-${i}`
    this.data.profiles[id] = { name, values: {} }
    this.save()
    return id
  }

  deleteProfile(id: string): void {
    delete this.data.profiles[id]
    if (this.data.activeProfile === id) this.data.activeProfile = null
    this.save()
    this.emit('changed', Object.keys(this.defaults))
  }

  /** Free-form UI state (control bar layout, shortcuts, sidebar width…). */
  getUi<T>(key: string, fallback: T): T {
    return (this.data.ui[key] as T) ?? fallback
  }

  setUi(key: string, value: unknown): void {
    this.data.ui[key] = value
    this.save()
    this.emit('ui-changed', key)
  }

  flush(): void {
    if (!this.saveTimer) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2))
  }
}
