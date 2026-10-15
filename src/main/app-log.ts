// Optional log file (Settings → General → Save a log): mpv's messages at the chosen level.
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export const defaultLogFile = () => join(app.getPath('logs'), 'flp.log')

let stream: WriteStream | null = null
let streamPath = ''

/** Opens (or closes, with path null) the log file. A leading ~ means the home folder. */
export function setLogFile(path: string | null): void {
  const target = path ? path.replace(/^~(?=$|\/)/, homedir()) : ''
  if (target === streamPath) return
  stream?.end()
  stream = null
  streamPath = target
  if (!target) return
  try {
    mkdirSync(dirname(target), { recursive: true })
    stream = createWriteStream(target, { flags: 'a' })
    stream.on('error', (err) => {
      console.warn('[log]', err.message)
      stream = null
      streamPath = '' // so turning it on again (same path) retries
    })
    writeLog('flp', 'info', `${app.getName()} ${app.getVersion()} started`)
  } catch (err) {
    console.warn('[log]', (err as Error).message)
    stream = null
  }
}

export function writeLog(prefix: string, level: string, text: string): void {
  stream?.write(`${new Date().toISOString()} [${level}] ${prefix}: ${text}\n`)
}
