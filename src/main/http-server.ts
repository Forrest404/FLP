// Built-in web server: stream-out (HLS), files for casting, and the web remote.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, sep } from 'node:path'
import type { PlayerBridge } from './player'
import type { JobQueue } from './convert'

export const MIME: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.aiff': 'audio/aiff', '.alac': 'audio/mp4', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.wmv': 'video/x-ms-wmv'
}

export function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) return a.address
  }
  return '127.0.0.1'
}

export class HttpServer {
  private server: Server | null = null
  port = 0
  private casts = new Map<string, string>()
  remoteEnabled = false
  remotePassword = ''

  constructor(private getPlayer: () => PlayerBridge | null, private jobs: JobQueue) {}

  async ensure(port: number): Promise<void> {
    if (this.server && this.port === port) return
    await this.stop()
    this.server = createServer((req, res) => void this.route(req, res).catch(() => this.send(res, 500, 'Server error')))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(port, '0.0.0.0', () => resolve())
    })
    this.port = port
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise((r) => this.server!.close(() => r(null)))
    this.server = null
    this.port = 0
  }

  url(path: string): string {
    return `http://${lanAddress()}:${this.port}${path}`
  }

  /** Makes a local file reachable for a TV / speaker; returns its URL. Only recent shares stay valid. */
  shareFile(path: string): string {
    const token = randomBytes(12).toString('base64url')
    this.casts.set(token, path)
    while (this.casts.size > 20) this.casts.delete(this.casts.keys().next().value!)
    return this.url(`/cast/${token}${extname(path)}`)
  }

  private send(res: ServerResponse, code: number, body: string, type = 'text/plain; charset=utf-8') {
    res.writeHead(code, { 'content-type': type })
    res.end(body)
  }

  /** Streams a file, honouring Range requests (TVs seek this way). */
  private sendFile(req: IncomingMessage, res: ServerResponse, path: string) {
    if (!existsSync(path) || !statSync(path).isFile()) return this.send(res, 404, 'Not found')
    const size = statSync(path).size
    const pipe = (start?: number, end?: number) => {
      const stream = createReadStream(path, start === undefined ? undefined : { start, end })
      stream.on('error', () => res.destroy())
      stream.pipe(res)
    }
    const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
    const headers: Record<string, string | number> = {
      'content-type': type, 'accept-ranges': 'bytes', 'access-control-allow-origin': '*',
      'transferMode.dlna.org': 'Streaming', 'contentFeatures.dlna.org': 'DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000'
    }
    if (range && (range[1] || range[2])) {
      // "bytes=-500" means the last 500 bytes.
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      if (start >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` })
        return res.end()
      }
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
      if (req.method === 'HEAD') return res.end()
      pipe(start, end)
    } else {
      res.writeHead(200, { ...headers, 'content-length': size })
      if (req.method === 'HEAD') return res.end()
      pipe()
    }
  }

  private authorized(req: IncomingMessage, url: URL): boolean {
    if (!this.remotePassword) return true
    const given = url.searchParams.get('key') ?? Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':')
    const a = Buffer.from(given)
    const b = Buffer.from(this.remotePassword)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private async route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x')
    const parts = url.pathname.split('/').filter(Boolean)

    if (parts[0] === 'stream') {
      const dir = this.jobs.streamDirForToken(parts[1] ?? '')
      if (!dir) return this.send(res, 404, 'No such stream')
      const file = normalize(join(dir, parts.slice(2).join('/')))
      if (!file.startsWith(dir + sep)) return this.send(res, 403, 'Forbidden')
      return this.sendFile(req, res, file)
    }

    if (parts[0] === 'cast') {
      const path = this.casts.get((parts[1] ?? '').replace(/\.[^.]+$/, ''))
      return path ? this.sendFile(req, res, path) : this.send(res, 404, 'Not found')
    }

    if (!this.remoteEnabled) return this.send(res, 404, 'The web remote is turned off in FLP Settings → Controls.')
    // Block other websites from driving the remote through the user's browser.
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host) return this.send(res, 403, 'Forbidden')
    if (!this.authorized(req, url)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="FLP Remote"' })
      return res.end('Password required')
    }
    const player = this.getPlayer()
    if (url.pathname === '/' || url.pathname === '/remote') return this.send(res, 200, REMOTE_PAGE, 'text/html; charset=utf-8')
    if (url.pathname === '/api/state') {
      const s = player?.state
      return this.send(res, 200, JSON.stringify(s ? { title: s.title, path: s.path, paused: s.paused, time: s.time, duration: s.duration, volume: s.volume, muted: s.muted, idle: s.idle } : {}), 'application/json')
    }
    if (url.pathname === '/api/command' && req.method === 'POST') {
      // A custom header can't be sent cross-site without a CORS preflight, which we never allow.
      if (req.headers['x-flp-remote'] !== '1') return this.send(res, 403, 'Forbidden')
      const body = await new Promise<string>((r) => {
        let d = ''
        req.on('data', (c) => (d += c))
        req.on('end', () => r(d))
      })
      const { action, value } = JSON.parse(body || '{}') as { action: string; value?: number }
      const commands: Record<string, unknown[]> = {
        toggle: ['cycle', 'pause'], next: ['playlist-next', 'force'], previous: ['playlist-prev', 'force'], stop: ['stop'],
        back: ['seek', -10, 'relative'], forward: ['seek', 10, 'relative'], mute: ['cycle', 'mute'],
        seek: ['seek', Number(value) || 0, 'absolute-percent'], volume: ['set', 'volume', String(Math.max(0, Math.min(130, Number(value) || 0)))]
      }
      if (!commands[action]) return this.send(res, 400, 'Unknown action')
      await player?.command(commands[action]).catch(() => null)
      return this.send(res, 200, 'ok')
    }
    return this.send(res, 404, 'Not found')
  }
}

const REMOTE_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FLP Remote</title>
<style>
:root{color-scheme:dark;--a:#1f9a3a}body{margin:0;font:16px -apple-system,system-ui,sans-serif;background:#0e0e0e;color:#ddd;display:grid;gap:22px;padding:28px 20px;max-width:480px;margin:auto}
h1{font-size:15px;color:#8f8f8f;font-weight:500;margin:0}#title{font-size:20px;color:#eee;min-height:1.3em;word-break:break-word}
.row{display:flex;gap:10px;justify-content:center}button{flex:1;height:58px;border:0;border-radius:12px;background:#222;color:#ddd;font-size:22px}
button.play{background:var(--a);color:#fff}input{width:100%;accent-color:var(--a)}.t{display:flex;justify-content:space-between;color:#8f8f8f;font-size:13px}
</style>
<h1>FLP Remote</h1><div id="title">…</div>
<div><input id="seek" type="range" min="0" max="100" step="0.1"><div class="t"><span id="cur">0:00</span><span id="dur">0:00</span></div></div>
<div class="row"><button onclick="c('previous')">⏮</button><button onclick="c('back')">−10</button><button class="play" id="pp" onclick="c('toggle')">⏯</button><button onclick="c('forward')">+10</button><button onclick="c('next')">⏭</button></div>
<div class="row"><button onclick="c('mute')">🔇</button><input id="vol" type="range" min="0" max="130" style="flex:3"></div>
<script>
const key=new URLSearchParams(location.search).get('key')||'';const q=key?'?key='+encodeURIComponent(key):'';
const f=s=>{s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function c(action,value){fetch('/api/command'+q,{method:'POST',headers:{'x-flp-remote':'1'},body:JSON.stringify({action,value})}).then(tick)}
let dragging=false;const seek=document.getElementById('seek'),vol=document.getElementById('vol');
seek.oninput=()=>dragging=true;seek.onchange=()=>{dragging=false;c('seek',+seek.value)};vol.onchange=()=>c('volume',+vol.value);
async function tick(){const s=await (await fetch('/api/state'+q)).json();document.getElementById('title').textContent=s.idle?'Nothing playing':(s.title||'');
document.getElementById('pp').textContent=s.paused?'▶':'⏸';document.getElementById('cur').textContent=f(s.time);document.getElementById('dur').textContent=f(s.duration);
if(!dragging&&s.duration)seek.value=s.time/s.duration*100;if(document.activeElement!==vol)vol.value=s.volume}
tick();setInterval(tick,1000)
</script></html>`
