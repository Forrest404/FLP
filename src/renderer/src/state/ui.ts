import { create } from 'zustand'
import { getSetting, setUi } from './settings'

export type View = 'player' | 'library'
export type LibrarySection = 'home' | 'videos' | 'music' | 'network' | 'playlists' | 'recent'
export type RightPanel = 'video' | 'audio' | 'subtitles' | 'playback' | `plugin:${string}` | null
type DialogId =
  | 'settings' | 'shortcuts' | 'customize' | 'network' | 'newPlaylist' | 'profiles' | 'about'
  | 'mediaInfo' | 'convert' | 'capture' | 'disc' | 'addSubtitles' | 'plugins' | 'onboarding' | null

export interface Osd {
  id: number
  text: string
  /** Shown even when on-screen feedback is turned off (e.g. the file name). */
  force?: boolean
}

interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  resolve(ok: boolean): void
}

interface UiState {
  view: View
  section: LibrarySection
  /** Left sidebar inside the player (Figma: icon rail + panel). */
  leftOpen: boolean
  rightPanel: RightPanel
  dialog: DialogId
  dialogArg: unknown
  /** Bumped on every openDialog, so reopening a dialog starts it fresh. */
  dialogSeq: number
  settingsPage: string
  paletteOpen: boolean
  hideUi: boolean
  /** Controls hidden because the mouse is idle (auto-hide). */
  idle: boolean
  fullscreen: boolean
  miniplayer: boolean
  pip: boolean
  shuffled: boolean
  osd: Osd | null
  toast: { text: string; action?: { label: string; run(): void } } | null
  confirm: ConfirmRequest | null
}

export const useUi = create<UiState>(() => ({
  view: 'library',
  section: 'home',
  leftOpen: false,
  rightPanel: null,
  dialog: null,
  dialogArg: null,
  dialogSeq: 0,
  settingsPage: 'general',
  paletteOpen: false,
  hideUi: false,
  idle: false,
  fullscreen: false,
  miniplayer: false,
  pip: false,
  shuffled: false,
  osd: null,
  toast: null,
  confirm: null
}))

export const ui = {
  set: useUi.setState,
  get: useUi.getState,
  openDialog(dialog: DialogId, arg?: unknown) {
    useUi.setState((s) => ({ dialog, dialogArg: arg ?? null, dialogSeq: s.dialogSeq + 1, paletteOpen: false }))
  },
  closeDialog() {
    useUi.setState({ dialog: null, dialogArg: null })
  },
  openSettings(page = 'general') {
    useUi.setState({ dialog: 'settings', settingsPage: page, paletteOpen: false })
  },
  togglePanel(panel: Exclude<RightPanel, null>) {
    useUi.setState((s) => ({ rightPanel: s.rightPanel === panel ? null : panel }))
  }
}

// However onboarding goes away (Skip, Finish, Escape, ⌘, opening another dialog), don't show it again.
useUi.subscribe((s, prev) => {
  if (prev.dialog === 'onboarding' && s.dialog !== 'onboarding') setUi('onboarded', true)
})

let osdTimer: ReturnType<typeof setTimeout> | undefined
let osdSeq = 0

/** Brief on-screen feedback, e.g. "Volume 80%". Lasts subtitles.osdDuration unless `ms` is given. */
export function showOsd(text: string, ms?: number, force?: boolean) {
  clearTimeout(osdTimer)
  useUi.setState({ osd: { id: ++osdSeq, text, force } })
  osdTimer = setTimeout(() => useUi.setState({ osd: null }), ms ?? (getSetting<number>('subtitles.osdDuration') ?? 1.5) * 1000)
}

/** An error's message without Electron's "Error invoking remote method 'x': Error: " prefix. */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export function showToast(text: string, action?: { label: string; run(): void }, ms = 6000) {
  clearTimeout(toastTimer)
  useUi.setState({ toast: { text, action } })
  toastTimer = setTimeout(() => useUi.setState({ toast: null }), ms)
}

/** Asks before a destructive action (in-app dialog). Resolves true at once when general.confirmDialogs is off. */
/** `always`: ask even when confirmation dialogs are turned off (e.g. granting an add-on access). */
export function confirmAction(opts: { title: string; message?: string; confirmLabel?: string; always?: boolean }): Promise<boolean> {
  if (getSetting('general.confirmDialogs') === false && !opts.always) return Promise.resolve(true)
  return new Promise((resolve) => {
    useUi.getState().confirm?.resolve(false)
    useUi.setState({ confirm: { ...opts, resolve } })
  })
}
