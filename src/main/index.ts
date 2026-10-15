import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, net, protocol, screen, shell, type MenuItemConstructorOptions } from 'electron'
import { BRAND } from '@shared/brand'
import type { SettingsSnapshot } from '@shared/settings-store'
import { PlayerBridge } from './player'
import { Settings } from './settings'
import { applySettings } from './settings-apply'
import { cropString } from '@shared/video-effects'
import { scheduleSnapshot } from './dev-snapshot'
import { displayableImage, posterFor, readTags, thumbnailAt, waveform } from './media-tools'
import { Library } from './library'
import type { MusicView, SortKey } from '@shared/library'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null
let player: PlayerBridge | null = null

app.setName(BRAND.name)
// Tests and dev checks use a throwaway profile so they never touch real settings or the library.
if (process.env.FLP_USER_DATA) app.setPath('userData', process.env.FLP_USER_DATA)

// flp-media://file/<absolute path> serves local files (images, covers, posters) to the UI.
protocol.registerSchemesAsPrivileged([
  { scheme: 'flp-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
])
const settings = new Settings()
const library = new Library()

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

settings.on('changed', (keys: string[]) => {
  if (player) applySettings(player, settings.values(), keys)
  if (keys.some((k) => CROP_KEYS.includes(k))) void applyCrop()
  if (keys.includes('library.showHidden') || keys.includes('library.folderMode')) {
    library.showHidden = !!settings.get('library.showHidden')
    library.recursive = settings.get('library.folderMode') !== 'flat'
    void library.scanAll()
  }
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

function rememberRecent(path: string): void {
  const never = String(settings.get('privacy.neverRemember') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (never.some((w) => path.toLowerCase().includes(w.replace(/^~/, app.getPath('home')).toLowerCase()))) return
  const recent = settings.getUi<string[]>('recent', []).filter((p) => p !== path)
  settings.setUi('recent', [path, ...recent].slice(0, 50))
}

function createWindow(): void {
  const bounds = settings.getUi<Electron.Rectangle | null>('windowBounds', null)
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

  player = new PlayerBridge(win)
  applySettings(player, settings.values())
  void player.set(
    'volume',
    settings.get('audio.rememberVolume') ? settings.getUi('lastVolume', 100) : settings.get('audio.startupVolume')
  )
  player.on('state', (patch) => {
    win?.webContents.send('player:state', patch)
    if ('volume' in patch && settings.get('audio.rememberVolume')) settings.setUi('lastVolume', patch.volume)
    if (patch.path && settings.get('privacy.saveRecent')) rememberRecent(patch.path)
    if (patch.time !== undefined && settings.get('privacy.rememberPosition')) library.onTime(patch.time, player!.state.duration)
    if (patch.videoWidth !== undefined) void applyCrop()
  })
  player.on('file-loaded', async () => {
    // Property updates can arrive after this event, so ask mpv directly.
    const bridge = player
    if (!bridge) return
    const [path, title, duration] = (await Promise.all([bridge.get('path'), bridge.get('media-title'), bridge.get('duration')])) as [string | null, string | null, number | null]
    if (!path) return
    if (settings.get('privacy.saveRecent')) library.onFileStarted(path, title, duration ?? 0)
    const resume = settings.get('playback.resume')
    const position = settings.get('privacy.rememberPosition') ? library.resumePosition(path) : 0
    if (position > 0 && resume === 'always') void bridge.command(['seek', position, 'absolute'])
    else if (position > 0 && resume === 'ask') win?.webContents.send('player:resume-offer', { path, position })
  })
  player.on('end-file', (reason: string) => {
    const { time, duration } = player!.state
    library.onStopped(time, duration, reason === 'eof')
  })

  win.setOpacity(Number(settings.get('interface.opacity') ?? 100) / 100)
  win.on('ready-to-show', () => win?.show())
  win.on('enter-full-screen', () => win?.webContents.send('window:fullscreen', true))
  win.on('leave-full-screen', () => win?.webContents.send('window:fullscreen', false))
  win.on('close', () => {
    if (win && settings.get('interface.rememberWindow') && !win.isFullScreen()) settings.setUi('windowBounds', win.getBounds())
  })
  win.on('closed', () => {
    player?.destroy()
    player = null
    win = null
  })

  const params = [process.env.FLP_QUERY, process.env.FLP_SNAPSHOT && 'dev'].filter(Boolean).join('&')
  const query = params ? `?${params}` : ''
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL + query)
  else win.loadFile(join(here, '../renderer/index.html'), { search: query.slice(1) })

  // Dev convenience: FLP_OPEN=/path/to/file npm run dev
  const initial = process.env.FLP_OPEN
  if (initial) win.webContents.once('did-finish-load', () => void player?.command(['loadfile', initial]))
  scheduleSnapshot(win, player)
}

// Player
ipcMain.handle('player:command', (_e, args: unknown[]) => player?.command(args))
ipcMain.handle('player:set', (_e, name: string, value: unknown) => player?.set(name, value))
ipcMain.handle('player:get', (_e, name: string) => player?.get(name))
ipcMain.handle('player:snapshot', () => player?.state)
ipcMain.on('player:bounds', (_e, b: Electron.Rectangle) => player?.setBounds(b.x, b.y, b.width, b.height))
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
ipcMain.handle('dialog:openFiles', async (_e, opts: { folders?: boolean; multiple?: boolean; title?: string } = {}) => {
  if (!win) return []
  const res = await dialog.showOpenDialog(win, {
    title: opts.title,
    properties: [opts.folders ? 'openDirectory' : 'openFile', ...(opts.multiple !== false ? (['multiSelections'] as const) : [])]
  })
  return res.canceled ? [] : res.filePaths
})
ipcMain.on('window:toggleFullscreen', () => win?.setFullScreen(!win.isFullScreen()))
ipcMain.handle('window:isFullscreen', () => win?.isFullScreen() ?? false)
ipcMain.on('window:alwaysOnTop', (_e, on: boolean) => win?.setAlwaysOnTop(on, 'floating'))
ipcMain.on('window:minimize', () => win?.minimize())
ipcMain.on('window:zoom', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
ipcMain.on('window:close', () => win?.close())

// Picture in picture: a small always-on-top window in the screen corner; restores afterwards.
let beforePip: { bounds: Electron.Rectangle; onTop: boolean } | null = null
ipcMain.on('window:pip', (_e, on: boolean) => {
  if (!win) return
  if (on && !beforePip) {
    if (win.isFullScreen()) win.setFullScreen(false)
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
  BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Escape: 'Esc'
}
function registerGlobalShortcuts(map: Record<string, string>): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  for (const [command, key] of Object.entries(map)) {
    const accel = key.split('+').map((p) => ACCEL[p] ?? p).join('+')
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
ipcMain.on('shell:openPath', (_e, path: string) => void shell.openPath(path))

// Library
ipcMain.handle('library:roots', () => library.roots())
ipcMain.handle('library:addRoot', (_e, path: string) => library.addRoot(path))
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
ipcMain.handle('library:deletePlaylist', (_e, id: number) => {
  library.db.deletePlaylist(id)
  scheduleLibraryNotice()
})
ipcMain.handle('library:exportPlaylist', async (_e, id: number) => {
  const pl = library.db.playlists().find((p) => p.id === id)
  if (!pl || !win) return
  const res = await dialog.showSaveDialog(win, { defaultPath: `${pl.name}.m3u8`, filters: [{ name: 'Playlist', extensions: ['m3u8'] }] })
  if (res.canceled || !res.filePath) return
  const { writeFile } = await import('node:fs/promises')
  await writeFile(res.filePath, ['#EXTM3U', `#PLAYLIST:${pl.name}`, ...library.db.playlistPaths(id)].join('\n') + '\n')
})
ipcMain.handle('library:bookmarks', (_e, path: string) => library.db.bookmarks(path))
ipcMain.handle('library:addBookmark', (_e, path: string, time: number, name: string) => library.db.addBookmark(path, time, name))
ipcMain.handle('library:removeBookmark', (_e, id: number) => library.db.removeBookmark(id))

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

app.whenReady().then(() => {
  protocol.handle('flp-media', (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname)
    return net.fetch(pathToFileURL(path).toString(), { headers: req.headers })
  })
  library.showHidden = !!settings.get('library.showHidden')
  library.recursive = settings.get('library.folderMode') !== 'flat'
  library.start()
  createWindow()
  registerGlobalShortcuts(settings.getUi<Record<string, string>>('globalShortcuts', {}))
})
app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('before-quit', () => {
  if (player) library.onStopped(player.state.time, player.state.duration, false)
  settings.flush()
})
