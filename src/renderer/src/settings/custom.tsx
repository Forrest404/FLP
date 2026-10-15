// Settings rows that need more than a single control.
import type { ComponentType } from 'react'
import { Button, IconButton } from '@/components/controls'
import { Icon } from '@/components/Icon'
import { useLibraryData } from '@/library/state'
import { addLibraryFolder } from '@/library/LibraryPanel'

function MediaFolders() {
  const roots = useLibraryData(() => window.flp.library.roots(), [])
  return (
    <div className="flp-set__list">
      {roots?.map((r) => (
        <div key={r} className="flp-set__listrow">
          <Icon name="folder" size={18} />
          <span title={r}>{r}</span>
          <IconButton icon="close" label={`Remove ${r} from the library`} onClick={() => void window.flp.library.removeRoot(r)} />
        </div>
      ))}
      {roots && !roots.length && <p className="flp-muted">No media folders yet.</p>}
      <Button onClick={() => void addLibraryFolder()}><Icon name="add" size={16} /> Add folder</Button>
    </div>
  )
}

/** Filled in by the plugin system (milestone 6). */
export const CUSTOM_ROWS: Record<string, ComponentType> = {
  'media-folders': MediaFolders
}
