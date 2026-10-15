// Figma "Customize Player": drag items between the palette and the bars.
import { useEffect } from 'react'
import { Button, IconButton } from '@/components/controls'
import { Icon } from '@/components/Icon'
import { allItems, DEFAULT_LAYOUT } from '@/player/items'
import { customize, useCustomize } from '@/player/customize'
import { setUi, useSettings } from '@/state/settings'
import { ui } from '@/state/ui'

/** The palette in the Figma order; every other command follows alphabetically. */
const FIGMA_ORDER = [
  'spacer', 'divider', 'player.speedMenu', 'player.forward10', 'player.back10', 'player.forward15', 'player.back15', 'player.stop',
  'player.repeat', 'player.shuffle', 'player.record', 'player.snapshot', 'ui.pip', 'video.hdr', 'video.cycleZoom', 'ui.rightSidebar',
  'app.quit', 'ui.settings', 'ui.home', 'thumbnail', 'fileName', 'artistName', 'folderName', 'playlistName', 'ui.mediaInfo',
  'player.replay', 'ui.chapters', 'library.favorite', 'player.bookmark', 'ui.bookmarks', 'ui.playlist'
]
/** The palette's short Figma names (the command titles stay as they are elsewhere). */
const FIGMA_LABELS: Record<string, string> = {
  'player.speedMenu': 'Playback Speed', 'player.forward10': 'Forward 10s', 'player.back10': 'Backward 10s', 'player.forward15': 'Forward 15s',
  'player.back15': 'Backward 15s', 'player.stop': 'Stop', 'player.repeat': 'Repeat', 'player.snapshot': 'Snapshot', 'ui.pip': 'Picture in Picture',
  'video.hdr': 'HDR', 'video.cycleZoom': 'Zoom', 'ui.rightSidebar': 'Right Sidebar', 'ui.home': 'Go Home', 'ui.mediaInfo': 'Properties',
  'player.replay': 'Replay', 'player.bookmark': 'Bookmark', 'ui.playlist': 'Playlists'
}

export function CustomizeDialog() {
  const draft = useCustomize((s) => s.draft)
  const dragging = useCustomize((s) => s.dragging)

  useEffect(() => {
    customize.start((useSettings.getState().ui.layout as object) ?? {})
    return () => customize.stop()
  }, [])

  const close = () => ui.closeDialog()
  const save = () => {
    if (draft) setUi('layout', draft)
    close()
  }
  const rank = (id: string) => (FIGMA_ORDER.includes(id) ? FIGMA_ORDER.indexOf(id) : FIGMA_ORDER.length)
  const items = allItems().sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label))
  const changed = draft && JSON.stringify(draft) !== JSON.stringify({ ...DEFAULT_LAYOUT, ...((useSettings.getState().ui.layout as object) ?? {}) })

  return (
    <div className="flp-customize-backdrop">
      <div className="flp-customize" role="dialog" aria-label="Customize Player">
        <div className="ui-dialog__head">
          <span className="ui-dialog__title">Customize Player</span>
          <IconButton icon="close" label="Close" onClick={close} />
        </div>
        <p className="flp-customize__hint">Drag items around and out of the box below to re-order them. Drag items into the box to remove them from the player.</p>
        <div
          className="flp-customize__palette"
          data-drop={dragging && dragging.from !== 'palette'}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            customize.drop(null, 0)
          }}
        >
          {items.map((it) => (
            <div
              key={it.id}
              className="flp-customize__item"
              draggable
              onDragStart={() => useCustomize.setState({ dragging: { id: it.id, from: 'palette', index: -1 } })}
              onDragEnd={() => useCustomize.setState({ dragging: null })}
              title={`Drag “${it.label}” onto the title bar or control bar`}
            >
              <span className="flp-customize__icon"><Icon name={it.icon} size={20} /></span>
              <span>{FIGMA_LABELS[it.id] ?? it.label}</span>
            </div>
          ))}
        </div>
        <div className="ui-dialog__foot">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <span style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => customize.reset()}>Reset to default</Button>
            <Button variant="primary" disabled={!changed} onClick={save}>Save</Button>
          </span>
        </div>
      </div>
    </div>
  )
}
