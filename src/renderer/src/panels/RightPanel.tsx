import { IconButton } from '@/components/controls'
import { ui, useUi } from '@/state/ui'
import { PlaybackPanel } from './PlaybackPanel'

const TITLES = { video: 'Video', audio: 'Audio', subtitles: 'Subtitles', playback: 'Playback' } as const

export function RightPanel() {
  const panel = useUi((s) => s.rightPanel)
  if (!panel) return null
  return (
    <aside className="flp-rpanel">
      <div className="flp-rpanel__head">
        <span>{TITLES[panel]}</span>
        <IconButton icon="close" label="Close panel" onClick={() => ui.set({ rightPanel: null })} />
      </div>
      <div className="flp-rpanel__body">
        {panel === 'playback' ? <PlaybackPanel /> : <p className="flp-muted">Coming in the effects milestone.</p>}
      </div>
    </aside>
  )
}
