import { Button, Select } from '@/components/controls'
import { Icon } from '@/components/Icon'
import { runCommand } from '@/commands/registry'
import { player, usePlayer } from '@/state/player'
import { trackLabel } from '@/state/playback'
import { setSetting } from '@/state/settings'
import { ui } from '@/state/ui'
import { FxSelect, FxSlider, FxToggle } from './fx'
import { Section } from './Section'

export function SubtitlesPanel() {
  const tracks = usePlayer((s) => s.tracks).filter((t) => t.type === 'sub')
  const subDelay = usePlayer((s) => s.subDelay)
  // main-selection tells the primary (0) and secondary (1) subtitle apart; older states lack it.
  const hasMain = tracks.some((t) => t.mainSelection !== undefined)
  const selected = (hasMain ? tracks.find((t) => t.mainSelection === 0) : tracks.find((t) => t.selected))?.id ?? 'no'
  const secondary = (hasMain ? tracks.find((t) => t.mainSelection === 1) : undefined)?.id ?? 'no'
  const options = [{ value: 'no' as string | number, label: 'Off' }, ...tracks.map((t) => ({ value: t.id as string | number, label: trackLabel(t) + (t.external ? ' (file)' : '') }))]
  return (
    <>
      <Section title="Tracks">
        <div className="flp-fx-row">
          <div className="flp-fx-row__label"><span>Subtitles</span></div>
          <Select<string | number> label="Subtitle track" value={selected} options={options} onChange={(v) => void player.set('sid', v)} />
        </div>
        <div className="flp-fx-row">
          <div className="flp-fx-row__label"><span>Second subtitles (e.g. another language)</span></div>
          <Select<string | number> label="Second subtitle track" value={secondary} options={options} onChange={(v) => void player.set('secondary-sid', v)} />
        </div>
        <div className="flp-chips">
          <Button onClick={() => void runCommand('subs.add')}><Icon name="add" size={16} /> Add file…</Button>
          <Button onClick={() => ui.openDialog('addSubtitles')}><Icon name="folder" size={16} /> Add to folder…</Button>
        </div>
      </Section>
      <Section title="Timing">
        <div className="flp-fx-row">
          <div className="flp-fx-row__label">
            <span>Delay</span>
            <span className="flp-fx-row__value">{Math.round(subDelay * 1000)} ms</span>
          </div>
          <div className="flp-chips">
            <button type="button" onClick={() => void player.command('add', 'sub-delay', -0.5)}>−500</button>
            <button type="button" onClick={() => void player.command('add', 'sub-delay', -0.05)}>−50</button>
            <button type="button" onClick={() => void player.set('sub-delay', 0)}>Reset</button>
            <button type="button" onClick={() => void player.command('add', 'sub-delay', 0.05)}>+50</button>
            <button type="button" onClick={() => void player.command('add', 'sub-delay', 0.5)}>+500</button>
          </div>
          <p className="flp-muted">Subtitles too early? Add delay. Too late? Remove it. Keys: G / H.</p>
        </div>
        <Button onClick={() => {
          // Save this file's delay as the default for future files.
          setSetting('subtitles.delay', subDelay)
        }}>Use this delay as the default</Button>
      </Section>
      <Section title="Appearance" defaultOpen={false}>
        <FxSlider k="subtitles.fontSize" label="Size" min={20} max={100} step={1} fallback={46} />
        <FxToggle k="subtitles.bold" label="Bold" />
        <FxSelect k="subtitles.position" label="Position" fallback="bottom" options={[
          { value: 'bottom', label: 'Bottom' }, { value: 'raised', label: 'Raised' }, { value: 'middle', label: 'Middle' }, { value: 'top', label: 'Top' }]} />
        <FxSelect k="subtitles.background" label="Background" fallback="none" options={[{ value: 'none', label: 'None' }, { value: 'box', label: 'Box behind text' }]} />
        <FxSelect k="subtitles.outline" label="Outline" fallback="normal" options={[
          { value: 'none', label: 'None' }, { value: 'thin', label: 'Thin' }, { value: 'normal', label: 'Normal' }, { value: 'thick', label: 'Thick' }]} />
        <Button block onClick={() => ui.openSettings('subtitles')}>All subtitle settings…</Button>
      </Section>
    </>
  )
}
