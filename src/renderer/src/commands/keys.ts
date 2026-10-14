// Keyboard dispatch and the macOS menu bar, both driven by the command registry.
import { useEffect } from 'react'
import type { MenuSpec, MenuSpecItem } from '@shared/api'
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

const isTyping = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable)

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement).closest?.('[data-capture-keys]')) return
      const key = eventToKey(e)
      if (!key) return
      const typing = isTyping(document.activeElement)
      // While typing, only shortcuts with ⌘/Ctrl (and Escape) apply.
      if (typing && !key.startsWith('Mod+') && key !== 'Escape') return
      // While a dialog is open, only Escape and ⌘-shortcuts reach commands.
      if (useUi.getState().dialog && !key.startsWith('Mod+') && key !== 'Escape') return
      const id = keyMap().get(key)
      if (!id) return
      e.preventDefault()
      void runCommand(id)
    }
    window.addEventListener('keydown', onKey)
    const offMenu = window.flp.menu.onCommand((id) => void runCommand(id))
    return () => {
      window.removeEventListener('keydown', onKey)
      offMenu()
    }
  }, [])
}

const ACCEL: Record<string, string> = {
  Mod: 'Cmd', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', BracketLeft: '[', BracketRight: ']',
  Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Escape: 'Esc', Space: 'Space'
}
const toAccelerator = (key?: string) => key?.split('+').map((p) => ACCEL[p] ?? p).join('+')

const MENUS: { label: string; items: (string | '-')[] }[] = [
  { label: 'File', items: ['media.openFile', 'media.openFolder', 'media.openNetwork', 'media.openDisc', 'media.openCapture', '-', 'media.convert', '-', 'playlist.new', 'playlist.clear'] },
  { label: 'Playback', items: ['player.playPause', 'player.stop', 'player.previous', 'player.next', '-', 'player.forwardShort', 'player.backShort', 'player.forwardLong', 'player.backLong', 'player.frameStep', 'player.frameBack', '-', 'player.nextChapter', 'player.prevChapter', '-', 'player.speedUp', 'player.speedDown', 'player.speedReset', '-', 'player.repeat', 'player.shuffle', 'player.abLoop', '-', 'player.record', 'player.snapshot'] },
  { label: 'Audio', items: ['audio.volumeUp', 'audio.volumeDown', 'audio.mute', '-', 'audio.cycleTrack', 'audio.delayUp', 'audio.delayDown', '-', 'audio.effects', 'audio.toggleEq', 'audio.normalize'] },
  { label: 'Video', items: ['video.effects', '-', 'video.cycleAspect', 'video.cycleCrop', 'video.cycleZoom', 'video.cycleDeinterlace', 'video.rotate', 'video.flip', 'video.resetPicture', '-', 'player.snapshot'] },
  { label: 'Subtitles', items: ['subs.panel', 'subs.cycleTrack', 'subs.toggle', '-', 'subs.add', 'subs.addToFolder', '-', 'subs.delayUp', 'subs.delayDown', 'subs.bigger', 'subs.smaller'] },
  { label: 'View', items: ['window.fullscreen', 'ui.hideUi', 'ui.miniplayer', 'ui.pip', 'ui.alwaysOnTop', '-', 'ui.home', 'ui.library', 'ui.leftSidebar', 'ui.playlist', 'ui.rightSidebar', '-', 'ui.mediaInfo', 'ui.palette', '-', 'ui.keyboardShortcuts', 'ui.customizePlayer', 'ui.profiles'] }
]

/** Keeps the macOS menu bar in sync with commands and shortcut overrides. */
export function useMenuBar() {
  const commands = useCommands((s) => s.commands)
  const shortcuts = useSettings((s) => s.ui.shortcuts)
  useEffect(() => {
    const item = (id: string): MenuSpecItem | null => {
      const cmd = getCommand(id)
      if (!cmd) return null
      return { label: cmd.title, command: id, accelerator: toAccelerator(keysFor(cmd)[0]) }
    }
    const specs: MenuSpec[] = MENUS.map((m) => ({
      label: m.label,
      items: m.items.map((id) => (id === '-' ? 'separator' : item(id))).filter(Boolean) as MenuSpecItem[]
    }))
    // Plugin commands get their own menu.
    const plugin = Object.values(commands).filter((c) => c.source && c.source !== 'core' && !c.hidden)
    if (plugin.length) specs.push({ label: 'Plugins', items: plugin.map((c) => item(c.id)!).filter(Boolean) })
    window.flp.menu.set(specs)
  }, [commands, shortcuts])
}
