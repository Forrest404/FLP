import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { BRAND } from '@shared/brand'
import type { SettingsSnapshot } from '@shared/settings-store'
import { PlayerBridge } from './player'
import { Settings } from './settings'
import { applySettings } from './settings-apply'
import { scheduleSnapshot } from './dev-snapshot'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null
let player: PlayerBridge | null = null

app.setName(BRAND.name)
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
  win?.webContents.send('settings:changed', snapshot())
})
settings.on('ui-changed', (key: string) => {
  if (key !== 'lastVolume') win?.webContents.send('settings:changed', snapshot())
})

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
  })

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

  const query = process.env.FLP_QUERY ? `?${process.env.FLP_QUERY}` : ''
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
ipcMain.on('shell:showInFolder', (_e, path: string) => shell.showItemInFolder(path))
ipcMain.on('shell:openPath', (_e, path: string) => void shell.openPath(path))

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => settings.flush())
