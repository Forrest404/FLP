// Plugin manager: discovers plugins, runs them in the plugin-host utility process, answers their
// API requests, forwards player events, and hot-reloads plugins when their files change.
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { app, shell, utilityProcess, type UtilityProcess } from 'electron'
import {
  emptyContributions,
  pluginSettingKey,
  type HostToMain,
  type MainToHost,
  type PluginContributions,
  type PluginInfo,
  type PluginManifest,
  type PluginSettingDef
} from '@shared/plugins'
import type { PlayerBridge } from './player'
import type { Settings } from './settings'
import type { Library } from './library'

const here = fileURLToPath(new URL('.', import.meta.url))

/** Built-in examples that start enabled. */
const ENABLED_BY_DEFAULT = new Set(['sleep-timer', 'skip-intro'])

const RESERVED_IDS = new Set(['app', 'audio', 'fx', 'library', 'media', 'network', 'playback', 'player', 'playlist', 'plugins', 'settings', 'shortcuts', 'subtitles', 'ui', 'video', 'vfx', 'flp'])

export class PluginManager extends EventEmitter {
  plugins = new Map<string, PluginInfo>()
  contributions: PluginContributions = emptyContributions()
  logs: { pluginId: string; level: string; text: string; at: number }[] = []
  private host: UtilityProcess | null = null
  private restarts: number[] = []
  private watchers = new Map<string, FSWatcher>()
  private reloadTimers = new Map<string, NodeJS.Timeout>()
  private pendingInvokes = new Map<number, (r: { result?: unknown; error?: string }) => void>()
  private nextInvoke = 1
  private lastTime = 0

  readonly userDir = join(app.getPath('userData'), 'plugins')
  readonly dataDir = join(app.getPath('userData'), 'plugin-data')
  readonly builtInDir = app.isPackaged ? join(process.resourcesPath, 'plugins') : join(app.getAppPath(), 'plugins-examples')

  constructor(
    private settings: Settings,
    private getPlayer: () => PlayerBridge | null,
    private library: Library,
    /** Sends a message to the renderer. */
    private toRenderer: (channel: string, ...args: unknown[]) => void
  ) {
    super()
  }

  async start(): Promise<void> {
    await mkdir(this.userDir, { recursive: true })
    await this.discover()
    if (this.settings.get('extensions.loadOnStartup') !== false) this.startHost()
    this.watchUserDir()
  }

  // ── Discovery ──

  private async readManifest(dir: string): Promise<PluginManifest | null> {
    try {
      const m = JSON.parse(await readFile(join(dir, 'plugin.json'), 'utf8')) as PluginManifest
      if (!m.id || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) throw new Error('plugin.json needs an "id" of lowercase letters, numbers and dashes')
      // Plugin commands are "<id>.<name>", so an id like "player" could replace built-in commands.
      if (RESERVED_IDS.has(m.id)) throw new Error(`"${m.id}" is used by FLP itself; pick another id`)
      if (!m.name) m.name = m.id
      if (!m.version) m.version = '0.0.0'
      return m
    } catch (err) {
      this.log(basename(dir), 'error', `Can't read plugin.json: ${(err as Error).message}`)
      return null
    }
  }

  async discover(): Promise<void> {
    const enabledMap = this.settings.getUi<Record<string, boolean>>('plugins', {})
    const found = new Map<string, PluginInfo>()
    for (const [root, builtIn] of [[this.builtInDir, true], [this.userDir, false]] as const) {
      const names = await readdir(root).catch(() => [] as string[])
      for (const name of names) {
        const dir = join(root, name)
        if (!(await stat(dir).catch(() => null))?.isDirectory() || !existsSync(join(dir, 'plugin.json'))) continue
        const manifest = await this.readManifest(dir)
        if (!manifest) continue
        // A user copy overrides the built-in one with the same id.
        const enabled = enabledMap[manifest.id] ?? (builtIn ? ENABLED_BY_DEFAULT.has(manifest.id) : true)
        const prev = this.plugins.get(manifest.id)
        found.set(manifest.id, { id: manifest.id, dir, manifest, enabled, builtIn, status: prev?.status ?? 'stopped', error: prev?.error })
      }
    }
    this.plugins = found
    this.emitList()
  }

  list(): PluginInfo[] {
    return [...this.plugins.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  }

  private emitList() {
    this.toRenderer('plugins:list', this.list())
  }

  private emitContributions() {
    this.toRenderer('plugins:contributions', this.contributions)
  }

  // ── Host process ──

  private startHost(): void {
    if (this.host) return
    const host = utilityProcess.fork(join(here, 'plugin-host.js'), [], { serviceName: 'FLP Plugins', stdio: 'pipe' })
    this.host = host
    host.stdout?.on('data', (d) => process.stdout.write(`[plugins] ${d}`))
    host.stderr?.on('data', (d) => process.stderr.write(`[plugins] ${d}`))
    host.on('message', (msg: HostToMain) => void this.onHostMessage(msg, host))
    host.on('exit', (code) => {
      if (this.host !== host) return
      this.host = null
      this.contributions = emptyContributions()
      this.emitContributions()
      for (const p of this.plugins.values()) if (p.status === 'running') p.status = 'stopped'
      this.emitList()
      if (code === 0) return
      // Crashed: restart, but give up if it keeps crashing.
      const now = Date.now()
      this.restarts = [...this.restarts.filter((t) => now - t < 60000), now]
      this.log('host', 'error', `Plugin process exited (${code}).${this.restarts.length > 3 ? ' Too many crashes; plugins stopped.' : ' Restarting…'}`)
      if (this.restarts.length <= 3) setTimeout(() => this.startHost(), 1000)
    })
    for (const p of this.plugins.values()) if (p.enabled) this.loadPlugin(p)
  }

  stopHost(): void {
    const host = this.host
    this.host = null
    host?.kill()
    this.contributions = emptyContributions()
    this.emitContributions()
  }

  private send(msg: MainToHost) {
    this.host?.postMessage(msg)
  }

  private settingsFor(id: string): Record<string, unknown> {
    const prefix = pluginSettingKey(id, '')
    const out: Record<string, unknown> = {}
    for (const def of this.contributions.settings[id] ?? []) out[def.key] = def.default
    for (const [k, v] of Object.entries(this.settings.values())) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v
    return out
  }

  private loadPlugin(p: PluginInfo): void {
    if (!this.host) return
    this.clearContributions(p.id)
    this.send({
      type: 'load',
      plugin: { id: p.id, dir: p.dir, main: p.manifest.main ?? 'main.js', manifest: p.manifest, settings: this.settingsFor(p.id), dataDir: this.dataDir }
    })
  }

  private clearContributions(id: string) {
    const c = this.contributions
    this.contributions = {
      commands: c.commands.filter((x) => x.pluginId !== id),
      controlButtons: c.controlButtons.filter((x) => x.pluginId !== id),
      menuItems: c.menuItems.filter((x) => x.pluginId !== id),
      panels: c.panels.filter((x) => x.pluginId !== id),
      settings: Object.fromEntries(Object.entries(c.settings).filter(([k]) => k !== id))
    }
    this.emitContributions()
  }

  // ── Requests from plugins ──

  private async onHostMessage(msg: HostToMain, host: UtilityProcess): Promise<void> {
    if (msg.type === 'log') return this.log(msg.pluginId, msg.level, msg.text)
    if (msg.type === 'loaded') {
      const p = this.plugins.get(msg.pluginId)
      if (p) {
        p.status = msg.error ? 'error' : 'running'
        p.error = msg.error
        if (msg.error) this.log(p.id, 'error', msg.error)
        this.emitList()
      }
      return
    }
    if (msg.type === 'result') {
      this.pendingInvokes.get(msg.reqId)?.(msg)
      this.pendingInvokes.delete(msg.reqId)
      return
    }
    let result: unknown = null
    let error: string | undefined
    try {
      result = await this.handle(msg.pluginId, msg.method, msg.args)
    } catch (err) {
      error = (err as Error).message
    }
    // Request ids restart with each host process, so never answer a crashed host's request to the new one.
    if (host === this.host) host.postMessage({ type: 'reply', reqId: msg.reqId, result, error } satisfies MainToHost)
  }

  private async handle(pluginId: string, method: string, args: unknown[]): Promise<unknown> {
    const player = this.getPlayer()
    const info = this.plugins.get(pluginId)
    const c = this.contributions
    switch (method) {
      case 'player.command':
        return player?.command(args[0] as unknown[])
      case 'player.get':
        return player?.get(String(args[0]))
      case 'player.set':
        return player?.set(String(args[0]), args[1])
      case 'player.state':
        return player?.state
      case 'player.open': {
        const [paths, append] = args as [string[], boolean]
        for (let i = 0; i < paths.length; i++) await player?.command(['loadfile', paths[i], append || i > 0 ? 'append-play' : 'replace'])
        this.toRenderer('ui:view', 'player')
        return null
      }
      case 'commands.register': {
        const cmd = args[0] as { id: string; title: string; icon?: string; keys?: string[]; category?: string }
        this.contributions = { ...c, commands: [...c.commands.filter((x) => x.id !== cmd.id), { pluginId, ...cmd }] }
        this.emitContributions()
        return null
      }
      case 'commands.unregister':
        this.contributions = { ...c, commands: c.commands.filter((x) => x.id !== args[0]) }
        this.emitContributions()
        return null
      case 'commands.run':
        this.toRenderer('command:run', args[0], args[1])
        return null
      case 'ui.notify':
        this.toRenderer('plugins:notify', info?.manifest.name ?? pluginId, args[0], args[1])
        return null
      case 'ui.osd':
        this.toRenderer('plugins:osd', args[0])
        return null
      case 'ui.addControlButton':
        this.contributions = { ...c, controlButtons: [...c.controlButtons.filter((x) => x.command !== args[0]), { pluginId, command: String(args[0]) }] }
        this.emitContributions()
        return null
      case 'ui.removeControlButton':
        this.contributions = { ...c, controlButtons: c.controlButtons.filter((x) => !(x.pluginId === pluginId && x.command.endsWith(String(args[0])))) }
        this.emitContributions()
        return null
      case 'ui.addMenuItem': {
        const item = args[0] as { label: string; command: string }
        this.contributions = { ...c, menuItems: [...c.menuItems.filter((x) => x.command !== item.command), { pluginId, ...item }] }
        this.emitContributions()
        return null
      }
      case 'ui.removeMenuItem':
        this.contributions = { ...c, menuItems: c.menuItems.filter((x) => x.command !== args[0]) }
        this.emitContributions()
        return null
      case 'ui.addPanel': {
        const panel = args[0] as { id: string; title: string; html: string }
        this.contributions = { ...c, panels: [...c.panels.filter((x) => !(x.pluginId === pluginId && x.id === panel.id)), { pluginId, ...panel }] }
        this.emitContributions()
        return null
      }
      case 'ui.removePanel':
        this.contributions = { ...c, panels: c.panels.filter((x) => !(x.pluginId === pluginId && x.id === args[0])) }
        this.emitContributions()
        return null
      case 'ui.panelMessage':
        this.toRenderer('plugins:panel-message', pluginId, args[0], args[1])
        return null
      case 'settings.define': {
        this.contributions = { ...c, settings: { ...c.settings, [pluginId]: args[0] as PluginSettingDef[] } }
        this.emitContributions()
        this.send({ type: 'settings', pluginId, values: this.settingsFor(pluginId) })
        return null
      }
      case 'settings.set':
        this.settings.set(pluginSettingKey(pluginId, String(args[0])), args[1])
        return null
      case 'library.search':
        return this.library.search(String(args[0]), 'all')
      case 'library.recent':
        return this.library.recent(50)
      case 'library.playlists':
        return this.library.db.playlists()
      case 'library.createPlaylist':
        return this.library.db.createPlaylist(String(args[0]), args[1] as string[])
      default:
        throw new Error(`Unknown plugin API method ${method}`)
    }
  }

  // ── Calls from the app ──

  /** Runs a plugin command (from a menu, shortcut, button…). */
  invoke(pluginId: string, command: string, arg?: unknown): Promise<{ result?: unknown; error?: string }> {
    if (!this.host) return Promise.resolve({ error: 'Plugins are not running' })
    const reqId = this.nextInvoke++
    return new Promise((resolve) => {
      this.pendingInvokes.set(reqId, resolve)
      this.send({ type: 'invoke', pluginId, command, arg, reqId })
      setTimeout(() => {
        if (this.pendingInvokes.delete(reqId)) resolve({ error: 'The plugin took too long to respond' })
      }, 30000)
    })
  }

  panelMessage(pluginId: string, panelId: string, data: unknown) {
    this.send({ type: 'panel-message', pluginId, panelId, data })
  }

  /** Player state patches → plugins (time throttled to 4 Hz). */
  playerState(patch: Record<string, unknown>) {
    if (!this.host) return
    if ('time' in patch && Object.keys(patch).length === 1) {
      const now = Date.now()
      if (now - this.lastTime < 250) return
      this.lastTime = now
    }
    this.send({ type: 'event', name: 'state', data: patch })
  }

  playerEvent(name: 'file-loaded' | 'ended', data: unknown) {
    this.send({ type: 'event', name, data })
  }

  settingsChanged(keys: string[]) {
    const ids = new Set(keys.filter((k) => k.startsWith('plugin.')).map((k) => k.split('.')[1]))
    for (const id of ids) this.send({ type: 'settings', pluginId: id, values: this.settingsFor(id) })
    if (keys.includes('extensions.loadOnStartup') && this.settings.get('extensions.loadOnStartup') && !this.host) this.startHost()
  }

  setEnabled(id: string, enabled: boolean) {
    const p = this.plugins.get(id)
    if (!p) return
    p.enabled = enabled
    this.settings.setUi('plugins', { ...this.settings.getUi<Record<string, boolean>>('plugins', {}), [id]: enabled })
    if (enabled) {
      if (!this.host) this.startHost()
      else this.loadPlugin(p)
    } else {
      this.send({ type: 'unload', pluginId: id })
      this.clearContributions(id)
      p.status = 'stopped'
      p.error = undefined
    }
    this.emitList()
  }

  async reload(id?: string) {
    await this.discover()
    if (!this.host) return this.startHost()
    for (const p of this.plugins.values()) {
      if (id && p.id !== id) continue
      if (p.enabled) this.loadPlugin(p)
    }
  }

  /** Copies a plugin folder into the user plugins folder. */
  async install(dir: string): Promise<string> {
    const manifest = await this.readManifest(dir)
    if (!manifest) throw new Error('That folder has no valid plugin.json')
    const target = join(this.userDir, manifest.id)
    if (existsSync(target)) await shell.trashItem(target)
    await cp(dir, target, { recursive: true })
    await this.discover()
    this.setEnabled(manifest.id, true)
    return manifest.id
  }

  /** Moves a user plugin to the Trash (recoverable). */
  async remove(id: string) {
    const p = this.plugins.get(id)
    if (!p || p.builtIn) throw new Error('Built-in plugins can be disabled but not removed')
    this.setEnabled(id, false)
    await shell.trashItem(p.dir)
    await this.discover()
  }

  /** Scaffolds a working plugin and returns its folder. */
  async create(name: string): Promise<string> {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-plugin'
    let dir = join(this.userDir, id)
    for (let i = 2; existsSync(dir); i++) dir = join(this.userDir, `${id}-${i}`)
    const finalId = basename(dir)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'plugin.json'), JSON.stringify({ id: finalId, name, version: '1.0.0', description: 'Describe what your plugin does.', main: 'main.js', permissions: [] }, null, 2) + '\n')
    await writeFile(join(dir, 'main.js'), TEMPLATE(name, finalId))
    const types = join(this.builtInDir, '..', 'docs', 'plugin-api.d.ts')
    if (existsSync(types)) await cp(types, join(dir, 'plugin-api.d.ts'))
    await this.discover()
    this.setEnabled(finalId, true)
    return dir
  }

  private watchUserDir() {
    try {
      const w = watch(this.userDir, { recursive: true }, (_e, file) => {
        if (!file) return
        const id = String(file).split('/')[0]
        clearTimeout(this.reloadTimers.get(id))
        // Hot reload: re-read manifests and restart just the edited plugin.
        this.reloadTimers.set(id, setTimeout(async () => {
          await this.discover()
          const p = [...this.plugins.values()].find((x) => basename(x.dir) === id)
          if (p?.enabled && this.host) {
            this.loadPlugin(p)
            this.log(p.id, 'log', 'Reloaded after a file change')
          }
        }, 300))
      })
      this.watchers.set(this.userDir, w)
    } catch {
      /* not watchable */
    }
  }

  private log(pluginId: string, level: string, text: string) {
    const entry = { pluginId, level, text, at: Date.now() }
    this.logs = [...this.logs.slice(-299), entry]
    const line = `[plugin:${pluginId}] ${text}`
    if (level === 'error') console.error(line)
    else console.log(line)
    this.toRenderer('plugins:log', entry)
  }

  dispose() {
    for (const w of this.watchers.values()) w.close()
    this.stopHost()
  }
}

const TEMPLATE = (name: string, id: string) => `// ${name} — an FLP plugin.
// Save this file and FLP reloads the plugin instantly. Docs: Settings → Extensions → "Plugin guide".
// Tip: the bundled plugin-api.d.ts gives your editor autocomplete for \`flp\`.

/** @param {import('./plugin-api').FLP} flp */
export function activate(flp) {
  // A command shows up in the menus, the ⌘K palette, Keyboard Shortcuts and Customize Player.
  flp.commands.register({
    id: 'hello',
    title: 'Say hello',
    icon: 'info',
    run: async () => {
      const state = await flp.player.state()
      flp.ui.notify(state.title ? \`Now playing: \${state.title}\` : 'Hello from ${name}!')
    }
  })

  // Settings appear automatically under Settings → Extensions.
  flp.settings.define([{ key: 'greeting', label: 'Greeting', type: 'text', default: 'Hello!' }])

  // React to playback.
  flp.player.on('file-loaded', () => flp.log('A new file started'))
}

export function deactivate() {
  // Optional: clean up timers etc. Commands, buttons and listeners are removed for you.
}
`
