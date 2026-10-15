// Small building blocks for the effects panels, bound directly to settings.
import { Select, Slider, Toggle, type SelectOption, type SliderProps } from '@/components/controls'
import { setSetting, useSetting } from '@/state/settings'

export function useFx<T>(key: string, fallback: T): [T, (v: T) => void] {
  const v = useSetting<T>(key)
  return [v ?? fallback, (next: T) => setSetting(key, next)]
}

export function FxSlider({ k, label, fallback = 0, format, ...rest }: { k: string; label: string; fallback?: number; format?(v: number): string } & Omit<SliderProps, 'value' | 'onChange'>) {
  const [v, set] = useFx<number>(k, fallback)
  return (
    <div className="flp-fx-row">
      <div className="flp-fx-row__label">
        <span>{label}</span>
        <span className="flp-fx-row__value">{format ? format(v) : v}</span>
      </div>
      <Slider value={v} onChange={set} label={label} {...rest} />
    </div>
  )
}

export function FxToggle({ k, label }: { k: string; label: string }) {
  const [v, set] = useFx<boolean>(k, false)
  return (
    <div className="flp-fx-inline">
      <span>{label}</span>
      <Toggle checked={!!v} onChange={set} label={label} />
    </div>
  )
}

export function FxSelect<T extends string | number>({ k, label, options, fallback }: { k: string; label: string; options: SelectOption<T>[]; fallback: T }) {
  const [v, set] = useFx<T>(k, fallback)
  return (
    <div className="flp-fx-row">
      <div className="flp-fx-row__label"><span>{label}</span></div>
      <Select<T> value={v} onChange={set} options={options} label={label} />
    </div>
  )
}

/** The on/off switch shown in a section header. */
export function HeaderToggle({ k }: { k: string }) {
  const [v, set] = useFx<boolean>(k, false)
  return <Toggle checked={!!v} onChange={set} />
}

export const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`
export const fixed = (d: number, unit = '') => (v: number) => `${v.toFixed(d)}${unit}`
