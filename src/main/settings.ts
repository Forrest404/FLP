// Persistent settings with profiles. Effective values = defaults ← global ← active profile.
// Changes made while a profile is active are saved into that profile.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { defaultValues, type SettingValues } from '@shared/settings-schema'
import { FX_DEFAULTS } from '@shared/audio-effects'
import { VFX_DEFAULTS } from '@shared/video-effects'
import type { Profile, SettingsFile } from '@shared/settings-store'

/** Settings that belong to the app, not to a profile. */
const GLOBAL_KEY = /^(controls\.webRemote|plugin\.)/

const DEFAULT_PROFILES: Record<string, Profile> = {
  movies: { name: 'Movies', values: { 'subtitles.enabled': true, 'audio.nightMode': false, 'playback.resume': 'always' } },
  shows: { name: 'Shows', values: { 'playback.resume': 'always', 'playback.whenFinished': 'stop' } },
  music: { name: 'Music', values: { 'audio.visualizer': 'waveform', 'audio.normalize': true, 'playback.repeat': 'all', 'interface.coverArt': true } },
  work: { name: 'Work', values: { 'audio.startupVolume': 50, 'audio.rememberVolume': false, 'interface.alwaysOnTop': 'always' } }
}

export class Settings extends EventEmitter {
  private file: string
  data: SettingsFile
  private defaults: SettingValues = { ...defaultValues(), ...FX_DEFAULTS, ...VFX_DEFAULTS }
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.file = join(app.getPath('userData'), 'settings.json')
    this.data = this.load()
  }

  private load(): SettingsFile {
    const fresh: SettingsFile = { version: 1, values: {}, activeProfile: null, profiles: structuredClone(DEFAULT_PROFILES), ui: {} }
    if (!existsSync(this.file)) return fresh
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SettingsFile>
      return { ...fresh, ...parsed, profiles: parsed.profiles ?? structuredClone(DEFAULT_PROFILES), ui: parsed.ui ?? {} }
    } catch (err) {
      console.error('Settings file unreadable; starting fresh', err)
      renameSync(this.file, `${this.file}.broken-${Date.now()}`)
      return fresh
    }
  }

  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.persist()
    }, 200)
  }

  /** Atomic replace, so a crash mid-write can't leave a half-written file; a full disk is logged, not fatal. */
  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2))
      renameSync(tmp, this.file)
    } catch (err) {
      console.error("Couldn't save settings:", (err as Error).message)
    }
  }

  /** Effective values for the active profile. */
  values(): SettingValues {
    const profile = this.data.activeProfile ? this.data.profiles[this.data.activeProfile]?.values : undefined
    return { ...this.defaults, ...this.data.values, ...profile }
  }

  get(key: string): unknown {
    return this.values()[key]
  }

  /** Writes into the active profile, except app-wide keys (remote access, add-on keys and passwords),
   *  which must not change or disappear when switching profile. */
  private write(key: string, value: unknown): void {
    const profile = this.data.activeProfile ? this.data.profiles[this.data.activeProfile]?.values : undefined
    if (profile && !GLOBAL_KEY.test(key)) profile[key] = value
    else {
      this.data.values[key] = value
      if (profile) delete profile[key]
    }
  }

  set(key: string, value: unknown): void {
    this.write(key, value)
    this.save()
    this.emit('changed', [key])
  }

  setMany(patch: SettingValues): void {
    for (const [k, v] of Object.entries(patch)) this.write(k, v)
    this.save()
    this.emit('changed', Object.keys(patch))
  }

  /** Runs a change that can touch many keys, then announces only the ones whose value differs, so
   *  switching profile doesn't reset speed, delays or tracks that the profile leaves alone. */
  private changeAll(fn: () => void): void {
    const before = this.values()
    fn()
    this.save()
    const after = this.values()
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    this.emit('changed', keys)
  }

  resetAll(): void {
    this.changeAll(() => {
      this.data.values = {}
      this.data.profiles = structuredClone(DEFAULT_PROFILES)
      this.data.activeProfile = null
    })
  }

  setProfile(id: string | null): void {
    if (id && !this.data.profiles[id]) return
    this.changeAll(() => (this.data.activeProfile = id))
  }

  createProfile(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile'
    let id = base
    for (let i = 2; this.data.profiles[id]; i++) id = `${base}-${i}`
    this.data.profiles[id] = { name, values: {} }
    this.save()
    return id
  }

  renameProfile(id: string, name: string): void {
    if (!this.data.profiles[id]) return
    this.data.profiles[id].name = name
    this.save()
    this.emit('ui-changed', 'profiles')
  }

  deleteProfile(id: string): void {
    this.changeAll(() => {
      delete this.data.profiles[id]
      if (this.data.activeProfile === id) this.data.activeProfile = null
    })
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
    this.persist()
  }
}
