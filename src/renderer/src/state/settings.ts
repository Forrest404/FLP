import { create } from 'zustand'
import { ACCENTS } from '@shared/theme'
import type { SettingsSnapshot } from '@shared/settings-store'

export const useSettings = create<SettingsSnapshot & { ready: boolean }>(() => ({
  ready: false,
  values: {},
  activeProfile: null,
  profiles: [],
  ui: {}
}))

const api = window.flp.settings

function receive(snap: SettingsSnapshot) {
  useSettings.setState({ ...snap, ready: true })
  applyTheme(snap.values)
}

api.snapshot().then(receive)
api.onChange(receive)

/** Read one setting (re-renders when it changes). */
export function useSetting<T = unknown>(key: string): T {
  return useSettings((s) => s.values[key] as T)
}

export function getSetting<T = unknown>(key: string): T {
  return useSettings.getState().values[key] as T
}

export function setSetting(key: string, value: unknown): void {
  // Optimistic update so controls feel instant; the main process confirms with a snapshot.
  useSettings.setState((s) => ({ values: { ...s.values, [key]: value } }))
  if (key === 'general.theme' || key === 'general.accent') applyTheme(useSettings.getState().values)
  void api.set(key, value)
}

export function useUi<T>(key: string, fallback: T): T {
  return useSettings((s) => (s.ui[key] as T) ?? fallback)
}

export function setUi(key: string, value: unknown): void {
  useSettings.setState((s) => ({ ui: { ...s.ui, [key]: value } }))
  void api.setUi(key, value)
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
systemDark.addEventListener('change', () => applyTheme(useSettings.getState().values))

function applyTheme(values: Record<string, unknown>) {
  const mode = values['general.theme'] ?? 'dark'
  const theme = mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode
  const root = document.documentElement
  root.dataset.theme = String(theme)
  const accent = ACCENTS.find((a) => a.id === values['general.accent']) ?? ACCENTS[0]
  root.style.setProperty('--accent', accent.color)
  root.style.setProperty('--accent-contrast', accent.contrast)
}
