import { useEffect, useState } from 'react'
import { Button, IconButton, Slider } from '@/components/controls'
import { runCommand } from '@/commands/registry'
import { player, usePlayer } from '@/state/player'
import { fmtTime, setSpeed } from '@/state/playback'
import { setSetting } from '@/state/settings'
import { Section } from './Section'

const SPEED_TICKS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export function PlaybackPanel() {
  const { speed, chapters, chapter, abA, abB, loopFile, loopPlaylist, duration } = usePlayer()
  return (
    <>
      <Section title="Speed">
        <Slider value={speed} min={0.25} max={2} step={0.05} ticks={SPEED_TICKS}
          labels={[0.25, 1, 2].map((v) => ({ value: v, text: `${v}×` }))}
          onChange={(v) => void setSpeed(v)} label="Playback speed" />
        <div className="flp-chips">
          {[0.5, 1, 1.25, 1.5, 2].map((s) => (
            <button key={s} type="button" aria-pressed={Math.abs(speed - s) < 0.01} onClick={() => void setSpeed(s)}>{s}×</button>
          ))}
        </div>
      </Section>
      <Section title="Repeat">
        <div className="flp-chips">
          <button type="button" aria-pressed={!loopFile && !loopPlaylist} onClick={() => setSetting('playback.repeat', 'off')}>Off</button>
          <button type="button" aria-pressed={loopFile} onClick={() => setSetting('playback.repeat', 'one')}>One</button>
          <button type="button" aria-pressed={loopPlaylist} onClick={() => setSetting('playback.repeat', 'all')}>All</button>
        </div>
      </Section>
      <Section title="A-B loop">
        <p className="flp-muted">{abA === null ? 'Not set' : `${fmtTime(abA)} → ${abB === null ? '…' : fmtTime(abB)}`}</p>
        <Button onClick={() => void runCommand('player.abLoop')}>{abA === null ? 'Set A' : abB === null ? 'Set B' : 'Clear'}</Button>
      </Section>
      <Bookmarks />
      {chapters.length > 0 && (
        <Section title="Chapters">
          <ul className="flp-list">
            {chapters.map((c, i) => (
              <li key={i} className="flp-list__row" data-current={chapter === i} onClick={() => void player.set('chapter', i)}>
                <span className="flp-list__title">{c.title || `Chapter ${i + 1}`}</span>
                <span className="flp-muted">{fmtTime(c.time, duration >= 3600)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

type Bookmark = { id: number; time: number; name: string }

function Bookmarks() {
  const path = usePlayer((s) => s.path)
  const duration = usePlayer((s) => s.duration)
  const [marks, setMarks] = useState<Bookmark[]>([])
  const refresh = () => path && window.flp.library.bookmarks(path).then(setMarks)
  useEffect(() => {
    setMarks([])
    void refresh()
    window.addEventListener('flp:bookmarks-changed', refresh)
    return () => window.removeEventListener('flp:bookmarks-changed', refresh)
  }, [path])
  return (
    <Section title="Bookmarks" aside={<IconButton icon="bookmark" label="Add bookmark here" onClick={() => void runCommand('player.bookmark')} />}>
      {marks.length ? (
        <ul className="flp-list">
          {marks.map((m) => (
            <li key={m.id} className="flp-list__row" onClick={() => void player.command('seek', m.time, 'absolute+exact')}>
              <span className="flp-list__title">{m.name}</span>
              <span className="flp-muted">{fmtTime(m.time, duration >= 3600)}</span>
              <IconButton icon="close" label="Remove bookmark" onClick={async (e) => {
                e.stopPropagation()
                await window.flp.library.removeBookmark(m.id)
                void refresh()
              }} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="flp-muted">No bookmarks yet. Press ⌘B to mark the current moment.</p>
      )}
    </Section>
  )
}
