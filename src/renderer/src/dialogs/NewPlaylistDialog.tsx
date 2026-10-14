// Figma "new playlist": title + thumbnail, then files (drop or pick). Also used for renaming.
import { useState } from 'react'
import { mediaUrl } from '@shared/api'
import type { Playlist } from '@shared/library'
import { Button, TextField } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { Icon } from '@/components/Icon'
import { showOsd, ui, useUi } from '@/state/ui'

export function NewPlaylistDialog() {
  const arg = useUi((s) => s.dialogArg) as { paths?: string[]; rename?: Playlist } | null
  const rename = arg?.rename
  const [name, setName] = useState(rename?.name ?? '')
  const [cover, setCover] = useState<string | null>(rename?.cover ?? null)
  const [paths, setPaths] = useState<string[]>(arg?.paths ?? [])
  const [over, setOver] = useState(false)

  const save = async () => {
    const title = name.trim() || 'New Playlist'
    if (rename) {
      await window.flp.library.renamePlaylist(rename.id, title)
      showOsd('Playlist renamed')
    } else {
      await window.flp.library.createPlaylist(title, paths, cover)
      showOsd(`Created “${title}”`)
    }
    ui.closeDialog()
  }

  const pickFiles = async () => {
    const files = await window.flp.dialog.openFiles({ title: 'Choose files for the playlist' })
    setPaths((p) => [...p, ...files.filter((f) => !p.includes(f))])
  }

  return (
    <Dialog
      title={rename ? 'Rename Playlist' : 'New Playlist'}
      width={713}
      onClose={ui.closeDialog}
      footer={
        <>
          <Button variant="ghost" onClick={ui.closeDialog}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flp-form">
        <div>
          <div className="flp-form__title">Playlist Details</div>
          <p className="flp-form__desc">The playlist will be saved and displayed with this title and thumbnail.</p>
        </div>
        <div className="flp-form__row">
          <button type="button" className="flp-thumbpick" title="Choose a thumbnail" onClick={async () => {
            const [img] = await window.flp.dialog.openFiles({ title: 'Choose a thumbnail image', multiple: false })
            if (img) setCover(img)
          }}>
            {cover ? <img src={mediaUrl(cover)} alt="" /> : <Icon name="thumbnail" size={22} />}
          </button>
          <TextField autoFocus placeholder="e.g., Favorite Videos" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()} style={{ flex: 1, width: 'auto' }} />
        </div>
        {!rename && (
          <>
            <div>
              <div className="flp-form__title">Select Files</div>
              <p className="flp-form__desc">These files will be added to the playlist.</p>
            </div>
            <div
              className="flp-dropbox"
              data-over={over}
              onClick={pickFiles}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOver(false)
                const dropped = [...e.dataTransfer.files].map((f) => window.flp.pathForFile(f)).filter(Boolean)
                setPaths((p) => [...p, ...dropped.filter((f) => !p.includes(f))])
              }}
            >
              {paths.length ? (
                <ul>
                  {paths.map((p) => (
                    <li key={p}>
                      <Icon name="file" size={16} />
                      <span>{p.split('/').pop()}</span>
                      <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); setPaths(paths.filter((x) => x !== p)) }}>
                        <Icon name="close" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span>Drag files into the box or click here to select files.</span>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
