// Settings rows that need more than a single control.
import { useEffect, useState, type ComponentType } from 'react'
import { useSetting } from '@/state/settings'
import { Button, IconButton } from '@/components/controls'
import { Icon } from '@/components/Icon'
import { useLibraryData } from '@/library/state'
import { addLibraryFolder } from '@/library/LibraryPanel'
import { PluginList } from './PluginList'

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

function RemoteInfo() {
  const enabled = useSetting<boolean>('controls.webRemote')
  const port = useSetting<number>('controls.webRemotePort')
  const [info, setInfo] = useState<{ enabled: boolean; url: string | null } | null>(null)
  useEffect(() => {
    const t = setTimeout(() => window.flp.remote.info().then(setInfo), 400)
    return () => clearTimeout(t)
  }, [enabled, port])
  if (!enabled) return <p className="flp-muted">Turn on the web remote, then open the address on your phone.</p>
  return info?.url ? (
    <div className="flp-set__listrow">
      <Icon name="link" size={18} />
      <span>{info.url}</span>
      <Button onClick={() => navigator.clipboard.writeText(info.url!)}>Copy</Button>
    </div>
  ) : <p className="flp-muted">Starting…</p>
}

export const CUSTOM_ROWS: Record<string, ComponentType> = {
  'media-folders': MediaFolders,
  'plugin-list': PluginList,
  'remote-info': RemoteInfo
}
