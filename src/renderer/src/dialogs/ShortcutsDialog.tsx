// Figma "Keyboard Shortcuts": search, then Action | Hotkey | Global Hotkey, grouped by category.
// Click a field and press keys to record; Backspace clears; Esc cancels.
import { useMemo, useState } from 'react'
import { Button, SearchField, Select } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { Icon } from '@/components/Icon'
import { eventToKey, formatKey, useCommands, type Command } from '@/commands/registry'
import { useSettings } from '@/state/settings'
import { showToast, ui } from '@/state/ui'

type Map = Record<string, string[]>
const CATEGORY_ORDER = ['Basic', 'Playback', 'Navigation', 'Audio', 'Video', 'Subtitles', 'Media', 'Library', 'Interface']

function KeyField({ value, onChange, conflict }: { value: string | undefined; onChange(k: string | null): void; conflict?: string }) {
  const [recording, setRecording] = useState(false)
  return (
    <button
      type="button"
      className="flp-keyfield"
      data-recording={recording}
      data-conflict={!!conflict}
      data-capture-keys
      title={conflict ? `Also used by “${conflict}”` : 'Click, then press the keys'}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Escape') return setRecording(false)
        if (e.key === 'Backspace' || e.key === 'Delete') {
          onChange(null)
          return setRecording(false)
        }
        const k = eventToKey(e.nativeEvent)
        if (!k) return
        onChange(k)
        setRecording(false)
      }}
    >
      <span>{recording ? 'Press keys…' : value ? formatKey(value) : ''}</span>
      <Icon name="edit" size={16} />
    </button>
  )
}

export function ShortcutsDialog() {
  const commands = useCommands((s) => s.commands)
  const saved = useSettings((s) => s.ui)
  const [local, setLocal] = useState<Map>(() => ({ ...((saved.shortcuts as Map) ?? {}) }))
  const [global, setGlobal] = useState<Record<string, string>>(() => ({ ...((saved.globalShortcuts as Record<string, string>) ?? {}) }))
  const [query, setQuery] = useState('')
  const [field, setField] = useState<'all' | 'action' | 'hotkey'>('all')

  const keysOf = (c: Command) => local[c.id] ?? c.keys ?? []
  // Which command owns each key, to flag conflicts.
  const owners = useMemo(() => {
    const m = new globalThis.Map<string, string[]>()
    for (const c of Object.values(commands)) for (const k of local[c.id] ?? c.keys ?? []) m.set(k, [...(m.get(k) ?? []), c.id])
    return m
  }, [commands, local])

  const q = query.toLowerCase()
  const groups = useMemo(() => {
    const list = Object.values(commands).filter((c) => {
      if (!q) return true
      const inAction = c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
      const inKeys = keysOf(c).some((k) => formatKey(k).toLowerCase().includes(q) || k.toLowerCase().includes(q))
      return field === 'action' ? inAction : field === 'hotkey' ? inKeys : inAction || inKeys
    })
    const cats = [...new Set(list.map((c) => c.category))].sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99))
    return cats.map((cat) => ({ cat, items: list.filter((c) => c.category === cat).sort((a, b) => a.title.localeCompare(b.title)) }))
  }, [commands, q, field, local])

  const save = async () => {
    await window.flp.settings.setUi('shortcuts', local)
    await window.flp.settings.setUi('globalShortcuts', global)
    const failed = await window.flp.app.registerGlobalShortcuts(global)
    if (failed.length) showToast(`Couldn't register ${failed.length} global hotkey${failed.length === 1 ? '' : 's'} (another app may be using ${failed.length === 1 ? 'it' : 'them'}).`)
    ui.closeDialog()
  }

  return (
    <Dialog
      width={1048}
      height={800}
      onClose={ui.closeDialog}
      head={
        <div className="ui-dialog__head flp-keys__head">
          <span className="ui-dialog__title">Keyboard Shortcuts</span>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={ui.closeDialog}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flp-keys__search">
        <SearchField autoFocus placeholder="Search Keyboard Shortcuts…" value={query} onChange={(e) => setQuery(e.target.value)} width="100%" />
        <Select<'all' | 'action' | 'hotkey'> value={field} onChange={setField} label="Search in"
          options={[{ value: 'all', label: 'All Fields' }, { value: 'action', label: 'Action' }, { value: 'hotkey', label: 'Hotkey' }]} />
      </div>
      <div className="flp-keys">
        <div className="flp-keys__cols"><span>Action</span><span>Hotkey</span><span>Global Hotkey</span></div>
        {groups.map(({ cat, items }) => (
          <section key={cat} className="flp-keys__group">
            <h3>{cat}</h3>
            {items.map((c) => {
              const k = keysOf(c)[0]
              const others = k ? (owners.get(k) ?? []).filter((id) => id !== c.id) : []
              return (
                <div key={c.id} className="flp-keys__row">
                  <span>{c.title}</span>
                  <KeyField value={k} conflict={others[0] ? commands[others[0]]?.title : undefined}
                    onChange={(nk) => setLocal({ ...local, [c.id]: nk ? [nk, ...keysOf(c).slice(1).filter((x) => x !== nk)] : [] })} />
                  <KeyField value={global[c.id]} onChange={(nk) => {
                    const { [c.id]: _, ...rest } = global
                    setGlobal(nk ? { ...rest, [c.id]: nk } : rest)
                  }} />
                </div>
              )
            })}
          </section>
        ))}
        <Button variant="ghost" onClick={() => {
          setLocal({})
          setGlobal({})
        }}>Restore defaults</Button>
      </div>
    </Dialog>
  )
}
