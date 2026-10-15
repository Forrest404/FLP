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
    renameProfile: (id, name) => ipcRenderer.invoke('settings:renameProfile', id, name),
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
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    contributions: () => ipcRenderer.invoke('plugins:contributions'),
    logs: () => ipcRenderer.invoke('plugins:logs'),
    setEnabled: (id, on) => ipcRenderer.invoke('plugins:setEnabled', id, on),
    reload: (id) => ipcRenderer.invoke('plugins:reload', id),
    invoke: (pluginId, command, arg) => ipcRenderer.invoke('plugins:invoke', pluginId, command, arg),
    panelMessage: (pluginId, panelId, data) => ipcRenderer.send('plugins:panelMessage', pluginId, panelId, data),
    install: () => ipcRenderer.invoke('plugins:install'),
    remove: (id) => ipcRenderer.invoke('plugins:remove', id),
    create: (name) => ipcRenderer.invoke('plugins:create', name),
    openFolder: () => ipcRenderer.send('plugins:openFolder'),
    openGuide: () => ipcRenderer.send('plugins:openGuide'),
    onList: (cb) => listen('plugins:list', cb),
    onContributions: (cb) => listen('plugins:contributions', cb),
    onNotify: (cb) => {
      const l = (_e: unknown, plugin: string, text: string, action: { label: string; command: string } | null) => cb(plugin, text, action)
      ipcRenderer.on('plugins:notify', l)
      return () => ipcRenderer.removeListener('plugins:notify', l)
    },
    onOsd: (cb) => listen('plugins:osd', cb),
    onPanelMessage: (cb) => {
      const l = (_e: unknown, pluginId: string, panelId: string, data: unknown) => cb(pluginId, panelId, data)
      ipcRenderer.on('plugins:panel-message', l)
      return () => ipcRenderer.removeListener('plugins:panel-message', l)
    },
    onLog: (cb) => listen('plugins:log', cb)
  },
  sources: {
    discs: () => ipcRenderer.invoke('sources:discs'),
    dvdTitles: (path) => ipcRenderer.invoke('sources:dvdTitles', path),
    capture: () => ipcRenderer.invoke('sources:capture'),
    captureUrl: (v, a) => ipcRenderer.invoke('sources:captureUrl', v, a),
    mediaInfo: (path) => ipcRenderer.invoke('sources:mediaInfo', path),
    networkShares: () => ipcRenderer.invoke('sources:networkShares'),
    connectServer: (url) => ipcRenderer.send('sources:connectServer', url)
  },
  jobs: {
    presets: () => ipcRenderer.invoke('jobs:presets'),
    list: () => ipcRenderer.invoke('jobs:list'),
    convert: (inputs, opts) => ipcRenderer.invoke('jobs:convert', inputs, opts),
    stream: (input, target, udp) => ipcRenderer.invoke('jobs:stream', input, target, udp),
    cancel: (id) => ipcRenderer.invoke('jobs:cancel', id),
    clear: () => ipcRenderer.invoke('jobs:clear'),
    onList: (cb) => listen('jobs:list', cb)
  },
  upnp: {
    discover: (kind) => ipcRenderer.invoke('upnp:discover', kind),
    browse: (device, id) => ipcRenderer.invoke('upnp:browse', device, id)
  },
  cast: {
    start: (device) => ipcRenderer.invoke('cast:start', device),
    control: (action) => ipcRenderer.invoke('cast:control', action),
    stop: () => ipcRenderer.invoke('cast:stop')
  },
  feeds: {
    stations: (q) => ipcRenderer.invoke('feeds:stations', q),
    podcast: (url) => ipcRenderer.invoke('feeds:podcast', url)
  },
  remote: {
    info: () => ipcRenderer.invoke('remote:info')
  },
  onView: (cb) => listen('ui:view', cb),
  onResumeOffer: (cb) => listen('player:resume-offer', cb),
  menu: {
    set: (specs) => ipcRenderer.send('menu:set', specs),
    onCommand: (cb) => {
      const l = (_e: unknown, id: string, arg?: unknown) => cb(id, arg)
      ipcRenderer.on('command:run', l)
      return () => ipcRenderer.removeListener('command:run', l)
    }
  },
  app: {
    homeDir: () => ipcRenderer.invoke('app:homeDir'),
    displays: () => ipcRenderer.invoke('app:displays'),
    opticalDrives: () => ipcRenderer.invoke('app:opticalDrives'),
    openConfigFolder: () => ipcRenderer.send('app:openConfigFolder'),
    registerGlobalShortcuts: (map) => ipcRenderer.invoke('app:globalShortcuts', map)
  },
  subs: {
    listVideos: (dir) => ipcRenderer.invoke('subs:listVideos', dir),
    install: (pairs, overwrite) => ipcRenderer.invoke('subs:install', pairs, overwrite)
  },
  shell: {
    showInFolder: (path) => ipcRenderer.send('shell:showInFolder', path),
    openExternal: (url) => ipcRenderer.send('shell:openExternal', url),
    openPath: (path) => ipcRenderer.send('shell:openPath', path)
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
  platform: process.platform
}

contextBridge.exposeInMainWorld('flp', api)
