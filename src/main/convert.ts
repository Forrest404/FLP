// Convert / save and stream-out jobs (ffmpeg), with live progress.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { bin } from './media-tools'
import { mediaInfo } from './sources'

type PresetOpts = { preset: string; height?: number }
const scaled = (o: PresetOpts) => (o.height ? ['-vf', `scale=-2:${o.height}`] : [])

export const PRESETS = {
  'mp4-h264': { label: 'Video – MP4 (H.264 + AAC)', ext: 'mp4', args: (o: PresetOpts) => [...scaled(o), '-c:v', 'libx264', '-preset', o.preset, '-crf', '21', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'] },
  'mp4-hevc': { label: 'Video – MP4 (HEVC, smaller files)', ext: 'mp4', args: (o: PresetOpts) => [...scaled(o), '-c:v', 'libx265', '-preset', o.preset, '-crf', '24', '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'] },
  'mp4-fast': { label: 'Video – MP4 (hardware, fastest)', ext: 'mp4', args: (o: PresetOpts) => [...scaled(o), '-c:v', 'h264_videotoolbox', '-b:v', '8M', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'] },
  webm: { label: 'Video – WebM (VP9 + Opus)', ext: 'webm', args: (o: PresetOpts) => [...scaled(o), '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k'] },
  remux: { label: 'Video – MKV, no re-encoding (instant)', ext: 'mkv', args: () => ['-map', '0', '-c', 'copy'] },
  mp3: { label: 'Audio – MP3', ext: 'mp3', args: () => ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'] },
  m4a: { label: 'Audio – M4A (AAC)', ext: 'm4a', args: () => ['-vn', '-c:a', 'aac', '-b:a', '256k'] },
  flac: { label: 'Audio – FLAC (lossless)', ext: 'flac', args: () => ['-vn', '-c:a', 'flac'] },
  wav: { label: 'Audio – WAV', ext: 'wav', args: () => ['-vn', '-c:a', 'pcm_s16le'] },
  opus: { label: 'Audio – Opus', ext: 'opus', args: () => ['-vn', '-c:a', 'libopus', '-b:a', '160k'] },
  gif: {
    label: 'Animated GIF',
    ext: 'gif',
    args: (o: PresetOpts) => ['-an', '-vf', `fps=12,scale=-2:${o.height ?? 360},split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse`, '-loop', '0']
  }
} as const

export type PresetId = keyof typeof PRESETS

export interface ConvertOptions {
  preset: PresetId
  outDir?: string
  start?: number
  end?: number
  height?: number
  encoderPreset?: string
}

export interface Job {
  id: number
  kind: 'convert' | 'stream'
  input: string
  output: string
  label: string
  progress: number
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  error?: string
  url?: string
  /** Unguessable part of a stream's web address. */
  token?: string
}

export class JobQueue extends EventEmitter {
  jobs: Job[] = []
  private procs = new Map<number, ChildProcess>()
  private nextId = 1
  private running = 0
  private queue: { job: Job; args: string[]; duration: number }[] = []

  private emitJobs() {
    this.emit('jobs', this.jobs)
  }

  /** A name that exists neither on disk nor as the output of a queued/running job. */
  private uniquePath(dir: string, name: string, ext: string): string {
    const taken = (p: string) => existsSync(p) || this.jobs.some((j) => j.output === p && (j.status === 'queued' || j.status === 'running'))
    let p = join(dir, `${name}.${ext}`)
    for (let i = 2; taken(p); i++) p = join(dir, `${name} (${i}).${ext}`)
    return p
  }

  async convert(input: string, opts: ConvertOptions): Promise<Job> {
    const preset = PRESETS[opts.preset]
    const outDir = opts.outDir || (/^[a-z]+:\/\//i.test(input) ? join(process.env.HOME ?? '', 'Movies') : dirname(input))
    const name = basename(input).replace(extname(input), '') + (opts.preset === 'remux' ? '' : ' (converted)')
    const output = this.uniquePath(outDir, name, preset.ext)
    const args = ['-hide_banner', '-nostdin', '-y']
    if (opts.start) args.push('-ss', String(opts.start))
    args.push('-i', input)
    if (opts.end) args.push('-t', String(Math.max(0.1, opts.end - (opts.start ?? 0))))
    args.push(...preset.args({ preset: opts.encoderPreset ?? 'medium', height: opts.height }))
    args.push('-progress', 'pipe:1', '-nostats', output)
    const info = await mediaInfo(input)
    const total = info?.format.Duration ? info.format.Duration.split(':').reduce((a, b) => a * 60 + Number(b), 0) : 0
    const duration = opts.end ? opts.end - (opts.start ?? 0) : total - (opts.start ?? 0)
    const job: Job = { id: this.nextId++, kind: 'convert', input, output, label: preset.label, progress: 0, status: 'queued' }
    this.jobs = [...this.jobs, job]
    this.queue.push({ job, args, duration })
    this.emitJobs()
    this.pump()
    return job
  }

  /** Streams a file over the network as HLS (served by the built-in web server) or UDP. */
  stream(input: string, opts: { target: 'hls' | 'udp'; udpAddress?: string; audio: boolean; video: boolean; preset: string; tune: string; hlsUrl: (path: string) => string }): Job {
    const id = this.nextId++
    const args = ['-hide_banner', '-nostdin', '-re', '-i', input]
    if (opts.video) args.push('-map', '0:v:0?')
    if (opts.audio) args.push('-map', '0:a:0?')
    if (opts.video) args.push('-c:v', 'libx264', '-preset', opts.preset === 'medium' ? 'veryfast' : opts.preset, '-g', '50', '-pix_fmt', 'yuv420p', ...(opts.tune !== 'none' ? ['-tune', opts.tune.replace('zero-latency', 'zerolatency')] : []))
    else args.push('-vn')
    if (opts.audio) args.push('-c:a', 'aac', '-b:a', '160k')
    else args.push('-an')
    let output: string
    let url: string
    let token: string | undefined
    if (opts.target === 'udp') {
      url = `udp://${opts.udpAddress || '239.0.0.1:1234'}`
      output = url
      args.push('-f', 'mpegts', `${url}?pkt_size=1316`)
    } else {
      const dir = join(tmpdir(), `flp-stream-${id}`)
      mkdirSync(dir, { recursive: true })
      output = join(dir, 'index.m3u8')
      token = randomBytes(12).toString('base64url')
      url = opts.hlsUrl(`/stream/${token}/index.m3u8`)
      args.push('-f', 'hls', '-hls_time', '4', '-hls_list_size', '0', '-hls_playlist_type', 'event', '-hls_segment_filename', join(dir, 'seg%05d.ts'), output)
    }
    const job: Job = { id, kind: 'stream', input, output, label: opts.target === 'udp' ? 'UDP stream' : 'HTTP stream (HLS)', progress: 0, status: 'running', url, token }
    this.jobs = [...this.jobs, job]
    this.start(job, args, 0)
    return job
  }

  private pump() {
    while (this.running < 2 && this.queue.length) {
      const next = this.queue.shift()!
      if (next.job.status === 'cancelled') continue
      this.start(next.job, next.args, next.duration)
    }
  }

  private start(job: Job, args: string[], duration: number) {
    job.status = 'running'
    this.running++
    const proc = spawn(bin('ffmpeg'), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    this.procs.set(job.id, proc)
    let finished = false
    let errTail = ''
    proc.stdout.on('data', (d: Buffer) => {
      const m = String(d).match(/out_time_us=(\d+)/g)
      if (m && duration > 0) {
        const us = Number(m[m.length - 1].split('=')[1])
        job.progress = Math.min(0.99, us / 1e6 / duration)
        this.emitJobs()
      }
    })
    proc.stderr.on('data', (d: Buffer) => (errTail = (errTail + d).slice(-2000)))
    const finish = (code: number | null, spawnError?: Error) => {
      if (finished) return
      finished = true
      this.running--
      this.procs.delete(job.id)
      if (spawnError) {
        job.status = 'failed'
        job.error = spawnError.message
      } else if (job.status === 'cancelled') {
        if (job.kind === 'convert' && existsSync(job.output)) rmSync(job.output, { force: true })
      } else if (code === 0) {
        job.status = 'done'
        job.progress = 1
      } else {
        job.status = 'failed'
        job.error = errTail.trim().split('\n').slice(-3).join(' ')
      }
      if (job.kind === 'stream' && job.output.endsWith('.m3u8')) setTimeout(() => rmSync(dirname(job.output), { recursive: true, force: true }), 60000)
      this.emitJobs()
      this.pump()
    }
    // e.g. ffmpeg missing: fail the job instead of crashing the app.
    proc.on('error', (err) => finish(null, err))
    proc.on('close', (code) => finish(code))
    this.emitJobs()
  }

  cancel(id: number) {
    const job = this.jobs.find((j) => j.id === id)
    if (!job) return
    job.status = 'cancelled'
    this.procs.get(id)?.kill('SIGTERM')
    this.emitJobs()
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => j.status === 'running' || j.status === 'queued')
    this.emitJobs()
  }

  streamDirForToken(token: string): string | null {
    const job = token ? this.jobs.find((j) => j.token === token && j.kind === 'stream' && j.output.endsWith('.m3u8')) : undefined
    return job ? dirname(job.output) : null
  }

  dispose() {
    for (const p of this.procs.values()) p.kill('SIGTERM')
  }
}
