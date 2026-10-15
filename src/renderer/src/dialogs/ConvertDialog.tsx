// Convert / Save and Stream (VLC's "Convert / Save" and "Stream" in one place).
import { useEffect, useState } from 'react'
import type { Job } from '@shared/api'
import { Button, IconButton, Segmented, Select, TextField } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { Icon } from '@/components/Icon'
import { usePlayer } from '@/state/player'
import { baseName } from '@/state/playback'
import { errorText, showOsd, showToast, ui, useUi } from '@/state/ui'

const parseTime = (s: string): number | undefined => {
  if (!s.trim()) return undefined
  const parts = s.split(':').map(Number)
  if (parts.some(Number.isNaN)) return undefined
  return parts.reduce((a, b) => a * 60 + b, 0)
}

function JobList() {
  const [jobs, setJobs] = useState<Job[]>([])
  useEffect(() => {
    window.flp.jobs.list().then(setJobs)
    return window.flp.jobs.onList(setJobs)
  }, [])
  if (!jobs.length) return null
  return (
    <div className="flp-jobs">
      <div className="flp-form__row" style={{ justifyContent: 'space-between' }}>
        <div className="flp-form__title">Jobs</div>
        <Button variant="ghost" onClick={() => void window.flp.jobs.clear()}>Clear finished</Button>
      </div>
      {jobs.map((j) => (
        <div key={j.id} className="flp-job" data-status={j.status}>
          <Icon name={j.kind === 'stream' ? 'streaming' : 'swap'} size={18} />
          <div className="flp-job__main">
            <div className="flp-job__name">{baseName(j.input)} → {j.kind === 'stream' ? j.url : baseName(j.output)}</div>
            <div className="flp-job__bar"><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
            <div className="flp-job__status">
              {j.status === 'running' ? (j.kind === 'stream' ? 'Streaming' : `${Math.round(j.progress * 100)}%`) : j.status === 'failed' ? `Failed: ${j.error ?? ''}` : j.status}
            </div>
          </div>
          {j.status === 'done' && j.kind === 'convert' && <IconButton icon="folder" label="Show in Finder" onClick={() => window.flp.shell.showInFolder(j.output)} />}
          {j.kind === 'stream' && j.url && j.status === 'running' && <IconButton icon="link" label="Copy address" onClick={() => { void navigator.clipboard.writeText(j.url!); showOsd('Address copied') }} />}
          {(j.status === 'running' || j.status === 'queued') && <IconButton icon="close" label={j.kind === 'stream' ? 'Stop stream' : 'Cancel'} onClick={() => void window.flp.jobs.cancel(j.id)} />}
        </div>
      ))}
    </div>
  )
}

export function ConvertDialog() {
  const arg = useUi((s) => s.dialogArg) as { paths?: string[]; tab?: 'convert' | 'stream' } | null
  const playing = usePlayer((s) => s.path)
  const [tab, setTab] = useState<'convert' | 'stream'>(arg?.tab ?? 'convert')
  const [inputs, setInputs] = useState<string[]>(arg?.paths ?? (playing ? [playing] : []))
  const [presets, setPresets] = useState<{ id: string; label: string }[]>([])
  const [preset, setPreset] = useState('mp4-h264')
  const [height, setHeight] = useState(0)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [outDir, setOutDir] = useState('')
  const [target, setTarget] = useState<'hls' | 'udp'>('hls')
  const [udp, setUdp] = useState('239.0.0.1:1234')

  useEffect(() => void window.flp.jobs.presets().then(setPresets), [])

  const addFiles = async () => {
    const files = await window.flp.dialog.openFiles({ title: 'Choose files to convert' })
    setInputs((cur) => [...cur, ...files.filter((f) => !cur.includes(f))])
  }

  const go = async () => {
    try {
      if (tab === 'convert') {
        await window.flp.jobs.convert(inputs, { preset, height: height || undefined, start: parseTime(start), end: parseTime(end), outDir: outDir || undefined })
        showOsd(`Converting ${inputs.length} file${inputs.length === 1 ? '' : 's'}`)
      } else {
        const url = await window.flp.jobs.stream(inputs[0], target, udp)
        if (url) {
          void navigator.clipboard.writeText(url)
          showOsd('Streaming. Address copied')
        }
      }
    } catch (e) {
      showToast(`Couldn't ${tab === 'convert' ? 'convert' : 'start streaming'}: ${errorText(e)}`)
    }
  }

  return (
    <Dialog title={tab === 'convert' ? 'Convert / Save' : 'Stream'} width={760} height={720} onClose={ui.closeDialog} footer={
      <>
        <Button variant="ghost" onClick={ui.closeDialog}>Close</Button>
        <Button variant="primary" disabled={!inputs.length} onClick={go}>{tab === 'convert' ? 'Convert' : 'Start streaming'}</Button>
      </>
    }>
      <div className="flp-form">
        <Segmented<'convert' | 'stream'> value={tab} onChange={setTab} options={[{ value: 'convert', label: 'Convert / Save' }, { value: 'stream', label: 'Stream' }]} />
        <div>
          <div className="flp-form__title">{tab === 'stream' ? 'Source' : 'Files'}</div>
          <div className="flp-dropbox" style={{ minHeight: 70 }} onClick={addFiles}>
            {inputs.length ? (
              <ul>
                {(tab === 'stream' ? inputs.slice(0, 1) : inputs).map((p) => (
                  <li key={p}><Icon name="file" size={16} /><span>{baseName(p)}</span>
                    <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); setInputs(inputs.filter((x) => x !== p)) }}><Icon name="close" size={14} /></button></li>
                ))}
              </ul>
            ) : <span>Click to choose files.</span>}
          </div>
        </div>
        {tab === 'convert' ? (
          <>
            <div className="flp-form__title">Format</div>
            <Select<string> value={preset} onChange={setPreset} options={presets.map((p) => ({ value: p.id, label: p.label }))} label="Format" />
            <div className="flp-form__row">
              <div style={{ flex: 1 }}>
                <div className="flp-form__desc" style={{ marginBottom: 6 }}>Resolution</div>
                <Select<number> value={height} onChange={setHeight} label="Resolution" options={[{ value: 0, label: 'Keep original' }, { value: 2160, label: '4K (2160p)' }, { value: 1080, label: '1080p' }, { value: 720, label: '720p' }, { value: 480, label: '480p' }]} />
              </div>
              <div>
                <div className="flp-form__desc" style={{ marginBottom: 6 }}>Start (mm:ss)</div>
                <TextField style={{ width: 110 }} placeholder="0:00" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <div className="flp-form__desc" style={{ marginBottom: 6 }}>End (mm:ss)</div>
                <TextField style={{ width: 110 }} placeholder="end" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="flp-form__desc">Save to</div>
            <div className="flp-form__row">
              <TextField style={{ flex: 1, width: 'auto' }} placeholder="Same folder as each file" value={outDir} onChange={(e) => setOutDir(e.target.value)} />
              <Button onClick={async () => {
                const [d] = await window.flp.dialog.openFiles({ folders: true, multiple: false, title: 'Save converted files to' })
                if (d) setOutDir(d)
              }}>Browse</Button>
            </div>
            <p className="flp-form__desc">Existing files are never overwritten. Encoding speed/quality comes from Settings → Recording.</p>
          </>
        ) : (
          <>
            <div className="flp-form__title">Stream to</div>
            <Segmented<'hls' | 'udp'> value={target} onChange={setTarget} options={[{ value: 'hls', label: 'Web address (HTTP)' }, { value: 'udp', label: 'Network (UDP)' }]} />
            {target === 'udp' && <TextField value={udp} onChange={(e) => setUdp(e.target.value)} placeholder="239.0.0.1:1234" style={{ width: '100%' }} />}
            <p className="flp-form__desc">
              {target === 'hls'
                ? 'Anyone on your network can open the address in Safari, VLC or FLP. The address is copied when the stream starts.'
                : 'Sends an MPEG-TS stream to a multicast or device address. Open udp://@address in the receiving player.'}
            </p>
          </>
        )}
        <JobList />
      </div>
    </Dialog>
  )
}
