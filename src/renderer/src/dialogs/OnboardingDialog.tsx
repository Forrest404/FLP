// First-run onboarding (Figma "Onboarding"): media folder → theme & colour → basic shortcuts.
import { useState } from 'react'
import { BRAND } from '@shared/brand'
import type { AccentId, ThemeMode } from '@shared/theme'
import { AccentSwatches, Button, Segmented, TextField } from '@/components/controls'
import { Logo } from '@/components/Logo'
import { formatKey, getCommand } from '@/commands/registry'
import { keysFor } from '@/commands/keys'
import { setSetting, setUi, useSetting } from '@/state/settings'
import { ui } from '@/state/ui'

const SHORTCUTS: [string, string[]][] = [
  ['Play / Pause', ['player.playPause']],
  ['Seek Backward / Forward', ['player.backShort', 'player.forwardShort']],
  ['Previous / Next Item', ['player.previous', 'player.next']],
  ['Previous / Next Frame', ['player.frameBack', 'player.frameStep']],
  ['Cycle Subtitle Track', ['subs.cycleTrack']],
  ['Cycle Audio Track', ['audio.cycleTrack']],
  ['Toggle Fullscreen', ['window.fullscreen']],
  ['Increase / Decrease Volume', ['audio.volumeUp', 'audio.volumeDown']],
  ['Show / Hide Queue', ['ui.playlist']],
  ['Show / Hide File Browser', ['ui.leftSidebar']],
  ['Take a Snapshot', ['player.snapshot']],
  ['Record', ['player.record']]
]

function keyOf(id: string): string {
  const cmd = getCommand(id)
  const k = cmd && keysFor(cmd)[0]
  return k ? formatKey(k) : '—'
}

export function OnboardingDialog() {
  const [step, setStep] = useState(0)
  const [folder, setFolder] = useState('~/Movies')
  const theme = useSetting<ThemeMode>('general.theme') ?? 'dark'
  const accent = useSetting<AccentId>('general.accent') ?? 'green'

  const finish = async () => {
    setUi('onboarded', true)
    ui.closeDialog()
  }

  const next = async () => {
    if (step === 0 && folder.trim()) {
      const home = await window.flp.app.homeDir()
      const path = folder.trim().replace(/^~(?=\/|$)/, home)
      await window.flp.library.addRoot(path).catch(() => {})
    }
    if (step === 2) return finish()
    setStep(step + 1)
  }

  return (
    <div className="ui-backdrop">
      <div className="ui-dialog flp-onboard" role="dialog" aria-modal aria-label={`Welcome to ${BRAND.name}`}>
        {step === 0 && (
          <div className="flp-onboard__body">
            <Logo size={96} />
            <h1>Welcome to {BRAND.name}!</h1>
            <p className="flp-onboard__lead">
              {BRAND.longName} plays almost any video, music or image file, as well as DVDs, audio CDs and streams. Everything is one
              click or one search away, and you can add features with plugins.
            </p>
            <label className="flp-onboard__label">Choose a Media Folder to get started with</label>
            <div className="flp-onboard__row">
              <TextField value={folder} onChange={(e) => setFolder(e.target.value)} style={{ flex: 1, width: 'auto' }} />
              <Button onClick={async () => {
                const [dir] = await window.flp.dialog.openFiles({ folders: true, multiple: false, title: 'Choose a media folder' })
                if (dir) setFolder(dir)
              }}>Browse</Button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="flp-onboard__body">
            <h1>Select your preferred theme and color.</h1>
            <div className="flp-onboard__preview" data-theme={theme === 'system' ? undefined : theme}>
              <div className="flp-onboard__mock">
                <span /><span /><i />
              </div>
            </div>
            <Segmented value={theme} onChange={(v) => setSetting('general.theme', v)}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
            <AccentSwatches value={accent} onChange={(v) => setSetting('general.accent', v)} />
          </div>
        )}
        {step === 2 && (
          <div className="flp-onboard__body flp-onboard__body--keys">
            <h1>Learn the basic keyboard shortcuts.</h1>
            <p className="flp-onboard__lead">Find the full list in the menu.</p>
            <div className="flp-onboard__keys">
              {SHORTCUTS.map(([label, ids]) => (
                <div key={label} className="flp-onboard__key">
                  <span>{label}</span>
                  <span>{ids.map((id, i) => (
                    <span key={id}>{i > 0 && <em> / </em>}<kbd>{keyOf(id)}</kbd></span>
                  ))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flp-onboard__foot">
          {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <Button variant="ghost" onClick={finish}>Skip</Button>}
          <Button variant="primary" onClick={next}>{step === 2 ? 'Finish' : 'Next'}</Button>
        </div>
      </div>
    </div>
  )
}
