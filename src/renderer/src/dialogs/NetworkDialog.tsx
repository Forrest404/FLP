// Figma "Open network stream": one or more links, optionally saved as a playlist.
import { useState } from 'react'
import { Button, TextField } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { useSettings } from '@/state/settings'
import { ui } from '@/state/ui'
import { playList } from '@/library/actions'

const isUrl = (s: string) => /^([a-z][a-z0-9+.-]*:\/\/|www\.)\S+$/i.test(s)
const normalize = (s: string) => (/^www\./i.test(s) ? `https://${s}` : s)

export function NetworkDialog() {
  const [text, setText] = useState('')
  const [playlist, setPlaylist] = useState('')
  const urls = text.split(/[\s,]+/).map((s) => s.trim()).filter(isUrl).map(normalize)

  const save = async () => {
    if (!urls.length) return
    const recent = (useSettings.getState().ui.recentUrls as string[] | undefined) ?? []
    await window.flp.settings.setUi('recentUrls', [...urls, ...recent.filter((r) => !urls.includes(r))].slice(0, 30))
    if (playlist.trim()) await window.flp.library.createPlaylist(playlist.trim(), urls)
    ui.closeDialog()
    await playList(urls)
  }

  return (
    <Dialog
      title="Open Network Stream"
      width={1048}
      onClose={ui.closeDialog}
      footer={
        <>
          <Button variant="ghost" onClick={ui.closeDialog}>Cancel</Button>
          <Button variant="primary" disabled={!urls.length} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flp-form">
        <div>
          <div className="flp-form__title">Network URL</div>
          <p className="flp-form__desc">You can enter multiple links to load. Direct links, HLS/DASH, RTSP/RTMP/UDP, and sites supported by yt-dlp (YouTube, Vimeo, Twitch…) all work.</p>
        </div>
        <textarea
          className="ui-field flp-textarea"
          autoFocus
          rows={4}
          placeholder="e.g., https://www.example.com/stream.avi"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}
        />
        <div>
          <div className="flp-form__title">Playlist Name (optional)</div>
          <p className="flp-form__desc">The playlist will be saved and displayed with this title.</p>
        </div>
        <TextField placeholder="e.g., Favorite TV Channels" value={playlist} onChange={(e) => setPlaylist(e.target.value)} style={{ width: '100%' }} />
      </div>
    </Dialog>
  )
}
