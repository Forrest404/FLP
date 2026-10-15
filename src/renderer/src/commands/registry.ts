// Every action in FLP is a command. Menus, the command palette, keyboard shortcuts, the
// customizable control bar and plugins all read from this one registry, so nothing is hidden.
import { create } from 'zustand'
import type { IconName } from '@/components/Icon'

export interface Command {
  id: string
  title: string
  /** Group shown in the palette and the shortcut editor, e.g. "Playback". */
  category: string
  icon?: IconName
  /** Default shortcuts, e.g. ['Space'] or ['Mod+O']. "Mod" is ⌘ on macOS, Ctrl elsewhere. */
  keys?: string[]
  /** Extra words for palette search. */
  keywords?: string[]
  run(arg?: unknown): unknown
  enabled?(): boolean
  /** For toggle-style commands, whether it's currently on (control-bar buttons show this). */
  active?(): boolean
  /** 'core' or a plugin id. */
  source?: string
  /** Hidden from the palette (still usable from menus/shortcuts). */
  hidden?: boolean
  /** false: not offered in Customize Player (admin actions like "Reset all settings"). */
  bar?: boolean
}

interface RegistryState {
  commands: Record<string, Command>
}

export const useCommands = create<RegistryState>(() => ({ commands: {} }))

export function registerCommand(cmd: Command): () => void {
  useCommands.setState((s) => ({ commands: { ...s.commands, [cmd.id]: { source: 'core', ...cmd } } }))
  return () =>
    useCommands.setState((s) => {
      const { [cmd.id]: _, ...rest } = s.commands
      return { commands: rest }
    })
}

export function registerCommands(cmds: Command[]): () => void {
  const disposers = cmds.map(registerCommand)
  return () => disposers.forEach((d) => d())
}

export function getCommand(id: string): Command | undefined {
  return useCommands.getState().commands[id]
}

export async function runCommand(id: string, arg?: unknown): Promise<void> {
  const cmd = getCommand(id)
  if (!cmd) return console.warn(`Unknown command: ${id}`)
  if (cmd.enabled && !cmd.enabled()) return
  try {
    await cmd.run(arg)
  } catch (err) {
    console.error(`Command ${id} failed`, err)
  }
}

export const isMac = navigator.platform.startsWith('Mac')

/** Turns a keyboard event into the canonical "Mod+Shift+K" form. */
export function eventToKey(e: KeyboardEvent): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null
  const parts: string[] = []
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod')
  if (isMac && e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  // Physical key codes, so shortcuts stay put on non-US keyboard layouts.
  parts.push(e.code.replace(/^(Key|Digit)/, ''))
  return parts.join('+')
}

/** Human-readable form: "Mod+Shift+K" → "⌘⇧K" on macOS, "Ctrl + Shift + K" elsewhere. */
export function formatKey(key: string): string {
  const names: Record<string, [string, string]> = {
    Mod: ['⌘', 'Ctrl'],
    Ctrl: ['⌃', 'Ctrl'],
    Alt: ['⌥', 'Alt'],
    Shift: ['⇧', 'Shift'],
    ArrowLeft: ['←', '←'],
    ArrowRight: ['→', '→'],
    ArrowUp: ['↑', '↑'],
    ArrowDown: ['↓', '↓'],
    Escape: ['esc', 'Esc'],
    Enter: ['↩', 'Enter'],
    Backspace: ['⌫', 'Backspace'],
    Backslash: ['\\', '\\'],
    BracketLeft: ['[', '['],
    BracketRight: [']', ']'],
    Comma: [',', ','],
    Period: ['.', '.'],
    Slash: ['/', '/'],
    Minus: ['-', '-'],
    Equal: ['=', '=']
  }
  const parts = key.split('+').map((p) => names[p]?.[isMac ? 0 : 1] ?? p)
  return isMac ? parts.join('') : parts.join(' + ')
}
