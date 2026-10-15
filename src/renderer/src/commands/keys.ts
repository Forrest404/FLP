// Keyboard dispatch and the macOS menu bar, both driven by the command registry.
import { useEffect, useState } from 'react'
import type { MenuSpec, MenuSpecItem } from '@shared/api'
import { usePlayer } from '@/state/player'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'
import { eventToKey, getCommand, runCommand, useCommands, type Command } from './registry'

/** User overrides live in settings ui.shortcuts as { commandId: ['Mod+O', …] }. */
export function keysFor(cmd: Command, overrides = useSettings.getState().ui.shortcuts as Record<string, string[]> | undefined): string[] {
  return overrides?.[cmd.id] ?? cmd.keys ?? []
}

function keyMap(): Map<string, string> {
  const overrides = useSettings.getState().ui.shortcuts as Record<string, string[]> | undefined
  const map = new Map<string, string>()
  for (const cmd of Object.values(useCommands.getState().commands)) for (const k of keysFor(cmd, overrides)) map.set(k, cmd.id)
  return map
}

/** ⌘ shortcuts text fields need: caret movement, deleting, clipboard, undo, select all. */
const TEXT_EDITING = /^Mod\+(Shift\+)?(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Backspace|Delete|A|C|V|X|Z|Y)$/

const CONTROLS = 'button, [role="switch"], [role="slider"], [role="menuitem"], [role="tab"]'

const isTyping = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable)

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement).closest?.('[data-capture-keys]')) return
      const key = eventToKey(e)
      if (!key) return
      const typing = isTyping(document.activeElement)
      // While typing, only ⌘/Ctrl shortcuts (and Escape) apply, and never the ones text fields use.
      if (typing && ((!key.startsWith('Mod+') && key !== 'Escape') || TEXT_EDITING.test(key))) return
      const modal = useUi.getState().dialog || useUi.getState().confirm
      // Space/Enter activate a keyboard-focused control. Chromium also leaves focus on a clicked button
      // (and the seek bar / volume take it on click); then they're shortcuts, and mustn't click it again.
      const focused = document.activeElement as HTMLElement | null
      if ((key === 'Space' || key === 'Enter') && focused?.closest?.(CONTROLS)) {
        if (modal || focused.matches(':focus-visible')) return
        e.preventDefault()
      }
      // While a dialog is open, only Escape and ⌘-shortcuts reach commands.
      if (modal && !key.startsWith('Mod+') && key !== 'Escape') return
      const id = keyMap().get(key)
      if (!id) return
      e.preventDefault()
      void runCommand(id)
    }
    window.addEventListener('keydown', onKey)
    const offMenu = window.flp.menu.onCommand((id, arg) => void runCommand(id, arg))
    return () => {
      window.removeEventListener('keydown', onKey)
      offMenu()
    }
  }, [])
}

// eventToKey names (KeyboardEvent.code, minus Key/Digit) → Electron accelerator names.
const ACCEL: Record<string, string> = {
  Mod: 'Cmd', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', BracketLeft: '[', BracketRight: ']',
  Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Escape: 'Esc', Space: 'Space',
  Quote: "'", Semicolon: ';', Backquote: '`',
  MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack', MediaPlayPause: 'MediaPlayPause', MediaStop: 'MediaStop',
  AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Numpad${i}`, `num${i}`])),
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec', NumpadEnter: 'Enter'
}
const toAccelerator = (key?: string) => key?.split('+').map((p) => ACCEL[p] ?? p).join('+')

const MENUS: { label: string; items: (string | '-')[] }[] = [
  { label: 'File', items: ['media.openFile', 'media.openFolder', 'media.openNetwork', 'media.openDisc', 'media.openCapture', '-', 'media.convert', 'media.stream', 'cast.to', '-', 'playlist.new', 'playlist.clear'] },
  { label: 'Playback', items: ['player.playPause', 'player.stop', 'player.previous', 'player.next', '-', 'player.forwardShort', 'player.backShort', 'player.forwardLong', 'player.backLong', 'player.frameStep', 'player.frameBack', '-', 'player.nextChapter', 'player.prevChapter', '-', 'player.speedUp', 'player.speedDown', 'player.speedReset', '-', 'player.repeat', 'player.shuffle', 'player.abLoop', '-', 'player.record', 'player.snapshot'] },
  { label: 'Audio', items: ['audio.volumeUp', 'audio.volumeDown', 'audio.mute', '-', 'audio.cycleTrack', 'audio.delayUp', 'audio.delayDown', '-', 'audio.effects', 'audio.toggleEq', 'audio.normalize'] },
  { label: 'Video', items: ['video.effects', '-', 'video.cycleAspect', 'video.cycleCrop', 'video.cycleZoom', 'video.cycleDeinterlace', 'video.rotate', 'video.flip', 'video.resetPicture', '-', 'player.snapshot'] },
  { label: 'Subtitles', items: ['subs.panel', 'subs.cycleTrack', 'subs.toggle', '-', 'subs.add', 'subs.addToFolder', '-', 'subs.delayUp', 'subs.delayDown', 'subs.bigger', 'subs.smaller'] },
  { label: 'View', items: ['window.fullscreen', 'ui.hideUi', 'ui.miniplayer', 'ui.pip', 'ui.alwaysOnTop', '-', 'ui.home', 'ui.library', 'ui.leftSidebar', 'ui.playlist', 'ui.rightSidebar', '-', 'ui.mediaInfo', 'ui.palette', '-', 'ui.keyboardShortcuts', 'ui.customizePlayer', 'ui.profiles'] }
]

/** Which toggle commands are on, as a string, so the menu bar is rebuilt only when one changes. */
const activeSignature = () =>
  Object.values(useCommands.getState().commands).map((c) => (c.active ? (c.active() ? 1 : 0) : '')).join('')

function useActiveSignature(): string {
  const [sig, setSig] = useState(activeSignature)
  useEffect(() => {
    const update = () => setSig(activeSignature())
    const offs = [usePlayer.subscribe(update), useSettings.subscribe(update), useUi.subscribe(update), useCommands.subscribe(update)]
    return () => offs.forEach((off) => off())
  }, [])
  return sig
}

/** Keeps the macOS menu bar in sync with commands, shortcut overrides and toggle states. */
export function useMenuBar() {
  const commands = useCommands((s) => s.commands)
  const shortcuts = useSettings((s) => s.ui.shortcuts)
  const active = useActiveSignature()
  useEffect(() => {
    const item = (id: string): MenuSpecItem | null => {
      const cmd = getCommand(id)
      if (!cmd) return null
      return { label: cmd.title, command: id, accelerator: toAccelerator(keysFor(cmd)[0]), checked: cmd.active ? !!cmd.active() : undefined }
    }
    const specs: MenuSpec[] = MENUS.map((m) => ({
      label: m.label,
      items: m.items.map((id) => (id === '-' ? 'separator' : item(id))).filter(Boolean) as MenuSpecItem[]
    }))
    // Plugin commands get their own menu.
    const plugin = Object.values(commands).filter((c) => c.source && c.source !== 'core' && !c.hidden)
    if (plugin.length) specs.push({ label: 'Plugins', items: plugin.map((c) => item(c.id)!).filter(Boolean) })
    window.flp.menu.set(specs)
  }, [commands, shortcuts, active])
}
