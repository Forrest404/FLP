// Control-bar and title-bar items. A bar is just an ordered list of item ids, so "Customize
// Player" can rearrange them and plugins can add their own. Any command id is also a valid item:
// it renders as an icon button that runs the command.
import type { ReactNode } from 'react'
import { IconButton } from '@/components/controls'
import type { IconName } from '@/components/Icon'
import { getCommand, runCommand, useCommands } from '@/commands/registry'
import { usePlayer } from '@/state/player'
import { useUi } from '@/state/ui'

export interface BarItem {
  id: string
  label: string
  icon: IconName
  /** Grows to fill the remaining space (seek bar, title). */
  flex?: boolean
  render(): ReactNode
}

const registry = new Map<string, BarItem>()

export function defineItem(item: BarItem): () => void {
  registry.set(item.id, item)
  return () => registry.delete(item.id)
}

export function getItem(id: string): BarItem | null {
  const item = registry.get(id)
  if (item) return item
  const cmd = getCommand(id)
  if (!cmd) return null
  return { id, label: cmd.title, icon: cmd.icon ?? 'more', render: () => <CommandButton id={id} /> }
}

export function allItems(): BarItem[] {
  const fromCommands = Object.values(useCommands.getState().commands)
    .filter((c) => c.icon && !c.hidden && !registry.has(c.id))
    .map((c) => getItem(c.id)!)
  return [...registry.values(), ...fromCommands]
}

export function CommandButton({ id, icon }: { id: string; icon?: IconName }) {
  const cmd = useCommands((s) => s.commands[id])
  // Re-render on player/ui changes so toggle states (repeat, shuffle…) stay current.
  usePlayer((s) => s.loopFile || s.loopPlaylist || s.recording || s.muted)
  useUi((s) => s.rightPanel ?? s.shuffled ?? s.leftOpen)
  if (!cmd) return null
  return (
    <IconButton
      icon={icon ?? cmd.icon ?? 'more'}
      label={cmd.title}
      pressed={cmd.active?.() || undefined}
      onClick={() => void runCommand(id)}
    />
  )
}

// Default layouts, matching the Figma player.
export const DEFAULT_LAYOUT = {
  titleLeft: ['logo', 'more', 'ui.leftSidebar', 'divider', 'folder'],
  titleRight: ['window.fullscreen'],
  controls: ['player.previous', 'play', 'player.next', 'time', 'seek', 'duration', 'volume', 'audio.effects', 'subs.panel', 'player.speedMenu', 'ui.playlist'],
  musicControls: ['player.previous', 'player.back10', 'play', 'player.forward10', 'player.next', 'time', 'seek', 'duration', 'volume', 'audio.effects', 'ui.playlist']
}

export type LayoutZone = keyof typeof DEFAULT_LAYOUT
