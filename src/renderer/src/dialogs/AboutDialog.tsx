import { BRAND } from '@shared/brand'
import { Dialog } from '@/components/Dialog'
import { Logo } from '@/components/Logo'
import { ui } from '@/state/ui'

export function AboutDialog() {
  return (
    <Dialog title={`About ${BRAND.name}`} width={460} onClose={ui.closeDialog}>
      <div className="flp-about">
        <Logo size={72} />
        <h2>{BRAND.name}</h2>
        <p>{BRAND.longName} · version 0.1.0</p>
        <p className="flp-muted">Plays almost anything, thanks to mpv and FFmpeg. Made by Forrest Labs.</p>
      </div>
    </Dialog>
  )
}
