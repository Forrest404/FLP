// Media information: container, every stream, tags, and live playback stats.
import { useEffect, useState } from 'react'
import { Button } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { player, usePlayer } from '@/state/player'
import { baseName } from '@/state/playback'
import { ui, useUi } from '@/state/ui'

type Info = Awaited<ReturnType<typeof window.flp.sources.mediaInfo>>
const TYPE = { video: 'Video', audio: 'Audio', subtitle: 'Subtitles', attachment: 'Attachment', data: 'Data' } as Record<string, string>

export function MediaInfoDialog() {
  const arg = useUi((s) => s.dialogArg) as { path?: string } | null
  const playing = usePlayer((s) => s.path)
  const path = arg?.path ?? playing
  // Each result remembers its path, so a late reply for the previous file is never shown.
  const [result, setResult] = useState<{ path: string; info: Info } | null>(null)
  const [live, setLive] = useState<Record<string, string>>({})
  const info = result?.path === path ? result.info : null
  const loading = !!path && result?.path !== path

  useEffect(() => {
    if (!path) return
    let alive = true
    window.flp.sources.mediaInfo(path).then(
      (info) => alive && setResult({ path, info }),
      () => alive && setResult({ path, info: null })
    )
    return () => {
      alive = false
    }
  }, [path])

  // Live stats while this file is playing.
  useEffect(() => {
    setLive({})
    if (!path || path !== playing) return
    let alive = true
    const read = async () => {
      const [hw, fps, dropped, vbr, abr, cache] = await Promise.all(['hwdec-current', 'estimated-vf-fps', 'frame-drop-count', 'video-bitrate', 'audio-bitrate', 'demuxer-cache-duration'].map((p) => player.get(p)))
      if (!alive) return
      setLive({
        'Hardware decoding': hw && hw !== 'no' ? String(hw) : 'Off',
        'Displayed FPS': fps ? Number(fps).toFixed(2) : '',
        'Dropped frames': String(dropped ?? 0),
        'Video bitrate (now)': vbr ? `${Math.round(Number(vbr) / 1000)} kb/s` : '',
        'Audio bitrate (now)': abr ? `${Math.round(Number(abr) / 1000)} kb/s` : '',
        Buffered: cache ? `${Number(cache).toFixed(1)} s` : ''
      })
    }
    void read()
    const t = setInterval(read, 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [path, playing])

  const Table = ({ rows }: { rows: [string, string][] }) => (
    <dl className="flp-info">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  )

  return (
    <Dialog title="Media Information" width={720} height={info ? 680 : undefined} onClose={ui.closeDialog} footer={
      <>
        {path && !/^[a-z]+:\/\//i.test(path) ? <Button variant="ghost" onClick={() => window.flp.shell.showInFolder(path)}>Show in Finder</Button> : <span />}
        <Button variant="primary" onClick={ui.closeDialog}>Done</Button>
      </>
    }>
      <div className="flp-form">
        {!path && <p className="flp-muted">Nothing is playing.</p>}
        {path && <div className="flp-form__title" style={{ wordBreak: 'break-all' }}>{baseName(path)}</div>}
        {loading && <p className="flp-muted">Reading…</p>}
        {path && !loading && !info && <p className="flp-muted">No details available.</p>}
        {info && <Table rows={Object.entries(info.format)} />}
        {!loading && Object.keys(live).length > 0 && <><div className="flp-form__title">Playback</div><Table rows={Object.entries(live)} /></>}
        {info && (
          <>
            {info.streams.map((s) => (
              <div key={s.index}>
                <div className="flp-form__title">{TYPE[s.type] ?? s.type} · stream {s.index}</div>
                <Table rows={s.fields} />
              </div>
            ))}
            {Object.keys(info.tags).length > 0 && <><div className="flp-form__title">Tags</div><Table rows={Object.entries(info.tags).map(([k, v]) => [k.replace(/_/g, ' '), String(v)])} /></>}
          </>
        )}
      </div>
    </Dialog>
  )
}
