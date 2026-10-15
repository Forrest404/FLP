import { IconButton } from '@/components/controls'
import { ui, useUi, type RightPanel as PanelId } from '@/state/ui'
import { AudioPanel } from './AudioPanel'
import { PlaybackPanel } from './PlaybackPanel'
import { SubtitlesPanel } from './SubtitlesPanel'
import { VideoPanel } from './VideoPanel'

const TABS: { id: Exclude<PanelId, null>; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'playback', label: 'Playback' }
]

/** Right sidebar: every effect and track option one click away (VLC hides these in Tools). */
export function RightPanel() {
  const panel = useUi((s) => s.rightPanel)
  if (!panel) return null
  return (
    <aside className="flp-rpanel" aria-label="Effects and tracks">
      <div className="flp-rpanel__head">
        <div className="flp-rpanel__tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={panel === t.id} onClick={() => ui.set({ rightPanel: t.id })}>{t.label}</button>
          ))}
        </div>
        <IconButton icon="close" label="Close panel" onClick={() => ui.set({ rightPanel: null })} />
      </div>
      <div className="flp-rpanel__body">
        {panel === 'video' && <VideoPanel />}
        {panel === 'audio' && <AudioPanel />}
        {panel === 'subtitles' && <SubtitlesPanel />}
        {panel === 'playback' && <PlaybackPanel />}
      </div>
    </aside>
  )
}
