// Open Disc: DVD (main feature or any title), Blu-ray, audio CD, or a disc folder / image.
import { useEffect, useState } from 'react'
import { Button, Select } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { Icon } from '@/components/Icon'
import { Empty } from '@/player/Sidebar'
import { openPaths } from '@/state/playback'
import { getSetting } from '@/state/settings'
import { ui } from '@/state/ui'

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
    if (disc?.kind === 'dvd') window.flp.sources.dvdTitles(disc.path).then((t) => {
      setTitles(t)
      setTitle(t[0]?.url ?? '')
    })
  }, [disc?.path])

  const play = async () => {
    if (!disc) return
    ui.closeDialog()
    if (disc.kind === 'dvd' && title) await openPaths([title])
    else if (disc.kind === 'bluray') {
      await window.flp.player.set('bluray-device', disc.path)
      await openPaths(['bd://'])
    } else await openPaths([disc.path])
  }

  const chooseFolder = async () => {
    const [p] = await window.flp.dialog.openFiles({ folders: true, multiple: false, title: 'Choose a disc folder (VIDEO_TS / BDMV) or a mounted disc' })
    if (!p) return
    const kind = /VIDEO_TS$/i.test(p) ? 'dvd' : /BDMV$/i.test(p) ? 'bluray' : null
    const d: Disc = { path: kind === 'bluray' ? p.replace(/\/BDMV$/i, '') : p, name: p.split('/').pop() ?? p, kind: kind ?? 'dvd' }
    setDiscs((cur) => [...(cur ?? []), d])
    setDisc(d)
  }

  return (
    <Dialog title="Open Disc" width={640} onClose={ui.closeDialog} footer={
      <>
        <Button variant="ghost" onClick={chooseFolder}><Icon name="folder" size={16} /> Disc folder or image…</Button>
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
