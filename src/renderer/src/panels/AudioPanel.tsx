import { useEffect, useState } from 'react'
import { EQ_BANDS, EQ_PRESETS, FX_DEFAULTS } from '@shared/audio-effects'
import { Select, VSlider } from '@/components/controls'
import { player, usePlayer } from '@/state/player'
import { trackLabel } from '@/state/playback'
import { setSetting } from '@/state/settings'
import { FxSelect, FxSlider, FxToggle, HeaderToggle, fixed, signed, useFx } from './fx'
import { PresetBar } from './Presets'
import { Section } from './Section'

const AUDIO_FX_KEYS = [
  ...Object.keys(FX_DEFAULTS), 'audio.eq', 'audio.compressor', 'audio.spatial', 'audio.spatialMode', 'audio.stereoWiden', 'audio.pitch',
  'audio.normalize', 'audio.normalizeTarget', 'audio.nightMode', 'audio.karaoke', 'audio.chorus'
]
const AUDIO_DEFAULTS: Record<string, unknown> = {
  ...FX_DEFAULTS, 'audio.eq': false, 'audio.compressor': false, 'audio.spatial': false, 'audio.spatialMode': 'headphones', 'audio.stereoWiden': false,
  'audio.pitch': 0, 'audio.normalize': false, 'audio.normalizeTarget': -16, 'audio.nightMode': false, 'audio.karaoke': false, 'audio.chorus': false
}

const freq = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f))

function Equalizer() {
  const [bands, setBands] = useFx<number[]>('fx.eqBands', EQ_PRESETS.flat.bands)
  const [preset, setPreset] = useFx<string>('audio.eqPreset', 'flat')
  const matching = Object.entries(EQ_PRESETS).find(([, p]) => p.bands.every((b, i) => b === bands[i]))?.[0]
  return (
    <>
      <Select<string>
        label="Equalizer preset"
        value={matching ?? 'custom'}
        options={[...Object.entries(EQ_PRESETS).map(([value, p]) => ({ value, label: p.label })), ...(!matching ? [{ value: 'custom', label: 'Custom' }] : [])]}
        onChange={(v) => {
          if (!EQ_PRESETS[v]) return
          setPreset(v)
          setBands(EQ_PRESETS[v].bands)
          setSetting('audio.eq', true)
        }}
      />
      <div className="flp-eq">
        {EQ_BANDS.map((f, i) => (
          <div key={f} className="flp-eq__band">
            <span className="flp-eq__val">{bands[i] > 0 ? '+' : ''}{Math.round(bands[i] ?? 0)}</span>
            <VSlider value={bands[i] ?? 0} min={-20} max={20} step={0.5} label={`${freq(f)} Hz`} onChange={(v) => {
              const next = [...bands]
              next[i] = v
              setBands(next)
              if (preset !== 'custom') setPreset('custom')
            }} />
            <span className="flp-eq__freq">{freq(f)}</span>
          </div>
        ))}
      </div>
      <FxSlider k="fx.eqPreamp" label="Preamp" min={-20} max={20} step={0.5} origin={0} ticks={[0]} format={fixed(1, ' dB')} />
    </>
  )
}

function TracksAndOutput() {
  const tracks = usePlayer((s) => s.tracks).filter((t) => t.type === 'audio')
  const [devices, setDevices] = useState<{ name: string; description: string }[]>([])
  const [device, setDevice] = useFx<string>('audio.device', 'auto')
  useEffect(() => {
    player.get('audio-device-list').then((d) => setDevices((d as { name: string; description: string }[]) ?? []))
  }, [])
  const selected = tracks.find((t) => t.selected)?.id ?? 'no'
  return (
    <>
      <div className="flp-fx-row">
        <div className="flp-fx-row__label"><span>Audio track</span></div>
        <Select<string | number> label="Audio track" value={selected} onChange={(v) => void player.set('aid', v)}
          options={[{ value: 'no', label: 'Off' }, ...tracks.map((t) => ({ value: t.id, label: trackLabel(t) }))]} />
      </div>
      <div className="flp-fx-row">
        <div className="flp-fx-row__label"><span>Output device</span></div>
        <Select<string> label="Output device" value={device} onChange={setDevice}
          options={devices.length ? devices.map((d) => ({ value: d.name, label: d.name === 'auto' ? 'System default' : d.description })) : [{ value: 'auto', label: 'System default' }]} />
      </div>
      <FxSlider k="audio.delay" label="Audio delay" min={-2} max={2} step={0.01} origin={0} ticks={[0]} format={(v) => `${Math.round(v * 1000)} ms`} />
    </>
  )
}

/** Figma "Audio - Equalizer / Compressor / Spatializer / Stereo Widener". */
export function AudioPanel() {
  return (
    <>
      <PresetBar kind="audio" keys={AUDIO_FX_KEYS} defaults={AUDIO_DEFAULTS} />
      <Section title="Equalizer" aside={<HeaderToggle k="audio.eq" />}>
        <Equalizer />
      </Section>
      <Section title="Compressor" defaultOpen={false} aside={<HeaderToggle k="audio.compressor" />}>
        <FxSlider k="fx.compThreshold" label="Threshold" min={-60} max={0} step={1} format={fixed(0, ' dB')} />
        <FxSlider k="fx.compRatio" label="Ratio" min={1} max={20} step={0.5} format={(v) => `${v}:1`} />
        <FxSlider k="fx.compAttack" label="Attack" min={1} max={200} step={1} format={fixed(0, ' ms')} />
        <FxSlider k="fx.compRelease" label="Release" min={10} max={2000} step={10} format={fixed(0, ' ms')} />
        <FxSlider k="fx.compKnee" label="Knee" min={1} max={8} step={0.1} format={fixed(1, ' dB')} />
        <FxSlider k="fx.compMakeup" label="Makeup gain" min={0} max={24} step={0.5} format={fixed(1, ' dB')} />
      </Section>
      <Section title="Spatializer" defaultOpen={false} aside={<HeaderToggle k="audio.spatial" />}>
        <FxSelect k="audio.spatialMode" label="Mode" fallback="headphones" options={[{ value: 'headphones', label: 'Headphone virtualization' }, { value: 'crossfeed', label: 'Crossfeed (gentle)' }]} />
        <FxSlider k="fx.spatialStrength" label="Strength" min={0} max={1} step={0.05} format={fixed(2)} />
        <FxSlider k="fx.spatialRange" label="Room size" min={0} max={1} step={0.05} format={fixed(2)} />
      </Section>
      <Section title="Stereo Widener" defaultOpen={false} aside={<HeaderToggle k="audio.stereoWiden" />}>
        <FxSlider k="fx.widenDelay" label="Delay" min={1} max={100} step={1} format={fixed(0, ' ms')} />
        <FxSlider k="fx.widenFeedback" label="Feedback" min={0} max={0.9} step={0.05} format={fixed(2)} />
        <FxSlider k="fx.widenCrossfeed" label="Crossfeed" min={0} max={0.8} step={0.05} format={fixed(2)} />
        <FxSlider k="fx.widenDry" label="Dry mix" min={0} max={1} step={0.05} format={fixed(2)} />
      </Section>
      <Section title="More Effects" defaultOpen={false}>
        <FxSlider k="audio.pitch" label="Pitch" min={-12} max={12} step={0.5} origin={0} ticks={[0]} format={(v) => `${signed(v)} st`} />
        <FxToggle k="audio.normalize" label="Normalize loudness" />
        <FxToggle k="audio.nightMode" label="Night mode" />
        <FxToggle k="audio.karaoke" label="Karaoke (remove vocals)" />
        <FxToggle k="audio.chorus" label="Chorus" />
      </Section>
      <Section title="Track & Output" defaultOpen={false}>
        <TracksAndOutput />
      </Section>
      <Section title="Audio Visualizer" defaultOpen={false}>
        <FxSelect k="audio.visualizer" label="Shown for music without cover art" fallback="waveform"
          options={[{ value: 'none', label: 'None' }, { value: 'waveform', label: 'Waveform' }, { value: 'spectrum', label: 'Spectrum' }, { value: 'spectrometer', label: 'Spectrometer' }]} />
      </Section>
    </>
  )
}
