// Discs, capture devices and media information.
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { bin } from './media-tools'

export interface Disc {
  path: string
  name: string
  kind: 'dvd' | 'bluray' | 'audiocd'
}

interface DiscTitle {
  index: number
  label: string
  url: string
  size: number
}

/** Mounted discs (or disc folders) under /Volumes. */
export async function listDiscs(): Promise<Disc[]> {
  const vols = await readdir('/Volumes').catch(() => [] as string[])
  const out: Disc[] = []
  for (const v of vols) {
    const path = join('/Volumes', v)
    const kind = await discKind(path)
    if (kind) out.push({ path, name: v, kind })
  }
  return out
}

// ── Disc images ──

const mounted = new Map<string, string>()

/** Mounts an .iso read-only (hidden from Finder) and returns the folder it appears at. */
export async function mountImage(iso: string): Promise<string> {
  const known = mounted.get(iso)
  if (known && (await stat(known).catch(() => null))) return known
  const plist = await new Promise<string>((resolve, reject) =>
    execFile('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noverify', '-plist', iso], { timeout: 60000 }, (err, out) =>
      err ? reject(new Error(`Couldn't open the disc image: ${err.message.split('\n').pop()}`)) : resolve(String(out))
    )
  )
  const point = plist.match(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
  if (!point) throw new Error("The disc image didn't contain a readable disc")
  mounted.set(iso, point)
  return point
}

/** Ejects images FLP mounted (on quit). */
export function unmountImages(): void {
  for (const point of mounted.values()) execFile('/usr/bin/hdiutil', ['detach', point, '-quiet'], () => null)
  mounted.clear()
}

export async function discKind(path: string): Promise<Disc['kind'] | null> {
  if (/\.iso$/i.test(path)) return discKind(await mountImage(path).catch(() => ''))
  const items = await readdir(path).catch(() => [] as string[])
  if (items.includes('VIDEO_TS')) return 'dvd'
  if (items.includes('BDMV')) return 'bluray'
  if (items.some((i) => /\.(aiff?|cdda)$/i.test(i))) return 'audiocd'
  if (/VIDEO_TS$/i.test(path)) return 'dvd'
  return null
}

/**
 * DVD titles without menus: each title set's VOBs are joined in order, largest (the main feature)
 * first. This build of mpv has no DVD-menu support, so this is how DVDs play.
 */
export async function dvdTitles(discPath: string): Promise<DiscTitle[]> {
  const dir = /VIDEO_TS$/i.test(discPath) ? discPath : join(discPath, 'VIDEO_TS')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^VTS_\d\d_[1-9]\.VOB$/i.test(f)).sort()
  const sets = new Map<string, { files: string[]; size: number }>()
  for (const f of files) {
    const set = f.slice(4, 6)
    const s = sets.get(set) ?? { files: [], size: 0 }
    s.files.push(join(dir, f))
    s.size += (await stat(join(dir, f)).catch(() => ({ size: 0 }))).size
    sets.set(set, s)
  }
  return [...sets.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .map(([set, s], i) => ({
      index: Number(set),
      label: `${i === 0 ? 'Main feature' : `Title ${Number(set)}`} · ${(s.size / 1e9).toFixed(1)} GB`,
      // mpv EDL joins the VOBs with a correct total duration (%len% quotes each path).
      url: `edl://${s.files.map((f) => `%${Buffer.byteLength(f)}%${f}`).join(';')}`,
      size: s.size
    }))
}

// ── Capture devices (AVFoundation) ──

interface CaptureDevices {
  video: { index: number; name: string }[]
  audio: { index: number; name: string }[]
}

export function listCaptureDevices(): Promise<CaptureDevices> {
  return new Promise((resolve) => {
    execFile(bin('ffmpeg'), ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { timeout: 8000 }, (_err, _out, stderr) => {
      const out: CaptureDevices = { video: [], audio: [] }
      let section: 'video' | 'audio' | null = null
      for (const line of String(stderr).split('\n')) {
        if (/video devices:/i.test(line)) section = 'video'
        else if (/audio devices:/i.test(line)) section = 'audio'
        const m = line.match(/\]\s\[(\d+)\]\s(.+)$/)
        if (m && section) out[section].push({ index: Number(m[1]), name: m[2].trim() })
      }
      resolve(out)
    })
  })
}

/** mpv URL for a capture: "av://avfoundation:<video>:<audio>" ("none" to skip one). */
export function captureUrl(video: number | null, audio: number | null): string {
  return `av://avfoundation:${video ?? 'none'}:${audio ?? 'none'}`
}

// ── Media information ──

interface MediaInfo {
  format: Record<string, string>
  streams: { index: number; type: string; fields: [string, string][] }[]
  tags: Record<string, string>
}

const human = (bytes: number) => (bytes > 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`)
const kbps = (bps?: string) => (bps && Number(bps) ? `${Math.round(Number(bps) / 1000)} kb/s` : '')

export function mediaInfo(path: string): Promise<MediaInfo | null> {
  return new Promise((resolve) => {
    execFile(bin('ffprobe'), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-show_chapters', path], { timeout: 20000, maxBuffer: 16 << 20 }, (err, out) => {
      if (err) return resolve(null)
      try {
        const j = JSON.parse(out)
        const f = j.format ?? {}
        const format: Record<string, string> = {
          Container: f.format_long_name ?? f.format_name ?? '',
          Duration: f.duration ? new Date(Number(f.duration) * 1000).toISOString().slice(11, 19) : '',
          Size: f.size ? human(Number(f.size)) : '',
          'Overall bitrate': kbps(f.bit_rate),
          Chapters: String(j.chapters?.length ?? 0)
        }
        const streams = (j.streams ?? []).map((s: any) => {
          const fields: [string, string][] = [['Codec', `${s.codec_long_name ?? s.codec_name ?? ''}${s.profile ? ` (${s.profile})` : ''}`]]
          if (s.codec_type === 'video') {
            fields.push(['Resolution', `${s.width}×${s.height}`])
            if (s.display_aspect_ratio) fields.push(['Aspect ratio', s.display_aspect_ratio])
            if (s.avg_frame_rate && s.avg_frame_rate !== '0/0') {
              const [a, b] = s.avg_frame_rate.split('/').map(Number)
              fields.push(['Frame rate', `${(a / (b || 1)).toFixed(3).replace(/\.?0+$/, '')} fps`])
            }
            if (s.pix_fmt) fields.push(['Pixel format', s.pix_fmt])
            if (s.color_transfer) fields.push(['HDR / transfer', s.color_transfer === 'smpte2084' ? 'HDR10 (PQ)' : s.color_transfer === 'arib-std-b67' ? 'HLG' : s.color_transfer])
            if (s.color_primaries) fields.push(['Color primaries', s.color_primaries])
          }
          if (s.codec_type === 'audio') {
            fields.push(['Channels', `${s.channels ?? ''}${s.channel_layout ? ` (${s.channel_layout})` : ''}`])
            fields.push(['Sample rate', s.sample_rate ? `${Number(s.sample_rate) / 1000} kHz` : ''])
          }
          if (s.bit_rate) fields.push(['Bitrate', kbps(s.bit_rate)])
          if (s.tags?.language) fields.push(['Language', s.tags.language])
          if (s.tags?.title) fields.push(['Title', s.tags.title])
          if (s.disposition?.default) fields.push(['Default', 'Yes'])
          return { index: s.index, type: s.codec_type, fields: fields.filter(([, v]) => v) }
        })
        resolve({ format: Object.fromEntries(Object.entries(format).filter(([, v]) => v)), streams, tags: f.tags ?? {} })
      } catch {
        resolve(null)
      }
    })
  })
}
