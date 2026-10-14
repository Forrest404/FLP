import { useState } from 'react'
import { Button, TextField } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { useSettings } from '@/state/settings'
import { openPaths } from '@/state/playback'
import { ui } from '@/state/ui'

/** Figma "Open network stream": a URL field plus recent streams. */
export function NetworkDialog() {
  const recent = ((useSettings.getState().ui.recentUrls as string[] | undefined) ?? []).slice(0, 8)
  const [url, setUrl] = useState('')
  const valid = /^([a-z][a-z0-9+.-]*:\/\/|www\.)\S+$/i.test(url.trim())

  const open = (u = url) => {
    const target = /^www\./i.test(u.trim()) ? `https://${u.trim()}` : u.trim()
    void window.flp.settings.setUi('recentUrls', [target, ...recent.filter((r) => r !== target)].slice(0, 20))
    ui.closeDialog()
    void openPaths([target])
  }

  return (
    <Dialog
      title="Open Network Stream"
      width={720}
      onClose={ui.closeDialog}
      footer={
        <>
          <Button variant="ghost" onClick={ui.closeDialog}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => open()}>Play</Button>
        </>
      }
    >
      <div className="flp-form">
        <label className="flp-form__label">Network URL</label>
        <TextField
          autoFocus
          style={{ width: '100%' }}
          placeholder="https://, rtsp://, rtmp://, udp://, or a YouTube link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valid && open()}
        />
        <p className="flp-muted">Works with direct links, HLS/DASH playlists, RTSP/RTMP/UDP streams, and sites supported by yt-dlp (YouTube, Vimeo, Twitch…).</p>
        {recent.length > 0 && (
          <>
            <label className="flp-form__label">Recent</label>
            <ul className="flp-list">
              {recent.map((r) => (
                <li key={r} className="flp-list__row" onClick={() => setUrl(r)} onDoubleClick={() => open(r)}>
                  <span className="flp-list__title">{r}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  )
}
