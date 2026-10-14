import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, shell, type MenuItemConstructorOptions } from 'electron'
import { BRAND } from '@shared/brand'
import type { SettingsSnapshot } from '@shared/settings-store'
import { PlayerBridge } from './player'
import { Settings } from './settings'
import { applySettings } from './settings-apply'
import { scheduleSnapshot } from './dev-snapshot'
import { displayableImage, posterFor, readTags, thumbnailAt, waveform } from './media-tools'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null
let player: PlayerBridge | null = null

app.setName(BRAND.name)

// flp-media://file/<absolute path> serves local files (images, covers, posters) to the UI.
protocol.registerSchemesAsPrivileged([
  { scheme: 'flp-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
])
const settings = new Settings()

function snapshot(): SettingsSnapshot {
  return {
    values: settings.values(),
    activeProfile: settings.data.activeProfile,
    profiles: Object.entries(settings.data.profiles).map(([id, p]) => ({ id, name: p.name })),
    ui: settings.data.ui
  }
}

settings.on('changed', (keys: string[]) => {
  if (player) applySettings(player, settings.values(), keys)
  if (keys.includes('interface.opacity')) win?.setOpacity(Number(settings.get('interface.opacity') ?? 100) / 100)
  win?.webContents.send('settings:changed', snapshot())
})
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
  player.set(
    'volume',
    settings.get('audio.rememberVolume') ? settings.getUi('lastVolume', 100) : settings.get('audio.startupVolume')
  )
  player.on('state', (patch) => {
    win?.webContents.send('player:state', patch)
    if ('volume' in patch && settings.get('audio.rememberVolume')) settings.setUi('lastVolume', patch.volume)
    if (patch.path && settings.get('privacy.saveRecent')) rememberRecent(patch.path)
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
  if (initial) win.webContents.once('did-finish-load', () => player?.command(['loadfile', initial]))
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
ipcMain.on('shell:showInFolder', (_e, path: string) => shell.showItemInFolder(path))
ipcMain.on('shell:openPath', (_e, path: string) => void shell.openPath(path))

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
  createWindow()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => settings.flush())
