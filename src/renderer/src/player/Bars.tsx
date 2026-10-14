import { Fragment } from 'react'
import { usePlayer } from '@/state/player'
import { useUi as useUiSetting } from '@/state/settings'
import { useUi } from '@/state/ui'
import { DEFAULT_LAYOUT, getItem, type LayoutZone } from './items'
import { TitleText } from './widgets'

export function useLayout(zone: LayoutZone): string[] {
  const layout = useUiSetting<Partial<typeof DEFAULT_LAYOUT>>('layout', {})
  return layout[zone] ?? DEFAULT_LAYOUT[zone]
}

export function BarItems({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => {
        const item = getItem(id)
        if (!item) return null
        return (
          <Fragment key={`${id}-${i}`}>
            {item.flex ? <div className="flp-bar__flex">{item.render()}</div> : item.render()}
          </Fragment>
        )
      })}
    </>
  )
}

export function TitleBar() {
  const left = useLayout('titleLeft')
  const right = useLayout('titleRight')
  const fullscreen = useUi((s) => s.fullscreen)
  return (
    <header className="flp-titlebar" onDoubleClick={(e) => e.target === e.currentTarget && window.flp.window.zoom()}>
      {/* Room for the macOS traffic lights (hidden in fullscreen). */}
      {!fullscreen && <div className="flp-titlebar__lights" />}
      <div className="flp-titlebar__side">
        <BarItems ids={left} />
      </div>
      <div className="flp-titlebar__title">
        <TitleText />
      </div>
      <div className="flp-titlebar__side flp-titlebar__side--right">
        <BarItems ids={right} />
      </div>
    </header>
  )
}

export function ControlBar() {
  const kind = usePlayer((s) => s.kind)
  const layout = useLayout(kind === 'audio' ? 'musicControls' : 'controls')
  // A still image has no timeline.
  const ids = kind === 'image' ? layout.filter((id) => !['time', 'duration'].includes(id)).map((id) => (id === 'seek' ? 'spacer' : id)) : layout
  return (
    <footer className="flp-controls">
      <BarItems ids={ids} />
    </footer>
  )
}
