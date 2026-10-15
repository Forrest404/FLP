import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { ACCENTS, type AccentId } from '@shared/theme'
import { Icon, type IconName } from './Icon'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost'; block?: boolean }

export function Button({ variant = 'default', block, className = '', ...rest }: BtnProps) {
  const cls = `ui-btn ${variant !== 'default' ? `ui-btn--${variant}` : ''} ${block ? 'ui-btn--block' : ''} ${className}`
  return <button type="button" className={cls} {...rest} />
}

type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  label: string
  size?: number
  pressed?: boolean
}

export function IconButton({ icon, label, size = 20, pressed, className = '', ...rest }: IconBtnProps) {
  return (
    <button
      type="button"
      className={`ui-iconbtn ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon name={icon} size={size} state={pressed ? 'active' : 'default'} />
    </button>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ui-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="ui-toggle__label">{checked ? 'ON' : 'OFF'}</span>
      <span className="ui-toggle__knob" />
    </button>
  )
}

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  /** Values at which to draw tick marks. */
  ticks?: number[]
  /** Labels under the track, placed at their value. */
  labels?: { value: number; text: string }[]
  /** Fill from this value instead of from min (e.g. 0 for a ±5 s delay slider). */
  origin?: number
  onChange(v: number): void
  onCommit?(v: number): void
  label?: string
}

export function Slider({ value, min, max, step = 0.01, ticks, labels, origin, onChange, onCommit, label }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100
  const from = pct(origin ?? min)
  const to = pct(value)

  const valueAt = useCallback(
    (clientX: number) => {
      const r = trackRef.current!.getBoundingClientRect()
      const raw = min + ((clientX - r.left) / r.width) * (max - min)
      const snapped = Math.round(raw / step) * step
      return Math.min(max, Math.max(min, Number(snapped.toFixed(6))))
    },
    [min, max, step]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let last = valueAt(e.clientX)
    onChange(last)
    const move = (ev: PointerEvent) => onChange((last = valueAt(ev.clientX)))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      onCommit?.(last)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0
    if (!delta) return
    e.preventDefault()
    const v = Math.min(max, Math.max(min, Number((value + delta).toFixed(6))))
    onChange(v)
    onCommit?.(v)
  }

  return (
    <div className="ui-slider">
      <div
        ref={trackRef}
        className="ui-slider__track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <div className="ui-slider__fill" style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }} />
        {ticks?.map((t) => <i key={t} className="ui-slider__tick" style={{ left: `${pct(t)}%` }} />)}
        <div className="ui-slider__thumb" style={{ left: `${to}%` }} />
      </div>
      {labels && (
        <div className="ui-slider__labels">
          {labels.map((l) => (
            <span key={l.value} style={{ left: `${pct(l.value)}%` }}>{l.text}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export interface SelectOption<T extends string | number = string> {
  value: T
  label: string
}

export function Select<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: SelectOption<T>[]
  onChange(v: T): void
  label?: string
}) {
  return (
    <div className="ui-select">
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value)
          if (opt) onChange(opt.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
      <Icon name="chevron-down" size={18} />
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: SelectOption<T>[]
  onChange(v: T): void
}) {
  return (
    <div className="ui-seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function AccentSwatches({ value, onChange }: { value: AccentId; onChange(v: AccentId): void }) {
  return (
    <div className="ui-swatches" role="group" aria-label="Accent color">
      {ACCENTS.map((a) => (
        <button key={a.id} type="button" aria-pressed={a.id === value} aria-label={a.id} title={a.id} onClick={() => onChange(a.id)}>
          <i style={{ background: a.color }} />
        </button>
      ))}
    </div>
  )
}

export function TextField({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-field ${className}`} spellCheck={false} {...rest} />
}

export function SearchField({ className = '', width, ...rest }: InputHTMLAttributes<HTMLInputElement> & { width?: number | string }) {
  return (
    <span className="ui-search" style={{ width }}>
      <Icon name="search" size={18} />
      <input className={`ui-field ui-field--search ${className}`} style={{ width: '100%' }} spellCheck={false} {...rest} />
    </span>
  )
}

export function NumberField({ value, onChange, min, max, step = 1, suffix }: {
  value: number
  onChange(v: number): void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const v = Number(draft)
    if (draft.trim() === '' || Number.isNaN(v)) return setDraft(String(value))
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
    setDraft(String(clamped))
    if (clamped !== value) onChange(clamped)
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input
        className="ui-field ui-number"
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {suffix && <span>{suffix}</span>}
    </span>
  )
}

const HEX = /^#?[0-9a-f]{6}$/i

export function ColorField({ value, onChange }: { value: string; onChange(v: string): void }) {
  // Typing keeps a local draft; only a complete #RRGGBB is saved, and blur reverts anything else.
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (v: string) => HEX.test(v) && onChange(`#${v.replace('#', '').toUpperCase()}`)
  return (
    <span className="ui-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <TextField style={{ width: 120 }} value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value)
          commit(e.target.value)
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          commit(e.currentTarget.value)
          setDraft(null)
        }} />
    </span>
  )
}

export function InfoTip({ text }: { text: ReactNode }) {
  return (
    <span className="ui-info" title={typeof text === 'string' ? text : undefined}>
      <Icon name="info" size={16} />
    </span>
  )
}

/** Vertical slider for the equalizer bands. */
export function VSlider({ value, min, max, step = 0.1, onChange, label, height = 150 }: {
  value: number
  min: number
  max: number
  step?: number
  onChange(v: number): void
  label: string
  height?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pct = ((value - min) / (max - min)) * 100
  const zero = ((0 - min) / (max - min)) * 100
  const valueAt = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const raw = max - ((clientY - r.top) / r.height) * (max - min)
    return Math.min(max, Math.max(min, Math.round(raw / step) * step))
  }
  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    onChange(valueAt(e.clientY))
    const move = (ev: PointerEvent) => onChange(valueAt(ev.clientY))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div
      ref={ref}
      className="ui-vslider"
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(0)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') onChange(Math.min(max, value + step))
        else if (e.key === 'ArrowDown') onChange(Math.max(min, value - step))
        else return
        e.preventDefault()
      }}
      title={`${label}: ${value > 0 ? '+' : ''}${value.toFixed(1)} dB (double-click to reset)`}
    >
      <div className="ui-vslider__fill" style={{ bottom: `${Math.min(pct, zero)}%`, height: `${Math.abs(pct - zero)}%` }} />
      <i className="ui-vslider__zero" style={{ bottom: `${zero}%` }} />
      <div className="ui-vslider__thumb" style={{ bottom: `${pct}%` }} />
    </div>
  )
}
