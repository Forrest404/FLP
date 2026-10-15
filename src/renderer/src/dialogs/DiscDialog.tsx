// Open Disc: DVD (main feature or any title), Blu-ray, audio CD, or a disc folder / image.
import { useEffect, useState } from 'react'
import { Button, Select } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { Icon } from '@/components/Icon'
import { Empty } from '@/player/Sidebar'
import { openPaths } from '@/state/playback'
import { getSetting } from '@/state/settings'
import { errorText, showToast, ui } from '@/state/ui'

type Disc = { path: string; name: string; kind: 'dvd' | 'bluray' | 'audiocd' }
const KIND = { dvd: 'DVD', bluray: 'Blu-ray', audiocd: 'Audio CD' }

export function DiscDialog() {
  const [discs, setDiscs] = useState<Disc[] | null>(null)
  const [disc, setDisc] = useState<Disc | null>(null)
  const [titles, setTitles] = useState<{ index: number; label: string; url: string }[]>([])
  const [title, setTitle] = useState('')

  const refresh = () => window.flp.sources.discs().then((d) => {
    setDiscs(d)
    // Prefer the default drive from Settings → Playback.
    const preferred = String(getSetting('playback.opticalDrive') ?? '')
    setDisc((cur) => cur ?? d.find((x) => preferred && x.path === preferred) ?? d[0] ?? null)
  })
  useEffect(() => void refresh(), [])
  useEffect(() => {
    setTitles([])
    setTitle('')
    if (disc?.kind !== 'dvd') return
    let alive = true
    window.flp.sources.dvdTitles(disc.path).then((t) => {
      if (!alive) return
      setTitles(t)
      setTitle(t[0]?.url ?? '')
    })
    return () => {
      alive = false
    }
  }, [disc?.path, disc?.kind])

  const play = async () => {
    if (!disc) return
    ui.closeDialog()
    if (disc.kind === 'dvd' && title) await openPaths([title])
    else if (disc.kind === 'bluray') {
      await window.flp.player.set('bluray-device', disc.path)
      await openPaths(['bd://'])
    } else await openPaths([disc.path])
  }

  const choose = async (image: boolean) => {
    const [picked] = await window.flp.dialog.openFiles(image
      ? { multiple: false, filters: ['iso'], title: 'Choose a disc image' }
      : { folders: true, multiple: false, title: 'Choose a disc folder (VIDEO_TS / BDMV) or a mounted disc' })
    if (!picked) return
    // A BDMV folder stands for the Blu-ray root above it; an image is mounted and read like a disc.
    let path = picked.replace(/\/BDMV\/?$/i, '')
    if (image) {
      try {
        path = await window.flp.sources.mountImage(picked)
      } catch (err) {
        return showToast(errorText(err))
      }
    }
    const known = discs?.find((d) => d.path === path)
    if (known) return setDisc(known)
    const kind = await window.flp.sources.discKind(path)
    if (!kind) return showToast('That isn’t a DVD, Blu-ray or audio CD folder')
    const d: Disc = { path, name: path.split('/').pop() ?? path, kind }
    setDiscs((cur) => (cur?.some((x) => x.path === path) ? cur : [...(cur ?? []), d]))
    setDisc(d)
  }

  return (
    <Dialog title="Open Disc" width={640} onClose={ui.closeDialog} footer={
      <>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => void choose(false)}><Icon name="folder" size={16} /> Choose folder…</Button>
          <Button variant="ghost" onClick={() => void choose(true)}><Icon name="disc" size={16} /> Choose image…</Button>
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={ui.closeDialog}>Cancel</Button>
          <Button variant="primary" disabled={!disc} onClick={play}>Play</Button>
        </span>
      </>
    }>
      <div className="flp-form">
        {discs && !discs.length && <Empty icon="disc" text="No disc found. Insert a DVD, Blu-ray or audio CD, or choose a disc folder."><Button onClick={() => void refresh()}>Look again</Button></Empty>}
        {discs && discs.length > 0 && (
          <ul className="flp-profiles">
            {discs.map((d) => (
              <li key={d.path} data-active={disc?.path === d.path} onClick={() => setDisc(d)}>
                <span className="flp-profiles__check">{disc?.path === d.path && <Icon name="check" size={20} state="active" />}</span>
                <Icon name="disc" size={20} />
                <span className="flp-profiles__name">{d.name}</span>
                <span className="flp-muted">{KIND[d.kind]}</span>
              </li>
            ))}
          </ul>
        )}
        {disc?.kind === 'dvd' && titles.length > 0 && (
          <>
            <div className="flp-form__title">Title</div>
            <Select<string> value={title} onChange={setTitle} options={titles.map((t) => ({ value: t.url, label: t.label }))} label="Title" />
            <p className="flp-form__desc">DVD menus aren't supported, so FLP plays titles directly. The main feature is listed first.</p>
          </>
        )}
      </div>
    </Dialog>
  )
}
