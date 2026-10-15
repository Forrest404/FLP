import { Fragment, useState } from 'react'
import { usePlayer } from '@/state/player'
import { useUi as useUiSetting } from '@/state/settings'
import { useUi } from '@/state/ui'
import { DEFAULT_LAYOUT, getItem, type LayoutZone } from './items'
import { TitleText } from './widgets'
import { customize, useCustomize } from './customize'
import { usePlugins } from '@/plugins/state'

const NO_LAYOUT = {}

export function useLayout(zone: LayoutZone): string[] {
  const layout = useUiSetting<Partial<typeof DEFAULT_LAYOUT>>('layout', NO_LAYOUT)
  const draft = useCustomize((s) => s.draft)
  return draft ? draft[zone] : layout[zone] ?? DEFAULT_LAYOUT[zone]
}

/** Edit mode: each item gets a dashed outline, can be dragged, and shows where a drop would land. */
function EditableItems({ ids, zone }: { ids: string[]; zone: LayoutZone }) {
  const [over, setOver] = useState<number | null>(null)
  const dropAt = (e: React.DragEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientX > r.left + r.width / 2 ? i + 1 : i
  }
  return (
    <div
      className="flp-editzone"
      onDragOver={(e) => {
        e.preventDefault()
        if (e.target === e.currentTarget) setOver(ids.length)
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        e.preventDefault()
        customize.drop(zone, over ?? ids.length)
        setOver(null)
      }}
    >
      {ids.map((id, i) => {
        const item = getItem(id)
        if (!item) return null
        return (
          <div
            key={`${id}-${i}`}
            className={`flp-edititem ${item.flex ? 'flp-bar__flex' : ''}`}
            data-insert={over === i ? 'before' : over === i + 1 && i === ids.length - 1 ? 'after' : undefined}
            draggable
            title={`${item.label} — drag to move, or drag into the box to remove`}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              useCustomize.setState({ dragging: { id, from: zone, index: i } })
            }}
            onDragEnd={() => useCustomize.setState({ dragging: null })}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOver(dropAt(e, i))
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              customize.drop(zone, dropAt(e, i))
              setOver(null)
            }}
          >
            <div className="flp-edititem__inner">{item.render()}</div>
          </div>
        )
      })}
    </div>
  )
}

export function BarItems({ ids, zone }: { ids: string[]; zone?: LayoutZone }) {
  const editing = useCustomize((s) => !!s.draft)
  if (editing && zone) return <EditableItems ids={ids} zone={zone} />
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
        <BarItems ids={left} zone="titleLeft" />
      </div>
      <div className="flp-titlebar__title">
        <TitleText />
      </div>
      <div className="flp-titlebar__side flp-titlebar__side--right">
        <BarItems ids={right} zone="titleRight" />
      </div>
    </header>
  )
}

export function ControlBar() {
  const kind = usePlayer((s) => s.kind)
  const base = useLayout(kind === 'audio' ? 'musicControls' : 'controls')
  const editing = useCustomize((s) => !!s.draft)
  const pluginButtons = usePlugins((s) => s.contributions.controlButtons)
  // Buttons plugins add go at the end unless the user already placed them.
  const layout = editing ? base : [...base, ...pluginButtons.map((b) => b.command).filter((c) => !base.includes(c))]
  // A still image has no timeline (but Customize Player edits the real layout).
  const ids = kind === 'image' && !editing ? layout.filter((id) => !['time', 'duration'].includes(id)).map((id) => (id === 'seek' ? 'spacer' : id)) : layout
  return (
    <footer className="flp-controls">
      <BarItems ids={ids} zone={kind === 'audio' ? 'musicControls' : 'controls'} />
    </footer>
  )
}
