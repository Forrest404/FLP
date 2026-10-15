// Profiles (Figma "Profiles"): named sets of settings, e.g. Movies, Shows, Music, Work.
// While a profile is active, any setting you change is saved into it.
import { useState } from 'react'
import { Button, IconButton, TextField } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { Icon } from '@/components/Icon'
import { useSettings } from '@/state/settings'
import { showOsd, ui, useUi } from '@/state/ui'

const api = () => window.flp.settings

export function ProfilesDialog() {
  const { profiles, activeProfile } = useSettings()
  const startNew = useUi((s) => s.dialogArg === 'new')
  const [creating, setCreating] = useState(startNew)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const create = async () => {
    const n = name.trim()
    if (!n) return
    const id = await api().createProfile(n)
    await api().setProfile(id)
    setCreating(false)
    setName('')
    showOsd(`Profile “${n}” is now active`)
  }

  const rows = [{ id: null as string | null, name: 'Default' }, ...profiles.map((p) => ({ id: p.id as string | null, name: p.name }))]
  return (
    <Dialog title="Profiles" width={651} onClose={ui.closeDialog} footer={
      <>
        <span className="flp-muted" style={{ alignSelf: 'center' }}>Changes you make while a profile is active are saved to it.</span>
        <Button variant="primary" onClick={ui.closeDialog}>Done</Button>
      </>
    }>
      <div className="flp-form">
        <ul className="flp-profiles">
          {rows.map((p) => (
            <li key={p.id ?? 'default'} data-active={activeProfile === p.id} onClick={() => editing !== p.id && void api().setProfile(p.id)}>
              <span className="flp-profiles__check">{activeProfile === p.id && <Icon name="check" size={20} state="active" />}</span>
              {editing === p.id && p.id ? (
                <TextField autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onClick={(e) => e.stopPropagation()}
                  onBlur={() => { void api().renameProfile(p.id!, draft.trim() || p.name); setEditing(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ flex: 1, width: 'auto' }} />
              ) : (
                <span className="flp-profiles__name">{p.name}</span>
              )}
              {p.id && (
                <span className="flp-profiles__actions" onClick={(e) => e.stopPropagation()}>
                  <IconButton icon="edit" label={`Rename ${p.name}`} onClick={() => { setEditing(p.id); setDraft(p.name) }} />
                  <IconButton icon="remove" label={`Delete ${p.name}`} onClick={() => void api().deleteProfile(p.id!)} />
                </span>
              )}
            </li>
          ))}
        </ul>
        {creating ? (
          <div className="flp-form__row">
            <TextField autoFocus placeholder="e.g., Late Night" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} style={{ flex: 1, width: 'auto' }} />
            <Button variant="primary" onClick={create}>Create</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        ) : (
          <Button onClick={() => setCreating(true)}><Icon name="add" size={16} /> New profile</Button>
        )}
      </div>
    </Dialog>
  )
}
