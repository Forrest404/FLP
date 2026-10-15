import { TONE_MAPPINGS, VFX_DEFAULTS } from '@shared/video-effects'
import { settingByKey } from '@shared/settings-schema'
import { Button } from '@/components/controls'
import { runCommand } from '@/commands/registry'
import { useSetting } from '@/state/settings'
import { withCustomOptions } from '@/state/ratios'
import { FxSelect, FxSlider, FxToggle, fixed, signed, useFx } from './fx'
import { PresetBar } from './Presets'
import { Section } from './Section'

const EQ_TICKS = [-100, -50, 0, 50, 100]
const optionsOf = (key: string) => {
  const def = settingByKey.get(key)
  return def && 'options' in def && Array.isArray(def.options) ? (def.options as { value: string; label: string }[]) : []
}

/** Figma "Video - Essential / Crop / Colors" + "HDR Options". */
export function VideoPanel() {
  const [rotate, setRotate] = useFx<number>('vfx.rotate', 0)
  const customAspects = useSetting<string>('video.customAspects')
  const customCrops = useSetting<string>('video.customCrops')
  return (
    <>
      <PresetBar kind="video" keys={Object.keys(VFX_DEFAULTS)} defaults={VFX_DEFAULTS} />
      <Section title="Essential">
        <FxSlider k="vfx.hue" label="Hue" min={-100} max={100} step={1} origin={0} format={signed} />
        <FxSlider k="vfx.brightness" label="Brightness" min={-100} max={100} step={1} origin={0} format={signed} />
        <FxSlider k="vfx.contrast" label="Contrast" min={-100} max={100} step={1} origin={0} format={signed} />
        <FxSlider k="vfx.saturation" label="Saturation" min={-100} max={100} step={1} origin={0} ticks={[50]} format={signed} />
        <FxSlider k="vfx.gamma" label="Gamma" min={-100} max={100} step={1} origin={0} ticks={EQ_TICKS} format={signed} />
        <FxSlider k="vfx.sharpen" label="Sharpen Sigma" min={0} max={1} step={0.05} ticks={[0.25, 0.5, 0.75]} format={fixed(2)} />
        <FxSlider k="vfx.deband" label="Banding Removal Radius" min={0} max={64} step={1} ticks={[8, 16, 24, 32, 40, 48, 56]} format={(v) => (v ? String(v) : 'Off')} />
        <FxSlider k="vfx.grain" label="Film Grain Variance" min={0} max={100} step={1} ticks={[10, 20, 30, 40, 50, 60, 70, 80, 90]} format={(v) => (v ? String(v) : 'Off')} />
      </Section>
      <Section title="Crop & Framing" defaultOpen={false}>
        <FxSelect k="video.aspect" label="Aspect ratio" options={withCustomOptions(optionsOf('video.aspect'), customAspects)} fallback="auto" />
        <FxSelect k="video.crop" label="Crop to" options={withCustomOptions(optionsOf('video.crop'), customCrops)} fallback="none" />
        <FxSlider k="vfx.cropTop" label="Trim top" min={0} max={25} step={0.5} format={fixed(1, '%')} />
        <FxSlider k="vfx.cropBottom" label="Trim bottom" min={0} max={25} step={0.5} format={fixed(1, '%')} />
        <FxSlider k="vfx.cropLeft" label="Trim left" min={0} max={25} step={0.5} format={fixed(1, '%')} />
        <FxSlider k="vfx.cropRight" label="Trim right" min={0} max={25} step={0.5} format={fixed(1, '%')} />
        <FxSlider k="vfx.zoom" label="Zoom" min={-2} max={2} step={0.05} origin={0} ticks={[-1, 0, 1]} format={(v) => `${Math.round(2 ** v * 100)}%`} />
        <FxSlider k="vfx.panX" label="Move left / right" min={-1} max={1} step={0.01} origin={0} format={fixed(2)} />
        <FxSlider k="vfx.panY" label="Move up / down" min={-1} max={1} step={0.01} origin={0} format={fixed(2)} />
        <div className="flp-fx-row">
          <div className="flp-fx-row__label"><span>Rotate</span></div>
          <div className="flp-chips">
            {[0, 90, 180, 270].map((d) => <button key={d} type="button" aria-pressed={rotate === d} onClick={() => setRotate(d)}>{d}°</button>)}
          </div>
        </div>
        <FxToggle k="vfx.flipH" label="Flip horizontally" />
        <FxToggle k="vfx.flipV" label="Flip vertically" />
      </Section>
      <Section title="Colors" defaultOpen={false}>
        <FxSlider k="vfx.temperature" label="Color temperature" min={2000} max={12000} step={100} origin={6500} ticks={[6500]} format={(v) => `${v} K`} />
        <FxToggle k="vfx.grayscale" label="Black & white" />
        <FxToggle k="vfx.sepia" label="Sepia" />
        <FxToggle k="vfx.negative" label="Negative" />
        <FxToggle k="vfx.posterize" label="Posterize" />
        <FxToggle k="vfx.vignette" label="Vignette" />
      </Section>
      <Section title="HDR" defaultOpen={false}>
        <FxSelect k="hdr.toneMapping" label="Tone mapping" options={TONE_MAPPINGS} fallback="auto" />
        <FxSlider k="hdr.targetPeak" label="Display brightness (nits)" min={0} max={1600} step={10} ticks={[100, 203, 400, 1000]} format={(v) => (v ? `${v}` : 'Auto')} />
        <FxToggle k="hdr.computePeak" label="Measure brightness per scene" />
        <FxSelect k="hdr.gamutMapping" label="Gamut mapping" fallback="auto" options={[
          { value: 'auto', label: 'Automatic' }, { value: 'perceptual', label: 'Perceptual' }, { value: 'relative', label: 'Relative' }, { value: 'saturation', label: 'Saturation' }, { value: 'clip', label: 'Clip' }]} />
      </Section>
      <Section title="Deinterlacing" defaultOpen={false}>
        <FxSelect k="video.deinterlace" label="Deinterlacing" options={optionsOf('video.deinterlace')} fallback="auto" />
        <FxSelect k="video.deinterlaceMethod" label="Method" options={optionsOf('video.deinterlaceMethod')} fallback="auto" />
      </Section>
      <Button block onClick={() => void runCommand('video.resetPicture')}>Reset all video effects</Button>
    </>
  )
}
