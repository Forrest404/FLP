// ffmpeg-based helpers: seek-bar thumbnails, music waveforms, cover art, image conversion.
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { app } from 'electron'
import { parseFile } from 'music-metadata'

/** Resolves a bundled helper binary, falling back to Homebrew during development. */
export function bin(name: 'ffmpeg' | 'ffprobe' | 'yt-dlp'): string {
  const bundled = join(process.resourcesPath ?? '', 'bin', name)
  if (app.isPackaged && existsSync(bundled)) return bundled
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) if (existsSync(join(dir, name))) return join(dir, name)
  return name
}

const cacheDir = (sub: string) => {
  const dir = join(app.getPath('userData'), 'cache', sub)
  mkdirSync(dir, { recursive: true })
  return dir
}

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)

/** Capture ffmpeg's stdout as a Buffer. */
function ffmpegBuffer(args: string[], timeoutMs = 8000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin('ffmpeg'), ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let err = ''
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs)
    proc.stdout.on('data', (c: Buffer) => chunks.push(c))
    proc.stderr.on('data', (c: Buffer) => (err += c))
    proc.on('error', reject)
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks))
      else reject(new Error(err.trim() || `ffmpeg exited with ${code}`))
    })
  })
}

// ── Seek-bar thumbnails ──────────────────────────────────────────────────────

const thumbCache = new Map<string, string>()
const THUMB_STEP = 2 // seconds; nearby hovers share a frame

export async function thumbnailAt(path: string, time: number, width = 240): Promise<string | null> {
  const t = Math.max(0, Math.round(time / THUMB_STEP) * THUMB_STEP)
  const key = `${path}|${t}|${width}`
  const hit = thumbCache.get(key)
  if (hit) return hit
  try {
    const jpg = await ffmpegBuffer(
      ['-ss', String(t), '-i', path, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '6', '-'],
      5000
    )
    const url = `data:image/jpeg;base64,${jpg.toString('base64')}`
    if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value!)
    thumbCache.set(key, url)
    return url
  } catch {
    return null
  }
}

/** A representative poster frame for library tiles, cached on disk. */
export async function posterFor(path: string, duration?: number): Promise<string | null> {
  const out = join(cacheDir('posters'), `${hash(path)}.jpg`)
  if (existsSync(out)) return out
  const at = duration && duration > 30 ? Math.min(duration * 0.2, 300) : 1
  try {
    const jpg = await ffmpegBuffer(['-ss', String(at), '-i', path, '-frames:v', '1', '-vf', 'scale=480:-2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', '-'], 10000)
    await writeFile(out, jpg)
    return out
  } catch {
    return null
  }
}

// ── Music waveform ───────────────────────────────────────────────────────────

const waveCache = new Map<string, number[]>()

/** Peak levels (0–1) across the whole file, for the music seek bar. */
export async function waveform(path: string, points = 240): Promise<number[]> {
  const key = `${path}|${points}`
  const hit = waveCache.get(key)
  if (hit) return hit
  // Mono 2 kHz 8-bit PCM is plenty for a visual waveform and fast to decode.
  const pcm = await ffmpegBuffer(['-i', path, '-vn', '-ac', '1', '-ar', '2000', '-f', 'u8', '-'], 30000)
  const per = Math.max(1, Math.floor(pcm.length / points))
  const peaks: number[] = []
  for (let i = 0; i < points; i++) {
    let max = 0
    const end = Math.min(pcm.length, (i + 1) * per)
    for (let j = i * per; j < end; j++) max = Math.max(max, Math.abs(pcm[j] - 128))
    peaks.push(max / 128)
  }
  const top = Math.max(...peaks, 0.01)
  const norm = peaks.map((p) => Number((p / top).toFixed(3)))
  waveCache.set(key, norm)
  return norm
}

// ── Tags and cover art ───────────────────────────────────────────────────────

export interface AudioTags {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: number
  track?: number
  disc?: number
  duration?: number
  cover?: string // file path of cached cover
}

const COVER_NAMES = /^(cover|folder|front|album|artwork)\.(jpe?g|png|webp)$/i

export async function readTags(path: string, folderArt = true): Promise<AudioTags> {
  try {
    const meta = await parseFile(path, { duration: false, skipCovers: false })
    const c = meta.common
    let cover: string | undefined
    const pic = c.picture?.[0]
    if (pic) {
      const ext = pic.format.includes('png') ? 'png' : 'jpg'
      cover = join(cacheDir('covers'), `${hash(path)}.${ext}`)
      if (!existsSync(cover)) await writeFile(cover, pic.data)
    } else if (folderArt) {
      cover = folderCover(path)
    }
    return {
      title: c.title,
      artist: c.artist,
      album: c.album,
      albumArtist: c.albumartist,
      genre: c.genre?.[0],
      year: c.year,
      track: c.track?.no ?? undefined,
      disc: c.disk?.no ?? undefined,
      duration: meta.format.duration,
      cover
    }
  } catch {
    return { cover: folderArt ? folderCover(path) : undefined }
  }
}

function folderCover(path: string): string | undefined {
  try {
    const dir = dirname(path)
    const name = readdirSync(dir).find((f) => COVER_NAMES.test(f))
    return name ? join(dir, name) : undefined
  } catch {
    return undefined
  }
}

// ── Images Chromium can't show (HEIC, TIFF, RAW…) ────────────────────────────

const NATIVE_IMAGE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg'])

/** Returns a path Chromium can display, converting with macOS `sips` (or ffmpeg) if needed. */
export async function displayableImage(path: string): Promise<string> {
  if (NATIVE_IMAGE.has(extname(path).toLowerCase())) return path
  const out = join(cacheDir('images'), `${hash(path)}.png`)
  if (existsSync(out)) return out
  try {
    await new Promise<void>((res, rej) =>
      execFile('/usr/bin/sips', ['-s', 'format', 'png', path, '--out', out], (err) => (err ? rej(err) : res()))
    )
  } catch {
    await ffmpegBuffer(['-i', path, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], 20000).then((png) => writeFile(out, png))
  }
  return out
}
