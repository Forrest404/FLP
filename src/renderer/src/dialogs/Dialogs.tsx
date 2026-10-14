import { Dialog } from '@/components/Dialog'
import { ui, useUi } from '@/state/ui'
import { AboutDialog } from './AboutDialog'
import { NetworkDialog } from './NetworkDialog'

export function Dialogs() {
  const dialog = useUi((s) => s.dialog)
  switch (dialog) {
    case null:
      return null
    case 'about':
      return <AboutDialog />
    case 'network':
      return <NetworkDialog />
    default:
      return (
        <Dialog title={dialog} width={520} onClose={ui.closeDialog}>
          <p style={{ padding: 24 }} className="flp-muted">This dialog is being built.</p>
        </Dialog>
      )
  }
}
