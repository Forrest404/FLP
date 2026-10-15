// "Setting Preset" (Figma): save the current panel values under a name and switch between them.
import { useState } from 'react'
import { Button, IconButton, Select, TextField } from '@/components/controls'
import { setUi, useSettings } from '@/state/settings'
import { showOsd } from '@/state/ui'

type Presets = Record<string, Record<string, unknown>>
const NONE: Presets = {}

export function PresetBar({ kind, keys, defaults }: { kind: 'video' | 'audio'; keys: string[]; defaults: Record<string, unknown> }) {
  const all = useSettings((s) => (s.ui.fxPresets as Record<string, Presets> | undefined)?.[kind] ?? NONE)
  const values = useSettings((s) => s.values)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const current = Object.entries(all).find(([, p]) => keys.every((k) => JSON.stringify(p[k]) === JSON.stringify(values[k])))?.[0]
  const isDefault = keys.every((k) => JSON.stringify(defaults[k]) === JSON.stringify(values[k]))

  const save = () => {
    const n = name.trim()
    if (!n) return
    const snap = Object.fromEntries(keys.map((k) => [k, values[k]]))
    const store = (useSettings.getState().ui.fxPresets as Record<string, Presets>) ?? {}
    setUi('fxPresets', { ...store, [kind]: { ...all, [n]: snap } })
    setNaming(false)
    setName('')
    showOsd(`Saved preset “${n}”`)
  }

  const apply = (n: string) => {
    if (n === '__default') return void window.flp.settings.setMany(Object.fromEntries(keys.map((k) => [k, defaults[k]])))
    if (all[n]) void window.flp.settings.setMany(all[n])
  }

  if (naming)
    return (
      <div className="flp-presets">
        <TextField autoFocus placeholder="Preset name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} style={{ flex: 1, width: 'auto' }} />
        <Button variant="primary" onClick={save}>Save</Button>
        <IconButton icon="close" label="Cancel" onClick={() => setNaming(false)} />
      </div>
    )

  const options = [
    { value: '__default', label: 'Default' },
    ...Object.keys(all).map((n) => ({ value: n, label: n })),
    ...(!current && !isDefault ? [{ value: '__custom', label: 'Custom' }] : [])
  ]
  return (
    <div className="flp-presets">
      <Select<string> value={current ?? (isDefault ? '__default' : '__custom')} options={options} onChange={apply} label="Preset" />
      <IconButton icon="save" label="Save as preset" onClick={() => setNaming(true)} />
      {current && (
        <IconButton icon="remove" label="Delete preset" onClick={() => {
          const store = (useSettings.getState().ui.fxPresets as Record<string, Presets>) ?? {}
          const { [current]: _, ...rest } = all
          setUi('fxPresets', { ...store, [kind]: rest })
        }} />
      )}
    </div>
  )
}
