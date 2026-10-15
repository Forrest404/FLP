// Settings → Extensions (Figma "Add-ons & Scripts").
import { useEffect, useState } from 'react'
import { toSettingDef, type PluginInfo } from '@shared/plugins'
import { Button, IconButton, SearchField, TextField, Toggle } from '@/components/controls'
import { Icon } from '@/components/Icon'
import { usePlugins } from '@/plugins/state'
import { confirmAction, showToast } from '@/state/ui'
import { Control } from './SettingsDialog'

const api = () => window.flp.plugins
const PERMISSION_TEXT: Record<string, string> = { network: 'Use the internet', library: 'Read your media library', files: 'Read and write files' }

function Details({ p }: { p: PluginInfo }) {
  const defs = usePlugins((s) => s.contributions.settings[p.id])
  const logs = usePlugins((s) => s.logs).filter((l) => l.pluginId === p.id).slice(-6)
  return (
    <div className="flp-plugin__details" onClick={(e) => e.stopPropagation()}>
      {p.manifest.description && <p>{p.manifest.description}</p>}
      <div className="flp-plugin__meta">
        <span>Version {p.manifest.version}</span>
        {p.manifest.author && <span>by {p.manifest.author}</span>}
        <span>{p.builtIn ? 'Built in' : p.dir}</span>
      </div>
      {!!p.manifest.permissions?.length && (
        <div className="flp-plugin__perms">
          <Icon name="privacy" size={16} /> Can: {p.manifest.permissions.map((x) => PERMISSION_TEXT[x] ?? x).join(', ')}
        </div>
      )}
      {p.error && <pre className="flp-plugin__error">{p.error}</pre>}
      {defs?.map((d) => {
        const def = toSettingDef(p.id, d)
        return (
          <div key={def.key} className="flp-set__row">
            <div className="flp-set__label">{def.label}</div>
            <div className="flp-set__control"><Control def={def} /></div>
          </div>
        )
      })}
      {logs.length > 0 && <pre className="flp-plugin__log">{logs.map((l) => `${new Date(l.at).toLocaleTimeString()}  ${l.text}`).join('\n')}</pre>}
      <div className="flp-chips">
        <Button onClick={() => void api().reload(p.id)}><Icon name="refresh" size={16} /> Reload</Button>
        <Button onClick={() => window.flp.shell.openPath(p.dir)}><Icon name="folder" size={16} /> Open folder</Button>
      </div>
    </div>
  )
}

export function PluginList() {
  const list = usePlugins((s) => s.list)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    const onCreate = () => setCreating(true)
    window.addEventListener('flp:create-plugin', onCreate)
    return () => window.removeEventListener('flp:create-plugin', onCreate)
  }, [])

  const q = query.toLowerCase()
  const shown = list.filter((p) => !q || `${p.manifest.name} ${p.manifest.description ?? ''}`.toLowerCase().includes(q))
  const sel = list.find((p) => p.id === selected)

  const create = async () => {
    const n = name.trim()
    if (!n) return
    const dir = await api().create(n)
    setCreating(false)
    setName('')
    showToast(`Created “${n}” in ${dir}. Edit main.js and save; FLP reloads it instantly.`)
  }

  return (
    <div className="flp-plugins">
      <div className="flp-plugins__box">
        {shown.map((p) => (
          <div key={p.id} className="flp-plugin" data-selected={p.id === selected} onClick={() => setSelected(p.id === selected ? null : p.id)}>
            <div className="flp-plugin__row">
              <Icon name="plugins" size={20} state={p.status === 'running' ? 'active' : 'default'} />
              <div className="flp-plugin__name">
                <span>{p.manifest.name}</span>
                <small>{p.status === 'error' ? 'Error, open for details' : p.status === 'running' ? 'Running' : p.enabled ? 'Starting…' : 'Off'}{p.builtIn ? ' · Built in' : ''}</small>
              </div>
              <span onClick={(e) => e.stopPropagation()}><Toggle checked={p.enabled} onChange={(on) => void api().setEnabled(p.id, on)} label={`Enable ${p.manifest.name}`} /></span>
            </div>
            {p.id === selected && <Details p={p} />}
          </div>
        ))}
        {!shown.length && <p className="flp-muted" style={{ padding: 16 }}>{list.length ? 'No add-ons match.' : 'No add-ons installed yet.'}</p>}
      </div>
      <div className="flp-plugins__bar">
        <SearchField placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} width={210} />
        <span style={{ flex: 1 }} />
        <Button onClick={() => window.flp.shell.openExternal('https://github.com/topics/flp-plugin')}>Find more extensions</Button>
        <Button onClick={async () => {
          const id = await api().install().catch((e: Error) => (showToast(e.message), null))
          if (id) setSelected(id)
        }}>Add</Button>
        <Button disabled={!sel || sel.builtIn} title={sel?.builtIn ? 'Built-in add-ons can be turned off but not removed' : undefined}
          onClick={async () => {
            if (!sel || !(await confirmAction({ title: `Remove “${sel.manifest.name}”?`, message: 'The add-on is moved to the Trash.', confirmLabel: 'Remove' }))) return
            await api().remove(sel.id)
            showToast(`Moved “${sel.manifest.name}” to the Trash`)
          }}>Remove</Button>
      </div>
      <div className="flp-plugins__bar">
        {creating ? (
          <>
            <TextField autoFocus placeholder="Plugin name, e.g. Lyrics Finder" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} style={{ flex: 1, width: 'auto' }} />
            <Button variant="primary" onClick={create}>Create</Button>
            <IconButton icon="close" label="Cancel" onClick={() => setCreating(false)} />
          </>
        ) : (
          <>
            <Button onClick={() => setCreating(true)}><Icon name="add" size={16} /> Create a plugin</Button>
            <Button variant="ghost" onClick={() => api().openGuide()}>Plugin guide</Button>
            <Button variant="ghost" onClick={() => api().openFolder()}>Open plugins folder</Button>
          </>
        )}
      </div>
    </div>
  )
}
