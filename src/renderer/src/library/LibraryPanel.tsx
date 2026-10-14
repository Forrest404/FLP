// Placeholder library panel; replaced by the media library in milestone 3.
import { useUi } from '@/state/ui'
import { Empty, QueueList, SECTIONS } from '@/player/Sidebar'

export function LibraryPanel({ compact }: { compact?: boolean }) {
  const section = useUi((s) => s.section)
  const label = SECTIONS.find((s) => s.id === section)?.label ?? ''
  return (
    <div className={`flp-libpanel ${compact ? 'flp-libpanel--compact' : ''}`}>
      <div className="flp-libpanel__head">
        <span className="flp-libpanel__title">{section === 'playlists' ? 'Now Playing' : label}</span>
      </div>
      {section === 'playlists' ? <QueueList /> : <Empty icon="library" text="Your library will appear here." />}
    </div>
  )
}
