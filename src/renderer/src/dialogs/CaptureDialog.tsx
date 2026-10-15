// Open Capture Device: camera, microphone or screen (macOS AVFoundation).
import { useEffect, useState } from 'react'
import { Button, Select } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { openPaths } from '@/state/playback'
import { errorText, showToast, ui } from '@/state/ui'

export function CaptureDialog() {
  const [devices, setDevices] = useState<{ video: { index: number; name: string }[]; audio: { index: number; name: string }[] } | null>(null)
  const [video, setVideo] = useState<number>(-1)
  const [audio, setAudio] = useState<number>(-1)

  useEffect(() => {
    window.flp.sources.capture().then((d) => {
      setDevices(d)
      setVideo(d.video[0]?.index ?? -1)
    })
  }, [])

  const open = async () => {
    try {
      const url = await window.flp.sources.captureUrl(video >= 0 ? video : null, audio >= 0 ? audio : null)
      ui.closeDialog()
      await openPaths([url])
    } catch (e) {
      showToast(`Couldn't open the capture device: ${errorText(e)}`)
    }
  }

  return (
    <Dialog title="Open Capture Device" width={600} onClose={ui.closeDialog} footer={
      <>
        <Button variant="ghost" onClick={ui.closeDialog}>Cancel</Button>
        <Button variant="primary" disabled={video < 0 && audio < 0} onClick={open}>Open</Button>
      </>
    }>
      <div className="flp-form">
        {!devices ? <p className="flp-muted">Looking for devices…</p> : (
          <>
            <div className="flp-form__title">Video</div>
            <Select<number> value={video} onChange={setVideo} label="Video device"
              options={[{ value: -1, label: 'None' }, ...devices.video.map((d) => ({ value: d.index, label: d.name }))]} />
            <div className="flp-form__title">Audio</div>
            <Select<number> value={audio} onChange={setAudio} label="Audio device"
              options={[{ value: -1, label: 'None' }, ...devices.audio.map((d) => ({ value: d.index, label: d.name }))]} />
            <p className="flp-form__desc">macOS asks for camera, microphone or screen-recording permission the first time. Record what you see with ⇧R.</p>
          </>
        )}
      </div>
    </Dialog>
  )
}
