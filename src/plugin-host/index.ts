// Plugin host: runs every enabled plugin in this separate process, so a plugin that crashes or
// hangs can't take playback down with it. Each plugin gets its own `flp` API object.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HostToMain, MainToHost, PluginManifest, PluginSettingDef } from '@shared/plugins'

const port = process.parentPort
const send = (msg: HostToMain) => port.postMessage(msg)

let nextReq = 1
const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>()

function request(pluginId: string, method: string, ...args: unknown[]): Promise<unknown> {
  const reqId = nextReq++
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject })
    send({ type: 'req', reqId, pluginId, method, args })
  })
}

type Listener = (data: any) => void
type Disposable = { dispose(): void }

interface Loaded {
  id: string
  module: { activate?: (flp: unknown) => unknown; deactivate?: () => unknown }
  commands: Map<string, (arg?: unknown) => unknown>
  listeners: Map<string, Set<Listener>>
  settingsListeners: Set<(values: Record<string, unknown>) => void>
  panelListeners: Map<string, Set<Listener>>
  settings: Record<string, unknown>
  disposers: (() => void)[]
}

const plugins = new Map<string, Loaded>()

function on(map: Map<string, Set<Listener>>, key: string, cb: Listener): Disposable {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key)!.add(cb)
  return { dispose: () => map.get(key)?.delete(cb) }
}

function makeApi(p: Loaded, manifest: PluginManifest, dir: string, dataDir: string) {
  const id = p.id
  const call = (method: string, ...args: unknown[]) => request(id, method, ...args)
  const perms = new Set(manifest.permissions ?? [])
  const storageFile = join(dataDir, `${id}.json`)
  let storage: Record<string, unknown> = {}
  try {
    storage = JSON.parse(readFileSync(storageFile, 'utf8'))
  } catch {
    /* first run */
  }
  const saveStorage = () => {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(storageFile, JSON.stringify(storage, null, 2))
  }
  const track = (d: Disposable): Disposable => {
    p.disposers.push(() => d.dispose())
    return d
  }

  return {
    plugin: { id, dir, version: manifest.version, name: manifest.name },
    log: (...a: unknown[]) => send({ type: 'log', pluginId: id, level: 'log', text: a.map(String).join(' ') }),

    player: {
      play: () => call('player.set', 'pause', false),
      pause: () => call('player.set', 'pause', true),
      toggle: () => call('player.command', ['cycle', 'pause']),
      stop: () => call('player.command', ['stop']),
      next: () => call('player.command', ['playlist-next', 'force']),
      previous: () => call('player.command', ['playlist-prev', 'force']),
      seek: (seconds: number, mode: 'absolute' | 'relative' = 'absolute') => call('player.command', ['seek', seconds, mode]),
      open: (paths: string | string[], opts: { append?: boolean } = {}) => call('player.open', Array.isArray(paths) ? paths : [paths], !!opts.append),
      get: (prop: string) => call('player.get', prop),
      set: (prop: string, value: unknown) => call('player.set', prop, value),
      command: (...args: unknown[]) => call('player.command', args),
      state: () => call('player.state'),
      /** Events: 'state' (any change), 'time', 'pause', 'file-loaded', 'ended'. */
      on: (event: string, cb: Listener) => track(on(p.listeners, event, cb))
    },

    commands: {
      register(cmd: { id: string; title: string; icon?: string; keys?: string[]; category?: string; run: (arg?: unknown) => unknown }) {
        if (!cmd?.id || typeof cmd.run !== 'function') throw new Error('commands.register needs { id, title, run }')
        const full = `${id}.${cmd.id}`
        p.commands.set(full, cmd.run)
        void call('commands.register', { id: full, title: cmd.title, icon: cmd.icon, keys: cmd.keys, category: cmd.category ?? manifest.name })
        return track({ dispose: () => {
          p.commands.delete(full)
          void call('commands.unregister', full)
        } })
      },
      run: (commandId: string, arg?: unknown) => call('commands.run', commandId, arg)
    },

    ui: {
      notify: (text: string, opts: { action?: { label: string; command: string } } = {}) => call('ui.notify', String(text), opts.action ?? null),
      osd: (text: string) => call('ui.osd', String(text)),
      addControlButton: (commandId: string) => {
        void call('ui.addControlButton', commandId.includes('.') ? commandId : `${id}.${commandId}`)
        return track({ dispose: () => void call('ui.removeControlButton', commandId) })
      },
      addContextMenuItem: (item: { label: string; command: string }) => {
        const command = item.command.includes('.') ? item.command : `${id}.${item.command}`
        void call('ui.addMenuItem', { label: item.label, command })
        return track({ dispose: () => void call('ui.removeMenuItem', command) })
      },
      /** A tab in the effects sidebar showing your HTML (sandboxed). Talk to it with postMessage. */
      addPanel(panel: { id: string; title: string; html?: string; file?: string }) {
        const html = panel.html ?? readFileSync(join(dir, panel.file ?? 'panel.html'), 'utf8')
        void call('ui.addPanel', { id: panel.id, title: panel.title, html })
        return track({
          dispose: () => void call('ui.removePanel', panel.id),
          postMessage: (data: unknown) => call('ui.panelMessage', panel.id, data),
          onMessage: (cb: Listener) => track(on(p.panelListeners, panel.id, cb))
        } as Disposable)
      }
    },

    settings: {
      define: (defs: PluginSettingDef[]) => call('settings.define', defs),
      get: <T = unknown>(key: string): T => p.settings[key] as T,
      set: (key: string, value: unknown) => call('settings.set', key, value),
      onChange: (cb: (values: Record<string, unknown>) => void) => {
        p.settingsListeners.add(cb)
        return track({ dispose: () => p.settingsListeners.delete(cb) })
      }
    },

    storage: {
      get: <T = unknown>(key: string, fallback?: T): T => (key in storage ? (storage[key] as T) : (fallback as T)),
      set: (key: string, value: unknown) => {
        storage[key] = value
        saveStorage()
      },
      delete: (key: string) => {
        delete storage[key]
        saveStorage()
      }
    },

    library: {
      search: (query: string) => call('library.search', query),
      recent: () => call('library.recent'),
      playlists: () => call('library.playlists'),
      createPlaylist: (name: string, paths: string[]) => call('library.createPlaylist', name, paths)
    },

    fetch: (input: string, init?: RequestInit) => {
      if (!perms.has('network')) return Promise.reject(new Error(`${manifest.name} needs the "network" permission in plugin.json to use flp.fetch`))
      return fetch(input, init)
    }
  }
}

/** Only plain data can cross processes; anything else (timers, functions…) becomes null. */
function cloneable(v: unknown): unknown {
  try {
    return structuredClone(v)
  } catch {
    return null
  }
}

async function load(msg: Extract<MainToHost, { type: 'load' }>['plugin']) {
  await unload(msg.id)
  const p: Loaded = {
    id: msg.id,
    module: {},
    commands: new Map(),
    listeners: new Map(),
    settingsListeners: new Set(),
    panelListeners: new Map(),
    settings: msg.settings,
    disposers: []
  }
  plugins.set(msg.id, p)
  try {
    // Cache-busting query so hot reload picks up edits.
    const url = `${pathToFileURL(join(msg.dir, msg.main)).href}?v=${Date.now()}`
    p.module = await import(url)
    const activate = p.module.activate ?? (p.module as { default?: { activate?: (f: unknown) => unknown } }).default?.activate
    if (typeof activate !== 'function') throw new Error(`${msg.main} must export an activate(flp) function`)
    await activate(makeApi(p, msg.manifest, msg.dir, msg.dataDir))
    send({ type: 'loaded', pluginId: msg.id })
  } catch (err) {
    send({ type: 'loaded', pluginId: msg.id, error: (err as Error)?.stack ?? String(err) })
  }
}

async function unload(id: string) {
  const p = plugins.get(id)
  if (!p) return
  plugins.delete(id)
  try {
    await p.module.deactivate?.()
  } catch (err) {
    send({ type: 'log', pluginId: id, level: 'error', text: `deactivate failed: ${(err as Error).message}` })
  }
  for (const d of p.disposers.splice(0)) {
    try {
      d()
    } catch {
      /* ignore */
    }
  }
}

function emit(p: Loaded, name: string, data: unknown) {
  for (const cb of p.listeners.get(name) ?? []) {
    try {
      cb(data)
    } catch (err) {
      send({ type: 'log', pluginId: p.id, level: 'error', text: `${name} handler: ${(err as Error).stack ?? err}` })
    }
  }
}

// Loads and unloads of one plugin run one after another, so a quick double reload can't leave
// a half-activated copy behind.
const queues = new Map<string, Promise<unknown>>()
function queued(id: string, job: () => Promise<unknown>) {
  const next = (queues.get(id) ?? Promise.resolve()).then(job, job)
  queues.set(id, next)
  return next
}

port.on('message', async (e: { data: MainToHost }) => {
  const msg = e.data
  switch (msg.type) {
    case 'load':
      return queued(msg.plugin.id, () => load(msg.plugin))
    case 'unload':
      return queued(msg.pluginId, () => unload(msg.pluginId))
    case 'reply': {
      const r = pending.get(msg.reqId)
      if (!r) return
      pending.delete(msg.reqId)
      if (msg.error) r.reject(new Error(msg.error))
      else r.resolve(msg.result)
      return
    }
    case 'event': {
      // Player state patches fan out to the friendlier per-field events.
      for (const p of plugins.values()) {
        const patch = msg.data as Record<string, unknown>
        if (msg.name === 'state') {
          emit(p, 'state', patch)
          if ('time' in patch) emit(p, 'time', patch.time)
          if ('paused' in patch) emit(p, 'pause', patch.paused)
        } else emit(p, msg.name, msg.data)
      }
      return
    }
    case 'invoke': {
      const p = plugins.get(msg.pluginId)
      const fn = p?.commands.get(msg.command)
      let result: unknown
      let error: string | undefined
      try {
        if (!fn) throw new Error(`Unknown command ${msg.command}`)
        result = await fn(msg.arg)
      } catch (err) {
        error = (err as Error).message
        send({ type: 'log', pluginId: msg.pluginId, level: 'error', text: `${msg.command}: ${(err as Error).stack ?? err}` })
      }
      send({ type: 'result', reqId: msg.reqId, result: cloneable(result), error })
      return
    }
    case 'settings': {
      const p = plugins.get(msg.pluginId)
      if (!p) return
      p.settings = msg.values
      for (const cb of p.settingsListeners) cb(msg.values)
      return
    }
    case 'panel-message': {
      const p = plugins.get(msg.pluginId)
      for (const cb of p?.panelListeners.get(msg.panelId) ?? []) cb(msg.data)
      return
    }
  }
})

// A plugin's stray promise rejection or exception must not kill the other plugins.
process.on('unhandledRejection', (err) => send({ type: 'log', pluginId: '?', level: 'error', text: `Unhandled: ${(err as Error)?.stack ?? err}` }))
process.on('uncaughtException', (err) => send({ type: 'log', pluginId: '?', level: 'error', text: `Uncaught: ${err.stack ?? err}` }))
