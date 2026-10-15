import { execFile } from 'node:child_process'
import { app, type BrowserWindow } from 'electron'
import type { PlayerBridge } from './player'

// Dev-only: FLP_SNAPSHOT=/tmp/x.png captures the real window (including the native video layer)
// after FLP_SNAPSHOT_DELAY ms, prints playback state, then quits. Used for automated checks.
export function scheduleSnapshot(win: BrowserWindow, player: PlayerBridge): void {
  const out = process.env.FLP_SNAPSHOT
  if (!out) return
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.log(`[renderer:${e.level}] ${e.message}`)
  })
  const delay = Number(process.env.FLP_SNAPSHOT_DELAY ?? 4000)
  // FLP_EVAL runs in the renderer shortly before the capture, e.g. "__flp.runCommand('ui.palette')".
  const script = process.env.FLP_EVAL
  const evalAt = Number(process.env.FLP_EVAL_AT ?? Math.max(0, delay - 1200))
  if (script) setTimeout(() => void win.webContents.executeJavaScript(script).catch((e) => console.error('[eval]', e)), evalAt)
  setTimeout(async () => {
    const id = win.getMediaSourceId().split(':')[1]
    const props = process.env.FLP_SNAPSHOT_PROPS?.split(',') ?? ['time-pos', 'duration', 'pause', 'hwdec-current', 'video-codec', 'track-list/count']
    const values = await Promise.all(props.map((p) => player.get(p)))
    const state = props.map((p, i) => `${p}=${JSON.stringify(values[i])}`).join(' ')
    console.log(`[snapshot] ${state}`)
    execFile('screencapture', ['-x', '-o', `-l${id}`, out], (err) => {
      if (err) console.error('[snapshot] failed', err.message)
      else console.log(`[snapshot] saved ${out}`)
      if (process.env.FLP_SNAPSHOT_QUIT !== '0') app.quit()
    })
  }, delay)
}
