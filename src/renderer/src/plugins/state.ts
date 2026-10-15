// Keeps the renderer in sync with plugins: their commands join the command registry, and their
// buttons, menu items and panels show up in the UI.
import { create } from 'zustand'
import { emptyContributions, type PluginContributions, type PluginInfo } from '@shared/plugins'
import type { IconName } from '@/components/Icon'
import { iconNames } from '@/components/Icon'
import { registerCommands, runCommand } from '@/commands/registry'
import { showOsd, showToast, ui } from '@/state/ui'

interface PluginState {
  list: PluginInfo[]
  contributions: PluginContributions
  logs: { pluginId: string; level: string; text: string; at: number }[]
}

export const usePlugins = create<PluginState>(() => ({ list: [], contributions: emptyContributions(), logs: [] }))

const api = window.flp.plugins
let unregister: (() => void) | null = null

function applyContributions(c: PluginContributions) {
  usePlugins.setState({ contributions: c })
  // The open panel's plugin was disabled or removed (not just reloading after an edit).
  const open = ui.get().rightPanel
  const owner = open?.split(':')[1]
  const running = usePlugins.getState().list.some((p) => p.id === owner && p.enabled)
  if (open?.startsWith('plugin:') && !running && !c.panels.some((p) => `plugin:${p.pluginId}:${p.id}` === open)) ui.set({ rightPanel: 'video' })
  unregister?.()
  unregister = registerCommands(
    c.commands.map((cmd) => ({
      id: cmd.id,
      title: cmd.title,
      category: cmd.category ?? 'Plugins',
      icon: (iconNames.includes(cmd.icon as IconName) ? cmd.icon : 'plugins') as IconName,
      keys: cmd.keys,
      source: cmd.pluginId,
      run: async (arg?: unknown) => {
        const res = await api.invoke(cmd.pluginId, cmd.id, arg)
        if (res.error) showToast(`${cmd.title} failed: ${res.error}`)
        return res.result
      }
    }))
  )
}

api.list().then((list) => usePlugins.setState({ list }))
api.contributions().then(applyContributions)
api.logs().then((logs) => usePlugins.setState({ logs }))
api.onList((list) => usePlugins.setState({ list }))
api.onContributions(applyContributions)
api.onLog((entry) => usePlugins.setState((s) => ({ logs: [...s.logs.slice(-299), entry] })))
api.onNotify((plugin, text, action) =>
  showToast(`${plugin}: ${text}`, action ? { label: action.label, run: () => void runCommand(action.command) } : undefined)
)
api.onOsd((text) => showOsd(text))
window.flp.onView((view) => ui.set({ view }))
