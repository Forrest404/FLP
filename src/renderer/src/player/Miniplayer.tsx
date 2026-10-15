import { useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/controls'
import { runCommand } from '@/commands/registry'
import { usePlayer } from '@/state/player'
import { baseName, folderName } from '@/state/playback'
import { ui } from '@/state/ui'
import { VideoSurface } from './VideoSurface'

/** Corner miniplayer shown while browsing the library (Figma "Miniplayer"). */
// The library is opaque, so it gets a mask with a hole where the miniplayer's video sits; the
// native video view underneath shows through it.
function cutHole(r: DOMRect | null) {
  const main = document.querySelector<HTMLElement>('.flp-main')
  if (!main) return
  if (!r) return main.removeAttribute('data-hole')
  const m = main.getBoundingClientRect()
  main.dataset.hole = ''
  main.style.setProperty('--hx', `${r.x - m.x}px`)
  main.style.setProperty('--hy', `${r.y - m.y}px`)
  main.style.setProperty('--hw', `${r.width}px`)
  main.style.setProperty('--hh', `${r.height}px`)
}

export function Miniplayer() {
  const { idle, path, title, time, duration, paused, kind, metadata } = usePlayer()
  const showVideo = kind === 'video'
  useEffect(() => {
    if (idle || !path || !showVideo) cutHole(null)
    else {
      const el = document.querySelector('.flp-mini .flp-surface')
      if (el) cutHole(el.getBoundingClientRect())
    }
    return () => cutHole(null)
  }, [idle, path, showVideo])
  if (idle || !path) return null
  const pct = duration > 0 ? (time / duration) * 100 : 0
  return (
    <div className="flp-mini">
      <div className="flp-mini__video" onDoubleClick={(e) => {
        e.stopPropagation()
        if (!(e.target as HTMLElement).closest('button')) ui.set({ view: 'player' })
      }}>
        <VideoSurface mini showVideo={showVideo} onRect={showVideo ? cutHole : undefined}>
          {kind !== 'video' && <div className="flp-mini__art"><Icon name="music" size={40} /></div>}
          <div className="flp-mini__hover">
            <IconButton icon={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} onClick={() => void runCommand('player.playPause')} />
            <IconButton icon="maximize" label="Open player" onClick={() => ui.set({ view: 'player' })} />
          </div>
        </VideoSurface>
      </div>
      <div className="flp-mini__progress"><div className="flp-mini__bar"><i style={{ width: `${pct}%` }} /></div></div>
      <div className="flp-mini__title" title={title ?? ''}>{title || baseName(path)}</div>
      <div className="flp-mini__meta">
        {folderName(path) && <span><Icon name="folder" size={18} />{folderName(path)}</span>}
        {(metadata.artist || metadata.ARTIST) && <span><Icon name="artist" size={18} />{metadata.artist || metadata.ARTIST}</span>}
        <span style={{ flex: 1 }} />
        <IconButton icon="list" label="Show playlist" onClick={() => void runCommand('ui.playlist')} />
      </div>
    </div>
  )
}
