// The Settings window (Figma "Settings - …"): searchable, every page generated from the schema.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PAGES, SETTINGS, type Option, type PageId, type SettingDef } from '@shared/settings-schema'
import { EQ_PRESETS } from '@shared/audio-effects'
import type { AccentId } from '@shared/theme'
import { AccentSwatches, Button, ColorField, IconButton, InfoTip, NumberField, SearchField, Segmented, Select, Slider, TextField, Toggle } from '@/components/controls'
import { useEscapeToClose } from '@/components/Dialog'
import { Icon, type IconName } from '@/components/Icon'
import { runCommand } from '@/commands/registry'
import { player } from '@/state/player'
import { setSetting, useSetting } from '@/state/settings'
import { ui, useUi } from '@/state/ui'
import { withCustomOptions } from '@/state/ratios'
import { CUSTOM_ROWS } from './custom'

const LANGUAGES: Option<string>[] = [
  { value: 'system', label: 'System language' },
  ...['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'pl', 'ru', 'uk', 'tr', 'ar', 'he', 'hi', 'ja', 'ko', 'zh'].map((code) => ({
    value: code,
    label: new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  }))
]

/** Options that depend on the computer (audio devices, displays…). */
function useDynamicOptions(kind: string | null): Option[] {
  const [opts, setOpts] = useState<Option[]>([])
  useEffect(() => {
    if (kind === 'audio-devices') {
      player.get('audio-device-list').then((list) =>
        setOpts(((list as { name: string; description: string }[]) ?? []).map((d) => ({ value: d.name, label: d.name === 'auto' ? 'System default' : d.description })))
      )
    } else if (kind === 'displays') {
      window.flp.app.displays().then((ds) => setOpts([{ value: 'current', label: 'Current screen' }, ...ds.map((d) => ({ value: String(d.id), label: d.label }))]))
    } else if (kind === 'optical-drives') {
      window.flp.app.opticalDrives().then((ds) => setOpts([{ value: '', label: ds.length ? 'First found' : 'No disc drive found' }, ...ds.map((d) => ({ value: d, label: d.split('/').pop() ?? d }))]))
    } else if (kind === 'languages') setOpts(LANGUAGES)
    else if (kind === 'eq-presets') setOpts(Object.entries(EQ_PRESETS).map(([value, p]) => ({ value, label: p.label })))
  }, [kind])
  return opts
}

export function Control({ def }: { def: SettingDef }) {
  // Unsaved settings (e.g. a plugin's new options) show their default.
  const value = useSetting<unknown>(def.key) ?? ('default' in def ? def.default : undefined)
  const set = (v: unknown) => setSetting(def.key, v)
  const dynamic = 'options' in def && !Array.isArray(def.options) ? def.options.dynamic : null
  const dynOpts = useDynamicOptions(dynamic)
  // Aspect / crop also offer the user's custom ratios.
  const customRatios = useSetting<string>(def.key === 'video.aspect' ? 'video.customAspects' : def.key === 'video.crop' ? 'video.customCrops' : '')
  switch (def.type) {
    case 'toggle':
      return <Toggle checked={!!value} onChange={set} label={def.label} />
    case 'select': {
      let options = (Array.isArray(def.options) ? def.options : dynOpts) as Option[]
      if (customRatios) options = withCustomOptions(options as { value: string; label: string }[], customRatios)
      const v = (value ?? def.default) as string | number
      const withCurrent = options.some((o) => String(o.value) === String(v)) ? options : [...options, { value: v, label: String(v) || 'Default' }]
      return <Select<string | number> value={v} options={withCurrent} onChange={set} label={def.label} />
    }
    case 'segmented':
      return <Segmented value={String(value ?? def.default)} options={def.options} onChange={set} />
    case 'accent':
      return <AccentSwatches value={(value ?? def.default) as AccentId} onChange={set} />
    case 'slider':
      return (
        <div className="flp-set__slider">
          <Slider value={Number(value ?? def.default)} min={def.min} max={def.max} step={def.step} ticks={def.ticks} labels={def.labels} origin={def.origin} onChange={set} label={def.label} />
        </div>
      )
    case 'number':
      return <NumberField value={Number(value ?? def.default)} min={def.min} max={def.max} step={def.step} suffix={def.suffix} onChange={set} />
    case 'text':
      return <DeferredText value={String(value ?? '')} placeholder={def.placeholder} secret={def.secret} onCommit={set} />
    case 'color':
      return <ColorField value={String(value ?? def.default)} onChange={set} />
    case 'path':
      return (
        <div className="flp-set__path">
          <DeferredText value={String(value ?? '')} placeholder={def.placeholder ?? (def.directory ? 'Choose a folder' : 'Choose a file')} onCommit={set} />
          <Button onClick={async () => {
            const [p] = await window.flp.dialog.openFiles({ folders: def.directory, multiple: false, title: def.label, filters: def.filters })
            if (p) set(p)
          }}>Browse</Button>
        </div>
      )
    case 'action':
      return <Button onClick={() => void runCommand(def.command)}>{def.button}</Button>
    case 'custom': {
      const Custom = CUSTOM_ROWS[def.component]
      return Custom ? <Custom /> : null
    }
  }
}

/** Text that saves on blur / Enter, so typing doesn't write the settings file on every key. */
function DeferredText({ value, placeholder, secret, onCommit }: { value: string; placeholder?: string; secret?: boolean; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <TextField
      type={secret ? 'password' : 'text'}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function Row({ def, highlight }: { def: SettingDef; highlight: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlight])
  const wide = def.type === 'custom'
  return (
    <div ref={ref} className={`flp-set__row ${wide ? 'flp-set__row--wide' : ''}`} data-highlight={highlight}>
      <div className="flp-set__label">
        {def.label}
        {def.info && <InfoTip text={def.info} />}
      </div>
      <div className="flp-set__control"><Control def={def} /></div>
    </div>
  )
}

function Page({ page, highlight }: { page: PageId; highlight: string | null }) {
  const rows = SETTINGS.filter((s) => s.page === page)
  const hasAdvanced = rows.some((r) => r.advanced)
  const [advanced, setAdvanced] = useState(() => rows.some((r) => r.advanced && r.key === highlight))
  useEffect(() => setAdvanced(rows.some((r) => r.advanced && r.key === highlight)), [page, highlight])
  const sections = [...new Set(rows.map((r) => r.section))]
  return (
    <>
      {sections.map((section) => {
        const visible = rows.filter((r) => r.section === section && (!r.advanced || advanced))
        if (!visible.length) return null
        return (
          <section key={section} className="flp-set__section">
            <h3>{section}</h3>
            {visible.map((def) => <Row key={def.key} def={def} highlight={def.key === highlight} />)}
          </section>
        )
      })}
      {hasAdvanced && (
        <button type="button" className="flp-set__advanced" onClick={() => setAdvanced(!advanced)}>
          {advanced ? 'Hide Advanced Options' : 'Advanced Options'}
          <Icon name={advanced ? 'chevron-up' : 'chevron-right'} size={18} />
        </button>
      )}
    </>
  )
}

function SearchResults({ query }: { query: string }) {
  const q = query.toLowerCase()
  const hits = SETTINGS.filter((s) => [s.label, s.section, s.info ?? '', ...(s.keywords ?? [])].some((t) => t.toLowerCase().includes(q)))
  if (!hits.length) return <p className="flp-muted" style={{ padding: 8 }}>No settings match “{query}”.</p>
  const pages = [...new Set(hits.map((h) => h.page))]
  return (
    <>
      {pages.map((pid) => {
        const page = PAGES.find((p) => p.id === pid)!
        return (
          <section key={pid} className="flp-set__section">
            <h3>{page.nav}</h3>
            {hits.filter((h) => h.page === pid).map((def) => <Row key={def.key} def={def} highlight={false} />)}
          </section>
        )
      })}
    </>
  )
}

export function SettingsDialog() {
  const page = useUi((s) => s.settingsPage) as PageId
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState<string | null>(null)
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]

  useEffect(() => {
    const onHighlight = (e: Event) => {
      setQuery('')
      setHighlight((e as CustomEvent<string>).detail)
      setTimeout(() => setHighlight(null), 2500)
    }
    window.addEventListener('flp:highlight-setting', onHighlight)
    return () => window.removeEventListener('flp:highlight-setting', onHighlight)
  }, [])

  const backdrop = useRef<HTMLDivElement>(null)
  useEscapeToClose(backdrop, ui.closeDialog)

  const groups = useMemo(() => ['App', 'Media', 'System'] as const, [])
  return (
    <div ref={backdrop} className="ui-backdrop" onMouseDown={(e) => e.target === e.currentTarget && ui.closeDialog()}>
      <div className="flp-settings" role="dialog" aria-modal aria-label="Settings">
        <aside className="flp-settings__side">
          <SearchField placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} width="100%" autoFocus />
          <nav className="flp-settings__nav">
            {groups.map((g) => (
              <Group key={g} label={g}>
                {PAGES.filter((p) => p.group === g).map((p) => (
                  <button key={p.id} type="button" aria-current={!query && p.id === page} onClick={() => {
                    setQuery('')
                    ui.set({ settingsPage: p.id })
                  }}>
                    <Icon name={p.icon as IconName} size={20} state={!query && p.id === page ? 'active' : 'default'} />
                    {p.nav}
                  </button>
                ))}
              </Group>
            ))}
          </nav>
        </aside>
        <div className="flp-settings__main">
          <header className="flp-settings__head">
            <span>{query ? 'Search results' : current.title}</span>
            <IconButton icon="close" label="Close settings" onClick={ui.closeDialog} />
          </header>
          <div className="flp-settings__body">
            {query ? <SearchResults query={query} /> : <Page key={page} page={page} highlight={highlight} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flp-settings__group">
      <div className="flp-settings__grouplabel">{label}</div>
      {children}
    </div>
  )
}
