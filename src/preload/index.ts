import { contextBridge, ipcRenderer } from 'electron'
import type { PlayerState, RendererApi } from '@shared/player'

const api: RendererApi = {
  player: {
    command: (...args) => ipcRenderer.invoke('player:command', args),
    set: (name, value) => ipcRenderer.invoke('player:set', name, value),
    get: (name) => ipcRenderer.invoke('player:get', name),
    snapshot: () => ipcRenderer.invoke('player:snapshot'),
    setBounds: (b) => ipcRenderer.send('player:bounds', b),
    setVisible: (visible) => ipcRenderer.send('player:visible', visible),
    onState: (cb) => {
      const listener = (_e: unknown, patch: Partial<PlayerState>) => cb(patch)
      ipcRenderer.on('player:state', listener)
      return () => ipcRenderer.removeListener('player:state', listener)
    }
  },
  dialog: {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles')
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('flp', api)
