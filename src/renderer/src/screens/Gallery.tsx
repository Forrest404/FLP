// Dev-only page (open with ?gallery) showing every base component, for comparing with Figma.
import { useState } from 'react'
import { AccentSwatches, Button, ColorField, IconButton, NumberField, SearchField, Segmented, Select, Slider, TextField, Toggle } from '@/components/controls'
import { Icon, iconNames } from '@/components/Icon'
import { openMenu } from '@/components/Menu'
import { setSetting, useSetting } from '@/state/settings'
import type { AccentId } from '@shared/theme'

export function Gallery() {
  const [on, setOn] = useState(true)
  const [off, setOff] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [delay, setDelay] = useState(1.2)
  const [sel, setSel] = useState('always')
  const accent = useSetting<AccentId>('general.accent') ?? 'green'
  const theme = useSetting<string>('general.theme') ?? 'dark'

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg-canvas)', padding: '48px 32px', display: 'grid', gap: 28 }}>
      <Row label="Theme"><Segmented value={theme} onChange={(v) => setSetting('general.theme', v)} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} /></Row>
      <Row label="Accent"><AccentSwatches value={accent} onChange={(v) => setSetting('general.accent', v)} /></Row>
      <Row label="Toggles"><Toggle checked={on} onChange={setOn} /> <Toggle checked={off} onChange={setOff} /></Row>
      <Row label="Buttons"><Button>Browse</Button> <Button variant="primary">Next</Button> <Button disabled>Save</Button> <Button variant="ghost">Cancel</Button></Row>
      <Row label="Dropdown"><Select<string> value={sel} onChange={setSel} options={[{ value: 'always', label: 'Always' }, { value: 'ask', label: 'Ask' }, { value: 'never', label: 'Never' }]} /></Row>
      <Row label="Speed slider">
        <div style={{ width: 320 }}>
          <Slider value={speed} min={0.25} max={2} step={0.05} onChange={setSpeed} ticks={[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]} labels={[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => ({ value: v, text: String(v) }))} />
        </div>
      </Row>
      <Row label="Delay slider">
        <div style={{ width: 320 }}>
          <Slider value={delay} min={-5} max={5} step={0.05} origin={0} onChange={setDelay} ticks={[-5, -2.5, 0, 2.5, 5]} labels={[{ value: -5, text: '-5 s' }, { value: 0, text: '0 s' }, { value: 5, text: '+5 s' }]} />
        </div>
      </Row>
      <Row label="Fields"><TextField placeholder="~/Videos" /> <SearchField placeholder="Search" width={240} /> <NumberField value={10} onChange={() => {}} suffix="s" /> <ColorField value="#FFFFFF" onChange={() => {}} /></Row>
      <Row label="Menu">
        <Button onClick={(e) => openMenu([
          { label: 'Open File(s)', icon: 'file', hint: '⌘O' },
          { label: 'Open Network Stream', icon: 'streaming', hint: '⌘N' },
          { label: 'Open Recent', icon: 'recent', submenu: [{ label: 'hevc10.mkv' }, { label: 'tone.flac' }] },
          'separator',
          { label: 'Profile (Movies)', icon: 'profile', submenu: [{ label: 'Movies', checked: true }, { label: 'Shows', checked: false }, 'separator', { label: 'New', icon: 'add', iconState: 'default' }] },
          { label: 'Settings', icon: 'settings', hint: '⌘,' }
        ], e.currentTarget)}>Open menu</Button>
      </Row>
      <Row label="Icon buttons"><IconButton icon="play" label="Play" /> <IconButton icon="subtitles" label="Subtitles" pressed /> <IconButton icon="settings" label="Settings" /></Row>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 96px)', gap: 8 }}>
        {iconNames.map((n) => (
          <div key={n} style={{ display: 'grid', justifyItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-faint)' }}>
            <Icon name={n} size={22} /><span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ width: 120, color: 'var(--text)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div>
    </div>
  )
}
