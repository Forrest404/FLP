import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'

function listen<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: unknown, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: RendererApi = {
  player: {
    command: (...args) => ipcRenderer.invoke('player:command', args),
    set: (name, value) => ipcRenderer.invoke('player:set', name, value),
    get: (name) => ipcRenderer.invoke('player:get', name),
    snapshot: () => ipcRenderer.invoke('player:snapshot'),
    setBounds: (b) => ipcRenderer.send('player:bounds', b),
    setVisible: (visible) => ipcRenderer.send('player:visible', visible),
    onState: (cb) => listen('player:state', cb)
  },
  settings: {
    snapshot: () => ipcRenderer.invoke('settings:snapshot'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    setMany: (patch) => ipcRenderer.invoke('settings:setMany', patch),
    resetAll: () => ipcRenderer.invoke('settings:resetAll'),
    setProfile: (id) => ipcRenderer.invoke('settings:setProfile', id),
    createProfile: (name) => ipcRenderer.invoke('settings:createProfile', name),
    deleteProfile: (id) => ipcRenderer.invoke('settings:deleteProfile', id),
    setUi: (key, value) => ipcRenderer.invoke('settings:setUi', key, value),
    onChange: (cb) => listen('settings:changed', cb)
  },
  dialog: {
    openFiles: (opts) => ipcRenderer.invoke('dialog:openFiles', opts)
  },
  window: {
    toggleFullscreen: () => ipcRenderer.send('window:toggleFullscreen'),
    isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
    onFullscreen: (cb) => listen('window:fullscreen', cb),
    setAlwaysOnTop: (on) => ipcRenderer.send('window:alwaysOnTop', on),
    minimize: () => ipcRenderer.send('window:minimize'),
    zoom: () => ipcRenderer.send('window:zoom'),
    close: () => ipcRenderer.send('window:close')
  },
  shell: {
    showInFolder: (path) => ipcRenderer.send('shell:showInFolder', path),
    openPath: (path) => ipcRenderer.send('shell:openPath', path)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('flp', api)
