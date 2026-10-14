import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
    setCornerRadius: (radius) => ipcRenderer.send('player:radius', radius),
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
    pip: (on) => ipcRenderer.send('window:pip', on),
    zoom: () => ipcRenderer.send('window:zoom'),
    close: () => ipcRenderer.send('window:close')
  },
  media: {
    thumbnail: (path, time) => ipcRenderer.invoke('media:thumbnail', path, time),
    waveform: (path) => ipcRenderer.invoke('media:waveform', path),
    tags: (path) => ipcRenderer.invoke('media:tags', path),
    displayableImage: (path) => ipcRenderer.invoke('media:image', path),
    poster: (path, duration) => ipcRenderer.invoke('media:poster', path, duration)
  },
  library: {
    roots: () => ipcRenderer.invoke('library:roots'),
    addRoot: (path) => ipcRenderer.invoke('library:addRoot', path),
    removeRoot: (path) => ipcRenderer.invoke('library:removeRoot', path),
    rescan: () => ipcRenderer.invoke('library:rescan'),
    status: () => ipcRenderer.invoke('library:status'),
    browse: (kind, dir, sort) => ipcRenderer.invoke('library:browse', kind, dir, sort),
    search: (q, kind) => ipcRenderer.invoke('library:search', q, kind),
    home: () => ipcRenderer.invoke('library:home'),
    recent: () => ipcRenderer.invoke('library:recent'),
    favorites: () => ipcRenderer.invoke('library:favorites'),
    music: (view, filter, sort) => ipcRenderer.invoke('library:music', view, filter, sort),
    poster: (id) => ipcRenderer.invoke('library:poster', id),
    item: (path) => ipcRenderer.invoke('library:item', path),
    setFavorite: (path, on) => ipcRenderer.invoke('library:setFavorite', path, on),
    setWatched: (path, on) => ipcRenderer.invoke('library:setWatched', path, on),
    clearHistory: () => ipcRenderer.invoke('library:clearHistory'),
    playlists: () => ipcRenderer.invoke('library:playlists'),
    createPlaylist: (name, paths, cover) => ipcRenderer.invoke('library:createPlaylist', name, paths, cover ?? null),
    playlistPaths: (id) => ipcRenderer.invoke('library:playlistPaths', id),
    addToPlaylist: (id, paths) => ipcRenderer.invoke('library:addToPlaylist', id, paths),
    setPlaylistPaths: (id, paths) => ipcRenderer.invoke('library:setPlaylistPaths', id, paths),
    renamePlaylist: (id, name) => ipcRenderer.invoke('library:renamePlaylist', id, name),
    deletePlaylist: (id) => ipcRenderer.invoke('library:deletePlaylist', id),
    exportPlaylist: (id) => ipcRenderer.invoke('library:exportPlaylist', id),
    bookmarks: (path) => ipcRenderer.invoke('library:bookmarks', path),
    addBookmark: (path, time, name) => ipcRenderer.invoke('library:addBookmark', path, time, name),
    removeBookmark: (id) => ipcRenderer.invoke('library:removeBookmark', id),
    onChanged: (cb) => listen('library:changed', cb),
    onStatus: (cb) => listen('library:status', cb)
  },
  onResumeOffer: (cb) => listen('player:resume-offer', cb),
  menu: {
    set: (specs) => ipcRenderer.send('menu:set', specs),
    onCommand: (cb) => listen('command:run', cb)
  },
  app: {
    homeDir: () => ipcRenderer.invoke('app:homeDir')
  },
  shell: {
    showInFolder: (path) => ipcRenderer.send('shell:showInFolder', path),
    openPath: (path) => ipcRenderer.send('shell:openPath', path)
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
  platform: process.platform
}

contextBridge.exposeInMainWorld('flp', api)
