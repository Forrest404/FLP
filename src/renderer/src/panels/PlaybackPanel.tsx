import { Button, Slider } from '@/components/controls'
import { runCommand } from '@/commands/registry'
import { player, usePlayer } from '@/state/player'
import { fmtTime, setSpeed } from '@/state/playback'
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
          <button type="button" aria-pressed={!loopFile && !loopPlaylist} onClick={async () => { await player.set('loop-file', 'no'); await player.set('loop-playlist', 'no') }}>Off</button>
          <button type="button" aria-pressed={loopFile} onClick={async () => { await player.set('loop-playlist', 'no'); await player.set('loop-file', 'inf') }}>One</button>
          <button type="button" aria-pressed={loopPlaylist} onClick={async () => { await player.set('loop-file', 'no'); await player.set('loop-playlist', 'inf') }}>All</button>
        </div>
      </Section>
      <Section title="A-B loop">
        <p className="flp-muted">{abA === null ? 'Not set' : `${fmtTime(abA)} → ${abB === null ? '…' : fmtTime(abB)}`}</p>
        <Button onClick={() => void runCommand('player.abLoop')}>{abA === null ? 'Set A' : abB === null ? 'Set B' : 'Clear'}</Button>
      </Section>
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
