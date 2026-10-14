import type { ReactNode } from 'react'
import { IconButton } from '@/components/controls'
import { Icon, type IconName } from '@/components/Icon'
import { openMenu } from '@/components/Menu'
import { player, usePlayer } from '@/state/player'
import { baseName } from '@/state/playback'
import { ui, useUi, type LibrarySection } from '@/state/ui'
import { LibraryPanel } from '@/library/LibraryPanel'

export const SECTIONS: { id: LibrarySection; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'videos', label: 'Videos', icon: 'videos' },
  { id: 'music', label: 'Music', icon: 'music' },
  { id: 'network', label: 'Network', icon: 'streaming' },
  { id: 'playlists', label: 'Playlists', icon: 'playlist' },
  { id: 'recent', label: 'Recent', icon: 'recent' }
]

/** Icon rail + panel shown beside the video (Figma "Player" with sidebar open). */
export function PlayerSidebar() {
  const section = useUi((s) => s.section)
  return (
    <aside className="flp-psidebar">
      <nav className="flp-rail">
        {SECTIONS.map((s) => (
          <IconButton
            key={s.id}
            icon={s.icon}
            label={s.label}
            pressed={section === s.id}
            onClick={() => ui.set({ section: s.id })}
          />
        ))}
        <IconButton icon="add" label="Add item" onClick={(e) => openMenu(addMenu(), e.currentTarget)} />
      </nav>
      <div className="flp-psidebar__panel">
        <LibraryPanel compact />
      </div>
    </aside>
  )
}

export function addMenu() {
  return [
    { label: 'Add files to the queue…', icon: 'file' as const, run: async () => {
      const files = await window.flp.dialog.openFiles({ title: 'Add to queue' })
      for (const f of files) await player.command('loadfile', f, 'append-play')
    } },
    { label: 'Add a media folder to the library…', icon: 'new-folder' as const, run: () => window.dispatchEvent(new CustomEvent('flp:add-library-folder')) },
    { label: 'New playlist…', icon: 'playlist' as const, run: () => ui.openDialog('newPlaylist') },
    { label: 'Open network stream…', icon: 'streaming' as const, run: () => ui.openDialog('network') }
  ]
}

/** The current play queue (mpv's playlist), shown in the sidebar and the library. */
export function QueueList() {
  const playlist = usePlayer((s) => s.playlist)
  if (!playlist.length) return <Empty icon="playlist" text="Nothing queued. Open files or drag them here." />
  return (
    <ul className="flp-list">
      {playlist.map((e, i) => (
        <li
          key={`${e.filename}-${i}`}
          className="flp-list__row"
          data-current={e.current}
          onDoubleClick={() => void player.set('playlist-pos', i)}
          onContextMenu={(ev) => {
            ev.preventDefault()
            openMenu([
              { label: 'Play', icon: 'play', run: () => void player.set('playlist-pos', i) },
              { label: 'Remove from queue', icon: 'remove', run: () => void player.command('playlist-remove', i) },
              { label: 'Move up', icon: 'arrow-up', disabled: i === 0, run: () => void player.command('playlist-move', i, i - 1) },
              { label: 'Move down', icon: 'arrow-down', disabled: i === playlist.length - 1, run: () => void player.command('playlist-move', i, i + 2) },
              ...(!/^[a-z]+:\/\//i.test(e.filename) ? [{ label: 'Show in Finder', icon: 'folder' as const, run: () => window.flp.shell.showInFolder(e.filename) }] : [])
            ], ev)
          }}
        >
          <Icon name={e.current ? 'play' : 'file-video'} size={18} state={e.current ? 'active' : 'default'} />
          <span className="flp-list__title">{e.title || baseName(e.filename)}</span>
        </li>
      ))}
    </ul>
  )
}

export function Empty({ icon, text, children }: { icon: IconName; text: string; children?: ReactNode }) {
  return (
    <div className="flp-empty">
      <Icon name={icon} size={32} />
      <p>{text}</p>
      {children}
    </div>
  )
}
