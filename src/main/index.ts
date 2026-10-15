import { execFile } from 'node:child_process'
import { basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, powerSaveBlocker, protocol, screen, shell, Tray, type MenuItemConstructorOptions } from 'electron'
import { BRAND } from '@shared/brand'
import type { SettingsSnapshot } from '@shared/settings-store'
import { PlayerBridge } from './player'
import { Settings } from './settings'
import { applySettings, RULES } from './settings-apply'
import { SETTINGS } from '@shared/settings-schema'
import { cropString } from '@shared/video-effects'
import { EQ_PRESETS } from '@shared/audio-effects'
import { defaultLogFile, setLogFile, writeLog } from './app-log'
import { scheduleSnapshot, setupAudit } from './dev-snapshot'
import { bin, displayableImage, posterFor, readTags, thumbnailAt, waveform } from './media-tools'
import { JobQueue, PRESETS, type ConvertOptions } from './convert'
import { HttpServer, lanAddress, MIME } from './http-server'
import { captureUrl, discKind, dvdTitles, listCaptureDevices, listDiscs, mediaInfo, mountImage, unmountImages } from './sources'
import { browse as upnpBrowse, castControl, castSeek, castTo, discover as upnpDiscover, type UpnpDevice } from './upnp'
import { fetchPodcast, searchStations } from './feeds'
import { Library } from './library'
import { PluginManager } from './plugins'
import { typeOf, type MusicView, type SortKey } from '@shared/library'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null
let player: PlayerBridge | null = null

app.setName(BRAND.name)
// Tests and dev checks use a throwaway profile so they never touch real settings or the library.
if (process.env.FLP_USER_DATA) app.setPath('userData', process.env.FLP_USER_DATA)

// flp-media://file/<absolute path> serves local files (images, covers, posters) to the UI.
protocol.registerSchemesAsPrivileged([
  { scheme: 'flp-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } },
  // Plugin panels get their own origin and a strict policy: inline code only, no network.
  { scheme: 'flp-plugin', privileges: { secure: true, standard: true } }
])

const PANEL_BRIDGE = `<script>
window.flp = {
  postMessage: (data) => parent.postMessage({ __flpPanel: true, data }, '*'),
  onMessage: (cb) => addEventListener('message', (e) => { if (e.data && e.data.__flpToPanel) cb(e.data.data) })
};
addEventListener('message', (e) => {
  if (e.data && e.data.__flpTheme) {
    let s = document.getElementById('__flp-theme');
    if (!s) { s = document.createElement('style'); s.id = '__flp-theme'; document.head.prepend(s) }
    s.textContent = e.data.__flpTheme
  }
});
</script>`
const settings = new Settings()
const library = new Library()
const jobs = new JobQueue()
const http = new HttpServer(() => player, jobs)
jobs.on('jobs', (list) => win?.webContents.send('jobs:list', list))
const plugins = new PluginManager(settings, () => player, library, (channel, ...args) => win?.webContents.send(channel, ...args))

function snapshot(): SettingsSnapshot {
  return {
    values: settings.values(),
    activeProfile: settings.data.activeProfile,
    profiles: Object.entries(settings.data.profiles).map(([id, p]) => ({ id, name: p.name })),
    ui: settings.data.ui
  }
}

const CROP_KEYS = ['video.crop', 'vfx.cropLeft', 'vfx.cropRight', 'vfx.cropTop', 'vfx.cropBottom']
async function applyCrop(): Promise<void> {
  if (!player) return
  const w = Number(await player.get('video-params/w')) || 0
  const h = Number(await player.get('video-params/h')) || 0
  await player?.set('video-crop', cropString(w, h, settings.values())).catch((err: Error) => console.warn('[crop]', err.message))
}

/** Library options that live in settings; returns true when a rescan is needed. */
function configureLibrary(): boolean {
  const showHidden = !!settings.get('library.showHidden')
  const recursive = settings.get('library.folderMode') !== 'flat'
  const changed = showHidden !== library.showHidden || recursive !== library.recursive
  library.showHidden = showHidden
  library.recursive = recursive
  library.artworkFromFolder = settings.get('library.metadataSource') !== 'file'
  return changed
}

function configureLog(): void {
  const on = !!settings.get('general.saveLog')
  setLogFile(on ? String(settings.get('general.logFile') || '') || defaultLogFile() : null)
  player?.setLogLevel(on ? String(settings.get('general.logLevel') ?? 'error') : 'error')
}

settings.on('changed', (keys: string[]) => {
  if (player) applySettings(player, settings.values(), keys)
  plugins.settingsChanged(keys)
  if (keys.some((k) => CROP_KEYS.includes(k))) void applyCrop()
  if (keys.some((k) => ['library.showHidden', 'library.folderMode', 'library.metadataSource'].includes(k)) && configureLibrary()) void library.scanAll()
  if (keys.includes('library.enabled')) library.setEnabled(settings.get('library.enabled') !== false)
  if (keys.some((k) => k.startsWith('general.') && /log/i.test(k))) configureLog()
  // Picking a preset in Settings (or via a profile) also sets the bands and turns the equalizer on.
  if (keys.includes('audio.eqPreset') && !keys.includes('fx.eqBands')) {
    const preset = EQ_PRESETS[String(settings.get('audio.eqPreset'))]
    if (preset) settings.setMany({ 'fx.eqBands': preset.bands, ...(preset.bands.some(Boolean) ? { 'audio.eq': true } : {}) })
  }
  if (keys.includes('interface.allowIconChange')) void updateDockIcon()
  if (keys.some((k) => k.startsWith('controls.webRemote'))) void configureRemote()
  if (keys.includes('interface.trayIcon')) updateTray()
  if (keys.includes('interface.opacity')) win?.setOpacity(Number(settings.get('interface.opacity') ?? 100) / 100)
  win?.webContents.send('settings:changed', snapshot())
})
library.on('changed', () => scheduleLibraryNotice())
library.on('status', (status) => win?.webContents.send('library:status', status))
let libraryNoticeTimer: NodeJS.Timeout | undefined
function scheduleLibraryNotice() {
  clearTimeout(libraryNoticeTimer)
  libraryNoticeTimer = setTimeout(() => win?.webContents.send('library:changed'), 300)
}

settings.on('ui-changed', (key: string) => {
  if (key !== 'lastVolume') win?.webContents.send('settings:changed', snapshot())
})

/** mpv's own Lua/JS scripts, from <userData>/mpv-scripts. */
async function loadMpvScripts(bridge: PlayerBridge): Promise<void> {
  if (settings.get('extensions.mpvScripts') === false) return
  const { readdir, mkdir } = await import('node:fs/promises')
  const dir = join(app.getPath('userData'), 'mpv-scripts')
  await mkdir(dir, { recursive: true })
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!/\.(lua|js)$/.test(name)) continue
    await bridge.command(['load-script', join(dir, name)]).catch((err: Error) => console.warn(`[mpv-scripts] ${name}: ${err.message}`))
  }
}

/** Starts or stops the web remote to match settings. */
async function configureRemote(): Promise<void> {
  http.remoteEnabled = !!settings.get('controls.webRemote')
  http.remotePassword = String(settings.get('controls.webRemotePassword') ?? '')
  if (http.remoteEnabled) {
    await http.ensure(Number(settings.get('controls.webRemotePort') ?? 8090)).catch((err: Error) => {
      win?.webContents.send('plugins:notify', 'Web remote', `Couldn't start on port ${settings.get('controls.webRemotePort')}: ${err.message}`, null)
    })
  }
}

/** The web server also serves stream-out and casting, so it starts on demand. */
async function ensureServer(): Promise<void> {
  await http.ensure(Number(settings.get('controls.webRemotePort') ?? 8090))
}

let castDevice: UpnpDevice | null = null

// ── macOS integration: Dock menu, menu-bar icon, opening files ──

function updateDockMenu(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const st = player?.state
  const send = (cmd: string) => () => win?.webContents.send('command:run', cmd)
  app.dock.setMenu(
    Menu.buildFromTemplate([
      ...(st?.title ? [{ label: st.title, enabled: false }, { type: 'separator' as const }] : []),
      { label: st && !st.paused && !st.idle ? 'Pause' : 'Play', click: send('player.playPause') },
      { label: 'Next', click: send('player.next') },
      { label: 'Previous', click: send('player.previous') },
      { type: 'separator' },
      { label: 'Open File…', click: send('media.openFile') }
    ])
  )
  tray?.setToolTip(st?.title ? `FLP — ${st.title}` : 'FLP')
}

let tray: Tray | null = null
const resourcesDir = () => (app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'))
function updateTray(): void {
  if (!settings.get('interface.trayIcon')) {
    tray?.destroy()
    tray = null
    return
  }
  if (tray) return
  // Template image: macOS tints it for light/dark menu bars (the @2x file is picked up automatically).
  const icon = nativeImage.createFromPath(join(resourcesDir(), 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  const send = (cmd: string) => () => win?.webContents.send('command:run', cmd)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show FLP', click: () => win?.show() },
      { type: 'separator' },
      { label: 'Play / Pause', click: send('player.playPause') },
      { label: 'Next', click: send('player.next') },
      { label: 'Previous', click: send('player.previous') },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' }
    ])
  )
}

/** Files opened before the window exists (Finder "Open With", drag onto the Dock icon). */
let pendingOpen: string[] = []
function openExternally(paths: string[]): void {
  if (!paths.length) return
  if (!player || !win) {
    pendingOpen.push(...paths)
    return
  }
  const enqueue = settings.get('library.enqueueFromFinder') !== false && settings.get('library.enqueue') && !player.state.idle
  paths.forEach((p, i) => void player!.command(['loadfile', p, enqueue || i > 0 ? 'append-play' : 'replace']))
  if (!enqueue) win.webContents.send('command:run', 'ui.showPlayer')
  showWindow()
}
function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
// Finder sends one open-file per selected file; gather them so they open as one queue.
let openBatch: string[] = []
let openTimer: NodeJS.Timeout | undefined
app.on('open-file', (e, path) => {
  e.preventDefault()
  openBatch.push(path)
  clearTimeout(openTimer)
  openTimer = setTimeout(() => {
    const batch = openBatch
    openBatch = []
    openExternally(batch)
  }, 60)
})

/** Files matching Settings → Privacy → "Never remember" stay out of history and resume points. */
function isPrivate(path: string): boolean {
  const never = String(settings.get('privacy.neverRemember') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return never.some((w) => path.toLowerCase().includes(w.replace(/^~/, app.getPath('home')).toLowerCase()))
}

function rememberRecent(path: string): void {
  if (isPrivate(path)) return
  const recent = settings.getUi<string[]>('recent', []).filter((p) => p !== path)
  settings.setUi('recent', [path, ...recent].slice(0, 50))
}

// mpv options from Settings → General → Additional command line options ("--deband=yes --sub-scale=1.2").
// Options FLP depends on for drawing into its window can't be overridden.
const PROTECTED_OPTIONS = new Set(['vo', 'wid', 'gpu-context', 'keep-open', 'idle', 'terminal', 'osc', 'input-default-bindings', 'input-vo-keyboard', 'config'])
function extraMpvOptions(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of String(settings.get('general.extraMpvOptions') ?? '').matchAll(/--([a-z0-9-]+)(?:=("[^"]*"|'[^']*'|\S*))?/gi)) {
    const name = m[1].toLowerCase()
    if (!PROTECTED_OPTIONS.has(name)) out[name] = (m[2] ?? 'yes').replace(/^(["'])(.*)\1$/, '$2')
  }
  return out
}

/** Fullscreen, moving to the display chosen in Settings → Interface first. */
function setFullScreen(on: boolean): void {
  if (!win) return
  const target = String(settings.get('interface.fullscreenScreen') ?? 'current')
  const display = on && target !== 'current' ? screen.getAllDisplays().find((d) => String(d.id) === target) : undefined
  if (display && screen.getDisplayMatching(win.getBounds()).id !== display.id) {
    const area = display.workArea
    const { width, height } = win.getBounds()
    const w = Math.min(width, area.width)
    const h = Math.min(height, area.height)
    win.setBounds({ x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round((area.height - h) / 2), width: w, height: h })
    setTimeout(() => win?.setFullScreen(true), 100)
    return
  }
  win.setFullScreen(on)
}

/** mpv can't see the display through the render API, so tell it the refresh rate of the one the window is on
 *  (needed by "Sync video to the display refresh rate" and frame blending). */
function syncDisplayFps(): void {
  if (!win || win.isDestroyed() || !player || 'display-fps-override' in extraMpvOptions()) return
  const hz = screen.getDisplayMatching(win.getBounds()).displayFrequency
  if (hz > 0) void player.set('display-fps-override', hz).catch(() => null)
}

/** The video's place in the window, as last reported by the UI (for "resize window to fit video"). */
let videoRect: Electron.Rectangle | null = null
let resizedForVideo = false
function resizeToVideo(): void {
  const mode = settings.get('interface.resizeToVideo')
  const st = player?.state
  if (!win || !st || !videoRect || mode === 'never' || (mode === 'first-video-only' && resizedForVideo)) return
  if (st.kind !== 'video' || !st.videoWidth || !st.videoHeight || win.isFullScreen() || beforePip || videoRect.width < 200) return
  resizedForVideo = true
  const [cw, ch] = win.getContentSize()
  const chromeW = cw - videoRect.width
  const chromeH = ch - videoRect.height
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const scale = Math.min(1, (area.width * 0.9 - chromeW) / st.videoWidth, (area.height * 0.9 - chromeH) / st.videoHeight)
  const w = Math.round(st.videoWidth * scale + chromeW)
  const h = Math.round(st.videoHeight * scale + chromeH)
  const b = win.getBounds()
  const x = Math.max(area.x, Math.min(b.x, area.x + area.width - w))
  const y = Math.max(area.y, Math.min(b.y, area.y + area.height - h))
  win.setBounds({ x, y, width: w + (b.width - cw), height: h + (b.height - ch) }, true)
}

/** Settings → Interface → "Allow the app icon to change": cover art in the Dock while music plays. */
let dockCover: string | null = null
async function updateDockIcon(): Promise<void> {
  if (process.platform !== 'darwin' || !app.dock) return
  const st = player?.state
  const path = st?.path
  const want = settings.get('interface.allowIconChange') && st?.kind === 'audio' && path ? (await readTags(path, settings.get('library.metadataSource') !== 'file')).cover ?? null : null
  // Another track started while the tags were being read.
  if (player?.state.path !== path || want === dockCover) return
  dockCover = want
  const icon = want ? nativeImage.createFromPath(want) : nativeImage.createFromPath(join(resourcesDir(), 'icon.png'))
  if (!icon.isEmpty()) app.dock.setIcon(icon)
}

/** Settings → Playback → "When playback finishes", once the last item ends. */
function playbackFinished(): void {
  const st = player?.state
  if (!st || st.kind === 'image' || settings.get('playback.repeat') !== 'off') return
  const last = st.playlist.length === 0 || st.playlist[st.playlist.length - 1]?.current
  if (!last) return
  const action = settings.get('playback.whenFinished')
  if (action === 'quit') app.quit()
  else if (action === 'return-to-library') win?.webContents.send('command:run', 'ui.home')
  else if (action === 'sleep-computer') execFile('/usr/bin/pmset', ['sleepnow'], () => null)
}

function trackPopup(title: string): void {
  const when = settings.get('interface.trackPopup')
  if (!win || when === 'never' || !Notification.isSupported()) return
  if (when === 'minimized' && !win.isMinimized() && win.isVisible()) return
  const n = new Notification({ title, silent: true })
  n.on('click', () => {
    win?.show()
    win?.focus()
  })
  n.show()
  const secs = Number(settings.get('interface.popupDuration') ?? 4)
  if (secs > 0) setTimeout(() => n.close(), secs * 1000)
}

function saveWindowBounds(): void {
  // In picture-in-picture, remember the normal window, not the small one.
  if (win && !win.isDestroyed() && settings.get('interface.rememberWindow') && !win.isFullScreen()) settings.setUi('windowBounds', beforePip?.bounds ?? win.getBounds())
}

function createWindow(): void {
  let bounds = settings.get('interface.rememberWindow') !== false ? settings.getUi<Electron.Rectangle | null>('windowBounds', null) : null
  // Saved on a display that's no longer connected: open centred instead.
  if (bounds && !screen.getAllDisplays().some(({ workArea: a }) => bounds!.x < a.x + a.width - 80 && bounds!.x + bounds!.width > a.x + 80 && bounds!.y < a.y + a.height - 40 && bounds!.y + bounds!.height > a.y))
    bounds = { ...bounds, x: undefined as unknown as number, y: undefined as unknown as number }
  win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 760,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 640,
    minHeight: 400,
    title: BRAND.name,
    // Transparent so the mpv view underneath the web contents shows through the video area.
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 11 },
    show: false,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // ytdl_hook reads its options at startup, so yt-dlp's path goes in before mpv initializes.
  const extra = extraMpvOptions()
  player = new PlayerBridge(win, {
    // macOS Now Playing (Control Center, lock screen) and the keyboard's media keys.
    'media-controls': settings.get('controls.mediaKeys') === false ? 'no' : 'yes',
    ...extra,
    'script-opts': [`ytdl_hook-ytdl_path=${bin('yt-dlp')}`, extra['script-opts']].filter(Boolean).join(',')
  })
  applySettings(player, settings.values())
  // The user's own options win over FLP's settings (applySettings just set many of the same properties).
  for (const [k, v] of Object.entries(extra)) if (k !== 'script-opts') void player.set(k, v).catch(() => null)
  syncDisplayFps()
  player.on('log', (m: { level: string; prefix: string; text: string }) => writeLog(m.prefix, m.level, m.text))
  configureLog()
  void loadMpvScripts(player)
  void player.set(
    'volume',
    settings.get('audio.rememberVolume') ? settings.getUi('lastVolume', 100) : settings.get('audio.startupVolume')
  )
  player.on('state', (patch) => {
    win?.webContents.send('player:state', patch)
    plugins.playerState(patch)
    if ('volume' in patch && settings.get('audio.rememberVolume')) settings.setUi('lastVolume', patch.volume)
    if (patch.path && settings.get('privacy.saveRecent')) rememberRecent(patch.path)
    if (patch.time !== undefined && settings.get('privacy.rememberPosition')) library.onTime(patch.time, player!.state.duration)
    if (patch.videoWidth !== undefined) {
      void applyCrop()
      resizeToVideo()
    }
    if ('kind' in patch || 'path' in patch) void updateDockIcon()
    // keep-open holds the last frame without an end-file event, so the end of the list shows up here.
    if (patch.eof === true) {
      library.onEofReached()
      plugins.playerEvent('ended', { path: player!.state.path, reason: 'eof' })
      playbackFinished()
    }
  })
  // Why the previous file ended: 'eof' means mpv moved on by itself.
  let lastEnd: string | null = null
  player.on('file-loaded', async () => {
    // Property updates can arrive after this event, so ask mpv directly.
    const bridge = player
    if (!bridge) return
    const [path, title, duration] = (await Promise.all([bridge.get('path'), bridge.get('media-title'), bridge.get('duration')])) as [string | null, string | null, number | null]
    if (!path) return
    // Moving on by itself keeps playing (unless "Stop after each item"); anything the user opens
    // (including a playlist file or folder, which ends with 'redirect') follows "autoplay".
    const auto = lastEnd === 'eof'
    lastEnd = null
    // Read the resume point before tracking starts, so an early time update can't overwrite it.
    const position = settings.get('privacy.rememberPosition') && !isPrivate(path) ? library.resumePosition(path) : 0
    if (auto ? settings.get('playback.stopAfterEach') : settings.get('playback.autoplay') === false) void bridge.set('pause', true)
    else if (!auto) void bridge.set('pause', false)
    const tracked = !isPrivate(path) && (settings.get('privacy.saveRecent') || settings.get('privacy.rememberPosition'))
    if (tracked) library.onFileStarted(path, title, duration ?? 0)
    const resume = settings.get('playback.resume')
    // `private`: Privacy settings say not to remember this file (history plugins should skip it).
    plugins.playerEvent('file-loaded', { path, title, duration, private: isPrivate(path) || !settings.get('privacy.saveRecent') })
    trackPopup(title || basename(path))
    // Cover art and still images show up as a video track; only real video counts here.
    const vt = (await bridge.get('current-tracks/video')) as { albumart?: boolean; image?: boolean } | null
    const isVideo = !!vt && !vt.albumart && !vt.image
    if (settings.get('video.startFullscreen') && isVideo && !win?.isFullScreen()) setFullScreen(true)
    const raise = settings.get('interface.raiseOnPlay')
    if (raise === 'always' || (raise === 'video' && isVideo)) win?.show()
    if (position > 0 && resume === 'always') void bridge.command(['seek', position, 'absolute'])
    else if (position > 0 && resume === 'ask') win?.webContents.send('player:resume-offer', { path, position })
  })
  let sleepBlocker: number | null = null
  player.on('state', (patch) => {
    if (!('paused' in patch || 'kind' in patch || 'idle' in patch || 'title' in patch)) return
    const st = player!.state
    const playingVideo = !st.paused && !st.idle && st.kind === 'video'
    if (playingVideo && settings.get('video.stopScreensaver') !== false && sleepBlocker === null) sleepBlocker = powerSaveBlocker.start('prevent-display-sleep')
    else if (!playingVideo && sleepBlocker !== null) {
      powerSaveBlocker.stop(sleepBlocker)
      sleepBlocker = null
    }
    updateDockMenu()
  })
  player.on('end-file', (reason: string) => {
    lastEnd = reason
    const { time, duration, path } = player!.state
    plugins.playerEvent('ended', { path, reason })
    library.onStopped(time, duration, reason === 'eof', !!settings.get('privacy.rememberPosition'))
  })

  win.setOpacity(Number(settings.get('interface.opacity') ?? 100) / 100)
  win.on('ready-to-show', () => {
    if (!(settings.get('interface.startInTray') && settings.get('interface.trayIcon'))) win?.show()
  })
  win.on('minimize', () => {
    if (settings.get('interface.pauseMinimized')) void player?.set('pause', true)
  })
  win.on('enter-full-screen', () => {
    win?.webContents.send('window:fullscreen', true)
    syncDisplayFps()
  })
  win.on('leave-full-screen', () => {
    win?.webContents.send('window:fullscreen', false)
    syncDisplayFps()
  })
  win.on('moved', syncDisplayFps)
  win.on('close', () => {
    saveWindowBounds()
    // The player is destroyed with the window, before before-quit; keep the resume point now.
    if (player) library.onStopped(player.state.time, player.state.duration, false, !!settings.get('privacy.rememberPosition'))
  })
  win.on('closed', () => {
    player?.destroy()
    player = null
    win = null
  })

  const params = [process.env.FLP_QUERY, (process.env.FLP_SNAPSHOT || process.env.FLP_AUDIT_DIR) && 'dev'].filter(Boolean).join('&')
  const query = params ? `?${params}` : ''
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL + query)
  else win.loadFile(join(here, '../renderer/index.html'), { search: query.slice(1) })

  // Dev convenience: FLP_OPEN=/path/to/file npm run dev. Files passed on the command line open too.
  const initial = [process.env.FLP_OPEN, ...process.argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && a !== '.')].filter(Boolean) as string[]
  win.webContents.once('did-finish-load', () => {
    openExternally([...initial, ...pendingOpen])
    pendingOpen = []
  })
  scheduleSnapshot(win, player)
  setupAudit(win, () => player, () => ({ settings, library, app, screen, http, jobs, plugins, RULES, SETTINGS }))
}

// Player
ipcMain.handle('player:command', (_e, args: unknown[]) => player?.command(args))
ipcMain.handle('player:set', (_e, name: string, value: unknown) => player?.set(name, value))
ipcMain.handle('player:get', (_e, name: string) => player?.get(name))
ipcMain.handle('player:snapshot', () => player?.state)
ipcMain.on('player:bounds', (_e, b: Electron.Rectangle) => {
  videoRect = b
  player?.setBounds(b.x, b.y, b.width, b.height)
})
ipcMain.on('player:visible', (_e, visible: boolean) => player?.setVisible(visible))
ipcMain.on('player:radius', (_e, radius: number) => player?.setCornerRadius(radius))

// Settings
ipcMain.handle('settings:snapshot', () => snapshot())
ipcMain.handle('settings:set', (_e, key: string, value: unknown) => settings.set(key, value))
ipcMain.handle('settings:setMany', (_e, patch: Record<string, unknown>) => settings.setMany(patch))
ipcMain.handle('settings:resetAll', () => settings.resetAll())
ipcMain.handle('settings:setProfile', (_e, id: string | null) => settings.setProfile(id))
ipcMain.handle('settings:createProfile', (_e, name: string) => settings.createProfile(name))
ipcMain.handle('settings:renameProfile', (_e, id: string, name: string) => settings.renameProfile(id, name))
ipcMain.handle('settings:deleteProfile', (_e, id: string) => settings.deleteProfile(id))
ipcMain.handle('settings:setUi', (_e, key: string, value: unknown) => settings.setUi(key, value))

// Dialogs, window, shell
ipcMain.handle('dialog:openFiles', async (_e, opts: { folders?: boolean; multiple?: boolean; title?: string; filters?: string[] } = {}) => {
  if (!win) return []
  showWindow()
  const res = await dialog.showOpenDialog(win, {
    title: opts.title,
    filters: opts.filters?.length && !opts.folders ? [{ name: opts.filters.join(', ').toUpperCase(), extensions: opts.filters }] : undefined,
    properties: [opts.folders ? 'openDirectory' : 'openFile', ...(opts.multiple !== false ? (['multiSelections'] as const) : [])]
  })
  return res.canceled ? [] : res.filePaths
})
ipcMain.on('window:toggleFullscreen', () => setFullScreen(!win?.isFullScreen()))
ipcMain.handle('window:isFullscreen', () => win?.isFullScreen() ?? false)
ipcMain.on('window:alwaysOnTop', (_e, on: boolean) => win?.setAlwaysOnTop(on, 'floating'))
ipcMain.on('window:minimize', () => win?.minimize())
ipcMain.on('window:zoom', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
ipcMain.on('window:close', () => win?.close())

// Picture in picture: a small always-on-top window in the screen corner; restores afterwards.
let beforePip: { bounds: Electron.Rectangle; onTop: boolean } | null = null
ipcMain.on('window:pip', function pip(_e: unknown, on: boolean) {
  if (!win) return
  if (on && !beforePip) {
    // Leaving fullscreen is animated; size the small window once it has finished.
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => setTimeout(() => pip(_e, true), 50))
      win.setFullScreen(false)
      return
    }
    beforePip = { bounds: win.getBounds(), onTop: win.isAlwaysOnTop() }
    const area = screen.getDisplayMatching(win.getBounds()).workArea
    const w = 480
    const h = Math.round((w * 9) / 16)
    win.setAlwaysOnTop(true, 'floating')
    win.setMinimumSize(240, 135)
    win.setWindowButtonVisibility(false)
    win.setBounds({ x: area.x + area.width - w - 24, y: area.y + area.height - h - 24, width: w, height: h }, true)
  } else if (!on && beforePip) {
    win.setAlwaysOnTop(beforePip.onTop)
    win.setMinimumSize(640, 400)
    win.setWindowButtonVisibility(true)
    win.setBounds(beforePip.bounds, true)
    beforePip = null
  }
})
ipcMain.handle('app:homeDir', () => app.getPath('home'))
ipcMain.handle('app:displays', () => screen.getAllDisplays().map((d, i) => ({ id: d.id, label: d.label || `Display ${i + 1} (${d.size.width}×${d.size.height})` })))
// System-wide hotkeys work even when FLP isn't focused (e.g. play/pause from any app).
const ACCEL: Record<string, string> = {
  Mod: 'CommandOrControl', Ctrl: 'Control', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Escape: 'Esc',
  Quote: "'", Semicolon: ';', Backquote: '`', MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack', MediaPlayPause: 'MediaPlayPause',
  MediaStop: 'MediaStop', AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec', NumpadEnter: 'Enter',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Numpad${i}`, `num${i}`]))
}
function registerGlobalShortcuts(map: Record<string, string>): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  for (const [command, key] of Object.entries(map)) {
    const accel = key.split('+').map((p) => ACCEL[p] ?? p).join('+')
    // A bare key ("Space", "F") would stop working in every other app.
    if (!/(Mod|Ctrl|Alt|Meta)\+/.test(key) && !/^(F\d{1,2}|Media\w+|Audio\w+)$/.test(key)) {
      failed.push(command)
      continue
    }
    try {
      if (!globalShortcut.register(accel, () => win?.webContents.send('command:run', command))) failed.push(command)
    } catch {
      failed.push(command)
    }
  }
  return failed
}
ipcMain.handle('app:globalShortcuts', (_e, map: Record<string, string>) => registerGlobalShortcuts(map))
ipcMain.on('app:openConfigFolder', () => void shell.openPath(app.getPath('userData')))
ipcMain.on('app:toggleDevTools', () => win?.webContents.toggleDevTools())
ipcMain.handle('app:ensureDir', async (_e, dir: string) => {
  const { mkdir } = await import('node:fs/promises')
  return mkdir(dir, { recursive: true }).then(() => true, () => false)
})
// Mounted discs: DVDs (VIDEO_TS), Blu-rays (BDMV) and audio CDs (.aiff tracks) under /Volumes.
ipcMain.handle('app:opticalDrives', async () => {
  const { readdir } = await import('node:fs/promises')
  const vols = await readdir('/Volumes').catch(() => [] as string[])
  const out: string[] = []
  for (const v of vols) {
    const items = await readdir(join('/Volumes', v)).catch(() => [] as string[])
    if (items.includes('VIDEO_TS') || items.includes('BDMV') || items.some((i) => i.toLowerCase().endsWith('.aiff'))) out.push(join('/Volumes', v))
  }
  return out
})

// Subtitles: list a folder's videos, and copy subtitle files next to them as "<video>.<lang>.<ext>"
// so every player picks them up automatically. Existing files are never overwritten silently.
ipcMain.handle('subs:listVideos', async (_e, dir: string) => {
  const { readdir } = await import('node:fs/promises')
  const { typeOf } = await import('@shared/library')
  const names = await readdir(dir).catch(() => [] as string[])
  return names.filter((n) => typeOf(n) === 'video').sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((n) => join(dir, n))
})
ipcMain.handle('subs:install', async (_e, pairs: { sub: string; video: string; lang: string }[], overwrite: boolean) => {
  const { copyFile, constants } = await import('node:fs/promises')
  const { extname } = await import('node:path')
  const results: { video: string; target: string; ok: boolean; error?: string }[] = []
  for (const { sub, video, lang } of pairs) {
    const base = video.replace(/\.[^./]+$/, '')
    const target = `${base}${lang ? `.${lang}` : ''}${extname(sub).toLowerCase()}`
    try {
      await copyFile(sub, target, overwrite ? 0 : constants.COPYFILE_EXCL)
      results.push({ video, target, ok: true })
    } catch (err) {
      results.push({ video, target, ok: false, error: (err as NodeJS.ErrnoException).code === 'EEXIST' ? 'exists' : (err as Error).message })
    }
  }
  return results
})
ipcMain.on('shell:showInFolder', (_e, path: string) => shell.showItemInFolder(path))
ipcMain.on('shell:openExternal', (_e, url: string) => {
  if (/^https:\/\//.test(url)) void shell.openExternal(url)
})
ipcMain.on('shell:openPath', (_e, path: string) => void shell.openPath(path))

// Library
ipcMain.handle('library:roots', () => library.roots())
// Returns once the folder is added; the scan carries on in the background (status events report it).
ipcMain.handle('library:addRoot', (_e, path: string) => void library.addRoot(path))
ipcMain.handle('library:removeRoot', (_e, path: string) => library.removeRoot(path))
ipcMain.handle('library:rescan', () => library.scanAll())
ipcMain.handle('library:status', () => library.status)
ipcMain.handle('library:browse', (_e, kind: string, dir: string | null, sort: SortKey) => library.browse(kind, dir, sort))
ipcMain.handle('library:search', (_e, q: string, kind: string) => library.search(q, kind))
ipcMain.handle('library:home', () => library.home())
ipcMain.handle('library:recent', () => library.recent())
ipcMain.handle('library:favorites', () => library.favorites())
ipcMain.handle('library:music', (_e, view: MusicView, filter: string | null, sort: SortKey) => library.music(view, filter, sort))
ipcMain.handle('library:poster', (_e, id: number) => library.poster(id))
ipcMain.handle('library:item', (_e, path: string) => library.db.byPath(path))
ipcMain.handle('library:setFavorite', (_e, path: string, on: boolean) => {
  library.db.setFavorite(path, on)
  scheduleLibraryNotice()
})
ipcMain.handle('library:setWatched', (_e, path: string, on: boolean) => {
  library.db.setWatched(path, on)
  scheduleLibraryNotice()
})
ipcMain.handle('library:clearHistory', () => {
  library.db.clearHistory()
  settings.setUi('recent', [])
  scheduleLibraryNotice()
})
ipcMain.handle('library:playlists', () => library.db.playlists())
ipcMain.handle('library:createPlaylist', (_e, name: string, paths: string[], cover: string | null) => {
  const id = library.db.createPlaylist(name, paths, cover)
  scheduleLibraryNotice()
  return id
})
ipcMain.handle('library:playlistPaths', (_e, id: number) => library.db.playlistPaths(id))
ipcMain.handle('library:addToPlaylist', (_e, id: number, paths: string[]) => {
  library.db.addToPlaylist(id, paths)
  scheduleLibraryNotice()
})
ipcMain.handle('library:setPlaylistPaths', (_e, id: number, paths: string[]) => {
  library.db.setPlaylistPaths(id, paths)
  scheduleLibraryNotice()
})
ipcMain.handle('library:renamePlaylist', (_e, id: number, name: string) => {
  library.db.renamePlaylist(id, name)
  scheduleLibraryNotice()
})
ipcMain.handle('library:setPlaylistCover', (_e, id: number, cover: string | null) => {
  library.db.setPlaylistCover(id, cover)
  scheduleLibraryNotice()
})
ipcMain.handle('library:deletePlaylist', (_e, id: number) => {
  library.db.deletePlaylist(id)
  scheduleLibraryNotice()
})
ipcMain.handle('library:exportPlaylist', async (_e, id: number) => {
  const pl = library.db.playlists().find((p) => p.id === id)
  if (!pl || !win) return
  showWindow()
  const res = await dialog.showSaveDialog(win, { defaultPath: `${pl.name}.m3u8`, filters: [{ name: 'Playlist', extensions: ['m3u8'] }] })
  if (res.canceled || !res.filePath) return
  const { writeFile } = await import('node:fs/promises')
  await writeFile(res.filePath, ['#EXTM3U', `#PLAYLIST:${pl.name}`, ...library.db.playlistPaths(id)].join('\n') + '\n')
})
ipcMain.handle('library:bookmarks', (_e, path: string) => library.db.bookmarks(path))
ipcMain.handle('library:addBookmark', (_e, path: string, time: number, name: string) => library.db.addBookmark(path, time, name))
ipcMain.handle('library:removeBookmark', (_e, id: number) => library.db.removeBookmark(id))

// Plugins
ipcMain.handle('plugins:list', () => plugins.list())
ipcMain.handle('plugins:contributions', () => plugins.contributions)
ipcMain.handle('plugins:logs', () => plugins.logs)
ipcMain.handle('plugins:setEnabled', (_e, id: string, on: boolean) => plugins.setEnabled(id, on))
ipcMain.handle('plugins:reload', (_e, id?: string) => plugins.reload(id))
ipcMain.handle('plugins:invoke', (_e, pluginId: string, command: string, arg?: unknown) => plugins.invoke(pluginId, command, arg))
ipcMain.on('plugins:panelMessage', (_e, pluginId: string, panelId: string, data: unknown) => plugins.panelMessage(pluginId, panelId, data))
ipcMain.handle('plugins:remove', (_e, id: string) => plugins.remove(id))
ipcMain.handle('plugins:install', async () => {
  if (!win) return null
  showWindow()
  const res = await dialog.showOpenDialog(win, { title: 'Choose a plugin folder (it contains plugin.json)', properties: ['openDirectory'] })
  return res.canceled ? null : plugins.install(res.filePaths[0])
})
ipcMain.handle('plugins:create', async (_e, name: string) => {
  const dir = await plugins.create(name)
  void shell.openPath(dir)
  return dir
})
ipcMain.on('plugins:openFolder', () => void shell.openPath(plugins.userDir))
ipcMain.on('plugins:openGuide', () => void shell.openPath(join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'docs', 'PLUGINS.md')))

// Sources: discs, capture, media info
ipcMain.handle('sources:discs', () => listDiscs())
ipcMain.handle('sources:discKind', (_e, path: string) => discKind(path))
ipcMain.handle('sources:mountImage', (_e, iso: string) => mountImage(iso))
ipcMain.handle('sources:dvdTitles', (_e, path: string) => dvdTitles(path))
ipcMain.handle('sources:capture', () => listCaptureDevices())
ipcMain.handle('sources:captureUrl', (_e, video: number | null, audio: number | null) => captureUrl(video, audio))
ipcMain.handle('sources:mediaInfo', (_e, path: string) => mediaInfo(path))
ipcMain.handle('sources:networkShares', async () => {
  // Network volumes mounted in Finder (SMB, AFP, NFS, WebDAV).
  const { execFile } = await import('node:child_process')
  const out = await new Promise<string>((r) => execFile('/sbin/mount', (_e, so) => r(String(so ?? ''))))
  return out.split('\n').map((l) => l.match(/^(\S+) on (\/Volumes\/.+?) \((smbfs|afpfs|nfs|webdav)/)).filter(Boolean).map((m) => ({ source: m![1], path: m![2], kind: m![3] }))
})
ipcMain.on('sources:connectServer', (_e, url: string) => {
  if (/^(smb|afp|nfs|ftp):\/\//i.test(url)) void shell.openExternal(url)
})

// Convert / stream out
ipcMain.handle('jobs:presets', () => Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, ext: p.ext })))
ipcMain.handle('jobs:list', () => jobs.jobs)
ipcMain.handle('jobs:convert', async (_e, inputs: string[], opts: ConvertOptions) => {
  for (const i of inputs) await jobs.convert(i, { ...opts, encoderPreset: String(settings.get('recording.preset') ?? 'medium') })
})
ipcMain.handle('jobs:stream', async (_e, input: string, target: 'hls' | 'udp', udpAddress?: string) => {
  if (target === 'hls') await ensureServer()
  const job = jobs.stream(input, {
    target,
    udpAddress,
    audio: settings.get('recording.includeAudio') !== false,
    video: settings.get('recording.includeVideo') !== false,
    preset: String(settings.get('recording.preset') ?? 'medium'),
    tune: String(settings.get('recording.tune') ?? 'none'),
    hlsUrl: (p) => http.url(p)
  })
  if (settings.get('recording.playLocally') === false && input === player?.state.path) void player?.set('pause', true)
  return job.url
})
ipcMain.handle('jobs:cancel', (_e, id: number) => jobs.cancel(id))
ipcMain.handle('jobs:clear', () => jobs.clearFinished())

// UPnP / DLNA and casting
ipcMain.handle('upnp:discover', (_e, kind: 'server' | 'renderer') => upnpDiscover(kind))
ipcMain.handle('upnp:browse', (_e, device: UpnpDevice, id: string) => upnpBrowse(device, id))
ipcMain.handle('cast:start', async (_e, device: UpnpDevice) => {
  const s = player?.state
  if (!s?.path) throw new Error('Nothing is playing')
  let url = s.path
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    // Web pages (YouTube…) play through yt-dlp; a TV needs the media address it resolved to.
    const opened = String((await player?.get('stream-open-filename')) ?? '')
    if (!/^https?:/i.test(url) || (!typeOf(url) && !/^https?:/i.test(opened)))
      throw new Error("This can't be sent to a TV. Files and web streams can; discs, capture devices and some online videos can't.")
    if (!typeOf(url)) url = opened
  } else {
    await ensureServer()
    url = http.shareFile(s.path)
  }
  // Strict renderers (Sonos, some TVs) refuse a type that doesn't match the file.
  const ext = extname(/^https?:/i.test(s.path) ? new URL(url).pathname : s.path).toLowerCase()
  const mime = MIME[ext] ?? (s.kind === 'audio' ? 'audio/mpeg' : s.kind === 'image' ? 'image/jpeg' : 'video/mp4')
  await castTo(device, url, s.title ?? 'FLP', mime)
  castDevice = device
  // Continue on the TV from where we were, and pause here.
  const at = s.time
  if (at > 5 && s.kind !== 'image') setTimeout(() => void castSeek(device, at).catch(() => null), 2000)
  void player?.set('pause', true)
  return url
})
ipcMain.handle('cast:control', (_e, action: 'Pause' | 'Play' | 'Stop') => (castDevice ? castControl(castDevice, action) : null))
ipcMain.handle('cast:stop', async () => {
  if (castDevice) await castControl(castDevice, 'Stop').catch(() => null)
  castDevice = null
})

// Radio & podcasts
ipcMain.handle('feeds:stations', (_e, query: string) => searchStations(query))
ipcMain.handle('feeds:podcast', (_e, url: string) => fetchPodcast(url))
ipcMain.handle('remote:info', () => ({ enabled: http.remoteEnabled, url: http.remoteEnabled && http.port ? `http://${lanAddress()}:${http.port}/` : null }))

// Media helpers
ipcMain.handle('media:thumbnail', (_e, path: string, time: number) => thumbnailAt(path, time))
ipcMain.handle('media:waveform', (_e, path: string) => waveform(path).catch(() => []))
ipcMain.handle('media:tags', (_e, path: string) => readTags(path))
ipcMain.handle('media:image', (_e, path: string) => displayableImage(path))
ipcMain.handle('media:poster', (_e, path: string, duration?: number) => posterFor(path, duration))

// The macOS menu bar mirrors the renderer's command registry. Shortcuts are shown but handled by
// the renderer, so single-key shortcuts (Space, F…) never steal keystrokes from text fields.
interface MenuSpec {
  label: string
  items: ({ label: string; command?: string; accelerator?: string; checked?: boolean; submenu?: MenuSpec['items'] } | 'separator')[]
}
ipcMain.on('menu:set', (_e, specs: MenuSpec[]) => {
  const toItems = (items: MenuSpec['items']): MenuItemConstructorOptions[] =>
    items.map((it) =>
      it === 'separator'
        ? { type: 'separator' }
        : {
            label: it.label,
            accelerator: it.accelerator,
            registerAccelerator: false,
            type: it.checked === undefined ? 'normal' : 'checkbox',
            checked: it.checked,
            submenu: it.submenu ? toItems(it.submenu) : undefined,
            click: it.command ? () => win?.webContents.send('command:run', it.command) : undefined
          }
    )
  const template: MenuItemConstructorOptions[] = [
    {
      label: BRAND.name,
      submenu: [
        { label: `About ${BRAND.name}`, click: () => win?.webContents.send('command:run', 'app.about') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', registerAccelerator: false, click: () => win?.webContents.send('command:run', 'ui.settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    ...specs.map((m) => ({ label: m.label, submenu: toItems(m.items) })),
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
})

// One window: a second launch (e.g. opening another file from Finder) hands its files to this one.
// A second copy hands its files to the running one and exits at once (before opening windows or ports).
if (settings.get('library.singleInstance') !== false && !process.env.FLP_SNAPSHOT && !process.env.FLP_AUDIT_DIR && !app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', (_e, argv) => {
  openExternally(argv.slice(1).filter((a) => !a.startsWith('-') && a !== '.'))
  showWindow()
})

app.whenReady().then(() => {
  // Run from the project (not the built app), macOS would show Electron's icon in the Dock.
  if (!app.isPackaged && app.dock) app.dock.setIcon(nativeImage.createFromPath(join(resourcesDir(), 'icon.png')))
  // A display's refresh rate changed, or the one the window was on went away.
  const resync = () => setTimeout(syncDisplayFps, 500)
  screen.on('display-metrics-changed', resync)
  screen.on('display-added', resync)
  screen.on('display-removed', resync)
  protocol.handle('flp-plugin', (req) => {
    const url = new URL(req.url)
    const [, pluginId, panelId] = url.pathname.split('/')
    const panel = plugins.contributions.panels.find((p) => p.pluginId === pluginId && p.id === panelId)
    if (!panel) return new Response('Panel not found', { status: 404 })
    // Matching colour scheme keeps the frame transparent (a mismatch makes Chromium paint it white).
    const scheme = url.searchParams.get('scheme') === 'light' ? 'light' : 'dark'
    const base = `<style>:root{color-scheme:${scheme}}html,body{background:transparent}</style>`
    return new Response(`<!doctype html><meta charset="utf-8">${base}${PANEL_BRIDGE}${panel.html}`, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; font-src data:"
      }
    })
  })
  protocol.handle('flp-media', (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname)
    return net.fetch(pathToFileURL(path).toString(), { headers: req.headers })
  })
  configureLibrary()
  library.enabled = settings.get('library.enabled') !== false
  library.start()
  createWindow()
  updateTray()
  updateDockMenu()
  void plugins.start()
  void configureRemote()
  registerGlobalShortcuts(settings.getUi<Record<string, string>>('globalShortcuts', {}))
})
app.on('window-all-closed', () => app.quit())
app.on('activate', () => win?.show())
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('before-quit', () => {
  unmountImages()
  plugins.dispose()
  jobs.dispose()
  void http.stop()
  if (player) library.onStopped(player.state.time, player.state.duration, false, !!settings.get('privacy.rememberPosition'))
  // before-quit runs before the window's close event, so save its size here too.
  saveWindowBounds()
  settings.flush()
})
