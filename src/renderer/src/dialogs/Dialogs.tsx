import { Dialog } from '@/components/Dialog'
import { ui, useUi } from '@/state/ui'
import { AboutDialog } from './AboutDialog'
import { CaptureDialog } from './CaptureDialog'
import { ConvertDialog } from './ConvertDialog'
import { DiscDialog } from './DiscDialog'
import { MediaInfoDialog } from './MediaInfoDialog'
import { CustomizeDialog } from './CustomizeDialog'
import { ProfilesDialog } from './ProfilesDialog'
import { ShortcutsDialog } from './ShortcutsDialog'
import { SettingsDialog } from '@/settings/SettingsDialog'
import { AddSubtitlesDialog } from './AddSubtitlesDialog'
import { NetworkDialog } from './NetworkDialog'
import { NewPlaylistDialog } from './NewPlaylistDialog'
import { OnboardingDialog } from './OnboardingDialog'

export function Dialogs() {
  const dialog = useUi((s) => s.dialog)
  switch (dialog) {
    case null:
      return null
    case 'settings':
      return <SettingsDialog />
    case 'shortcuts':
      return <ShortcutsDialog />
    case 'profiles':
      return <ProfilesDialog />
    case 'customize':
      return <CustomizeDialog />
    case 'disc':
      return <DiscDialog />
    case 'capture':
      return <CaptureDialog />
    case 'convert':
      return <ConvertDialog />
    case 'mediaInfo':
      return <MediaInfoDialog />
    case 'about':
      return <AboutDialog />
    case 'network':
      return <NetworkDialog />
    case 'newPlaylist':
      return <NewPlaylistDialog />
    case 'addSubtitles':
      return <AddSubtitlesDialog />
    case 'onboarding':
      return <OnboardingDialog />
    default:
      return (
        <Dialog title={dialog} width={520} onClose={ui.closeDialog}>
          <p style={{ padding: 24 }} className="flp-muted">This dialog is being built.</p>
        </Dialog>
      )
  }
}
