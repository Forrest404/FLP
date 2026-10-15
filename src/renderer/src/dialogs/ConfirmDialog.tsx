// "Are you sure?" for destructive actions; opened with confirmAction() from @/state/ui.
import { Button } from '@/components/controls'
import { Dialog } from '@/components/Dialog'
import { useUi } from '@/state/ui'

export function ConfirmDialog() {
  const req = useUi((s) => s.confirm)
  if (!req) return null
  const answer = (ok: boolean) => {
    useUi.setState({ confirm: null })
    req.resolve(ok)
  }
  return (
    <Dialog title={req.title} width={420} onClose={() => answer(false)} footer={
      <>
        <span />
        <span style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => answer(false)}>Cancel</Button>
          <Button variant="primary" autoFocus onClick={() => answer(true)}>{req.confirmLabel ?? 'OK'}</Button>
        </span>
      </>
    }>
      {req.message && <div className="flp-form"><p className="flp-muted" style={{ margin: 0, lineHeight: 1.5 }}>{req.message}</p></div>}
    </Dialog>
  )
}
