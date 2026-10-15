// Playback helpers used by commands, the UI and plugins.
import { getSetting } from './settings'
import { player, usePlayer } from './player'
import { showOsd, ui } from './ui'

export async function openPaths(paths: string[], opts: { append?: boolean; play?: boolean } = {}) {
  if (!paths.length) return
  const append = opts.append ?? (getSetting<boolean>('library.enqueue') && !usePlayer.getState().idle)
  for (let i = 0; i < paths.length; i++) {
    const mode = append || i > 0 ? 'append-play' : 'replace'
    await player.command('loadfile', paths[i], mode)
  }
  if (opts.play !== false && getSetting<boolean>('playback.autoplay') !== false) await player.set('pause', false)
  ui.set({ view: 'player' })
}

export async function openUrl(url: string) {
  await openPaths([url.trim()])
}

export function fmtTime(sec: number, forceHours = false): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h || forceHours ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `00:${mm}:${ss}`
}

export async function seekBy(seconds: number) {
  if (usePlayer.getState().idle) return
  // mpv refuses seeks while a file is still opening; nothing to report then.
  if ((await player.command('seek', seconds, 'relative+exact').then(() => true, () => false)) === false) return
  const { time, duration } = usePlayer.getState()
  // Live streams have no duration; don't clamp to it.
  const to = Math.max(0, time + seconds)
  showOsd(`${seconds > 0 ? '+' : ''}${seconds} s  ·  ${fmtTime(duration > 0 ? Math.min(duration, to) : to)}`)
}

/** mpv's playlist-shuffle keeps the current entry playing but can move it anywhere; put it first so the whole
 *  shuffled queue follows it. playlist-unshuffle still restores the original order afterwards. */
export async function shuffleQueue() {
  await player.command('playlist-shuffle')
  const pos = Number(await player.get('playlist-pos'))
  if (pos > 0) await player.command('playlist-move', pos, 0)
}

export async function seekTo(seconds: number) {
  await player.command('seek', seconds, getSetting<boolean>('playback.preciseSeek') ? 'absolute+exact' : 'absolute+keyframes')
}

export async function setVolume(v: number) {
  const max = getSetting<number>('audio.maxVolume') ?? 130
  const vol = Math.round(Math.min(max, Math.max(0, v)))
  await player.set('volume', vol)
  if (usePlayer.getState().muted) await player.set('mute', false)
  showOsd(`Volume ${vol}%`)
}

export async function changeVolume(delta: number) {
  await setVolume(usePlayer.getState().volume + delta)
}

export async function setSpeed(speed: number) {
  const s = Number(Math.min(4, Math.max(0.25, speed)).toFixed(2))
  await player.set('speed', s)
  showOsd(`Speed ${s}×`)
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]

export function nextSpeed(dir: 1 | -1): number {
  const cur = usePlayer.getState().speed
  if (dir > 0) return SPEEDS.find((s) => s > cur + 0.001) ?? 4
  return [...SPEEDS].reverse().find((s) => s < cur - 0.001) ?? 0.25
}

export function trackLabel(t: { id: number; title?: string; lang?: string; codec?: string; channels?: string }): string {
  const parts = [t.title, t.lang && langName(t.lang)].filter(Boolean)
  return parts.length ? parts.join(' · ') : `Track ${t.id}${t.codec ? ` (${t.codec})` : ''}`
}

const langNames = new Intl.DisplayNames(['en'], { type: 'language' })
export function langName(code: string): string {
  try {
    return langNames.of(code.length === 3 ? ({ eng: 'en', fra: 'fr', fre: 'fr', ger: 'de', deu: 'de', spa: 'es', ita: 'it', jpn: 'ja', chi: 'zh', zho: 'zh', kor: 'ko', rus: 'ru', por: 'pt', ara: 'ar', hin: 'hi' } as Record<string, string>)[code] ?? code : code) ?? code
  } catch {
    return code
  }
}

export function baseName(path: string | null): string {
  if (!path) return ''
  try {
    if (/^[a-z]+:\/\//i.test(path)) return decodeURIComponent(new URL(path).pathname.split('/').pop() || path)
  } catch {
    /* not a URL */
  }
  return path.split('/').pop() ?? path
}

export function folderName(path: string | null): string {
  if (!path || /^[a-z]+:\/\//i.test(path)) return ''
  const parts = path.split('/')
  return parts[parts.length - 2] ?? ''
}
