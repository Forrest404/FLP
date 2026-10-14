import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { BRAND } from '@shared/brand'
import { PlayerBridge } from './player'
import { scheduleSnapshot } from './dev-snapshot'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null
let player: PlayerBridge | null = null

app.setName(BRAND.name)

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 640,
    minHeight: 400,
    title: BRAND.name,
    // Transparent so the mpv view underneath the web contents shows through the video area.
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 12 },
    show: false,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  player = new PlayerBridge(win)
  player.on('state', (patch) => win?.webContents.send('player:state', patch))

  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => {
    player?.destroy()
    player = null
    win = null
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(here, '../renderer/index.html'))

  // Dev convenience: FLP_OPEN=/path/to/file npm run dev
  const initial = process.env.FLP_OPEN
  if (initial) win.webContents.once('did-finish-load', () => player?.command(['loadfile', initial]))
  scheduleSnapshot(win, player)
}

ipcMain.handle('player:command', (_e, args: unknown[]) => player?.command(args))
ipcMain.handle('player:set', (_e, name: string, value: unknown) => player?.set(name, value))
ipcMain.handle('player:snapshot', () => player?.state)
ipcMain.handle('player:get', (_e, name: string) => player?.get(name))
ipcMain.on('player:bounds', (_e, b: { x: number; y: number; width: number; height: number }) =>
  player?.setBounds(b.x, b.y, b.width, b.height)
)
ipcMain.on('player:visible', (_e, visible: boolean) => player?.setVisible(visible))
ipcMain.handle('dialog:openFiles', async () => {
  if (!win) return []
  const res = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
  return res.canceled ? [] : res.filePaths
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
