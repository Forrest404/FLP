import { IconButton } from '@/components/controls'
import { ui, useUi, type RightPanel as PanelId } from '@/state/ui'
import { AudioPanel } from './AudioPanel'
import { PlaybackPanel } from './PlaybackPanel'
import { SubtitlesPanel } from './SubtitlesPanel'
import { VideoPanel } from './VideoPanel'
import { usePlugins } from '@/plugins/state'
import { PluginPanel } from '@/plugins/PluginPanel'

const TABS: { id: 'video' | 'audio' | 'subtitles' | 'playback'; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'playback', label: 'Playback' }
]

/** Right sidebar: every effect and track option one click away (VLC hides these in Tools). */
export function RightPanel() {
  const chosen = useUi((s) => s.rightPanel)
  const pluginPanels = usePlugins((s) => s.contributions.panels)
  if (!chosen) return null
  const pluginPanel = pluginPanels.find((p) => `plugin:${p.pluginId}:${p.id}` === chosen)
  // A plugin panel whose plugin was disabled or removed falls back to Video.
  const panel = chosen.startsWith('plugin:') && !pluginPanel ? 'video' : chosen
  return (
    <aside className="flp-rpanel" aria-label="Effects and tracks">
      <div className="flp-rpanel__head">
        <div className="flp-rpanel__tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={panel === t.id} onClick={() => ui.set({ rightPanel: t.id })}>{t.label}</button>
          ))}
          {pluginPanels.map((p) => {
            const id = `plugin:${p.pluginId}:${p.id}` as PanelId
            return <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => ui.set({ rightPanel: id })}>{p.title}</button>
          })}
        </div>
        <IconButton icon="close" label="Close panel" onClick={() => ui.set({ rightPanel: null })} />
      </div>
      <div className="flp-rpanel__body">
        {panel === 'video' && <VideoPanel />}
        {panel === 'audio' && <AudioPanel />}
        {panel === 'subtitles' && <SubtitlesPanel />}
        {panel === 'playback' && <PlaybackPanel />}
        {pluginPanel && <PluginPanel key={panel} panel={pluginPanel} />}
      </div>
    </aside>
  )
}
