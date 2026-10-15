// Maps FLP settings onto mpv properties. Each entry lists the setting keys it reads and returns
// the mpv properties to set; it's re-run whenever one of those keys changes.
import { homedir } from 'node:os'
import { buildAudioFilters } from '@shared/audio-effects'
import { buildVideoFilters, videoProps, VFX_KEYS } from '@shared/video-effects'
import type { SettingValues } from '@shared/settings-schema'
import type { PlayerBridge } from './player'

type Rule = { keys: string[]; apply(v: SettingValues): Record<string, unknown> }

const expand = (p: unknown) => (typeof p === 'string' ? p.replace(/^~(?=\/|$)/, homedir()) : '')

const hex2mpv = (hex: unknown, opacityPct = 100) => {
  const h = typeof hex === 'string' && /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace('#', '') : 'FFFFFF'
  const a = Math.round((opacityPct / 100) * 255).toString(16).padStart(2, '0')
  return `#${a}${h}`.toUpperCase()
}

const QUALITY: Record<string, string> = {
  best: 'bestvideo+bestaudio/best',
  '2160': 'bv*[height<=2160]+ba/b[height<=2160]',
  '1080': 'bv*[height<=1080]+ba/b[height<=1080]',
  '720': 'bv*[height<=720]+ba/b[height<=720]',
  '480': 'bv*[height<=480]+ba/b[height<=480]'
}

const BUFFER_PRESETS: Record<string, number> = { 'low-latency': 1, normal: 10, large: 60 }

export const RULES: Rule[] = [
  // Playback
  { keys: ['playback.preciseSeek'], apply: (v) => ({ 'hr-seek': v['playback.preciseSeek'] ? 'yes' : 'default' }) },
  { keys: ['playback.loadMatchingMkv'], apply: (v) => ({ 'ordered-chapters': !!v['playback.loadMatchingMkv'] }) },
  {
    keys: ['playback.videoQuality', 'network.ytdlFormat'],
    apply: (v) => ({ 'ytdl-format': (v['network.ytdlFormat'] as string) || QUALITY[String(v['playback.videoQuality'])] || QUALITY.best })
  },

  // Video
  { keys: ['video.enabled'], apply: (v) => ({ vid: v['video.enabled'] ? 'auto' : 'no' }) },
  { keys: ['video.stopScreensaver'], apply: (v) => ({ 'stop-screensaver': v['video.stopScreensaver'] ? 'yes' : 'no' }) },
  {
    // One video filter chain: deinterlacing + software effects. Software filters need decoded
    // frames in memory, so hardware decoding switches to its copy mode while any are active.
    keys: ['video.deinterlace', 'video.deinterlaceMethod', 'performance.hwdec', ...VFX_KEYS],
    apply: (v) => {
      const mode = v['video.deinterlace']
      const method = String(v['video.deinterlaceMethod'])
      const vf: string[] = []
      let deinterlace: string = mode === 'off' ? 'no' : mode === 'on' ? 'yes' : 'auto'
      if (mode !== 'off' && method !== 'auto') {
        const filter = method === 'yadif-double' ? 'yadif=mode=send_field' : method
        // Only deinterlace frames flagged as interlaced in Automatic mode ("key=value" options join with ':').
        const onlyInterlaced = mode === 'auto' ? `${filter.includes('=') ? ':' : '='}deint=interlaced` : ''
        vf.push(`@deint:lavfi=[${filter}${onlyInterlaced}]`)
        deinterlace = 'no'
      }
      vf.push(...buildVideoFilters(v))
      const hw = String(v['performance.hwdec'] ?? 'auto-safe')
      const hwdec = vf.length && hw !== 'no' ? (hw === 'videotoolbox' ? 'videotoolbox-copy' : 'auto-copy-safe') : hw
      return { deinterlace, vf: vf.join(','), hwdec }
    }
  },
  {
    keys: ['performance.postProcessing', 'video.zoom', ...VFX_KEYS],
    apply: (v) => videoProps(v, v['performance.postProcessing'] !== 'off')
  },
  // "-1" = use the file's own aspect ratio ("no" would force square pixels and break anamorphic video).
  { keys: ['video.aspect'], apply: (v) => ({ 'video-aspect-override': v['video.aspect'] === 'auto' ? '-1' : v['video.aspect'] }) },
  {
    keys: ['video.monitorPixelAspect'],
    apply: (v) => {
      const raw = String(v['video.monitorPixelAspect'] || '1')
      const [a, b] = raw.split(':').map(Number)
      const ratio = b ? a / b : a
      return { monitorpixelaspect: Number.isFinite(ratio) && ratio > 0 ? ratio : 1 }
    }
  },
  {
    keys: ['video.zoom', 'video.scaleToWindow'],
    apply: (v) => {
      const z = String(v['video.zoom'])
      if (!v['video.scaleToWindow']) return { 'video-unscaled': 'yes', panscan: 0 }
      return { 'video-unscaled': 'no', panscan: z === 'fill' ? 1 : 0 }
    }
  },
  {
    keys: ['video.position'],
    apply: (v) => {
      const p = v['video.position']
      return {
        'video-align-x': p === 'left' ? -1 : p === 'right' ? 1 : 0,
        'video-align-y': p === 'top' ? -1 : p === 'bottom' ? 1 : 0
      }
    }
  },
  {
    keys: ['video.snapshotFolder', 'video.snapshotPrefix', 'video.snapshotFormat', 'video.snapshotSequential'],
    apply: (v) => ({
      'screenshot-dir': expand(v['video.snapshotFolder']) || `${homedir()}/Pictures`,
      'screenshot-format': v['video.snapshotFormat'],
      'screenshot-template': `${v['video.snapshotPrefix'] || ''}${v['video.snapshotSequential'] ? '%n' : '%F-%wH.%wM.%wS'}`
    })
  },

  // Audio
  {
    keys: ['audio.enabled', 'playback.defaultAudioTrack'],
    apply: (v) => ({ aid: !v['audio.enabled'] ? 'no' : Number(v['playback.defaultAudioTrack']) > 0 ? Number(v['playback.defaultAudioTrack']) : 'auto' })
  },
  {
    keys: ['playback.defaultSubTrack'],
    apply: (v) => ({ sid: Number(v['playback.defaultSubTrack']) > 0 ? Number(v['playback.defaultSubTrack']) : 'auto' })
  },
  {
    keys: ['playback.repeat'],
    apply: (v) => ({ 'loop-file': v['playback.repeat'] === 'one' ? 'inf' : 'no', 'loop-playlist': v['playback.repeat'] === 'all' ? 'inf' : 'no' })
  },
  { keys: ['playback.speed'], apply: (v) => ({ speed: Number(v['playback.speed']) || 1 }) },
  { keys: ['playback.repairAvi'], apply: (v) => ({ index: v['playback.repairAvi'] === 'always' ? 'recreate' : 'default' }) },
  {
    keys: ['playback.timeshiftFolder', 'playback.timeshiftSize'],
    apply: (v) => {
      const dir = expand(v['playback.timeshiftFolder'])
      const back = { small: '50MiB', medium: '200MiB', large: '1GiB' }[String(v['playback.timeshiftSize'])] ?? '200MiB'
      return { 'demuxer-max-back-bytes': back, 'cache-on-disk': !!dir, ...(dir ? { 'demuxer-cache-dir': dir } : {}) }
    }
  },
  { keys: ['controls.mediaKeys'], apply: (v) => ({ 'media-controls': v['controls.mediaKeys'] === false ? 'no' : 'yes' }) },
  { keys: ['audio.device'], apply: (v) => ({ 'audio-device': v['audio.device'] || 'auto' }) },
  { keys: ['audio.channels'], apply: (v) => ({ 'audio-channels': v['audio.channels'] === 'auto' ? 'auto-safe' : v['audio.channels'] }) },
  { keys: ['audio.maxVolume'], apply: (v) => ({ 'volume-max': v['audio.maxVolume'] }) },
  { keys: ['audio.replayGain', 'audio.replayGainPreamp'], apply: (v) => ({ replaygain: v['audio.replayGain'], 'replaygain-preamp': v['audio.replayGainPreamp'] }) },
  { keys: ['audio.delay'], apply: (v) => ({ 'audio-delay': v['audio.delay'] }) },
  { keys: ['audio.language'], apply: (v) => ({ alang: v['audio.language'] === 'system' ? systemLangs() : v['audio.language'] }) },
  { keys: ['audio.passthrough'], apply: (v) => ({ 'audio-spdif': v['audio.passthrough'] ? 'ac3,eac3,dts,dts-hd,truehd' : '' }) },
  { keys: ['audio.exclusive'], apply: (v) => ({ 'audio-exclusive': !!v['audio.exclusive'] }) },
  {
    keys: ['audio.resampleQuality'],
    apply: (v) => ({ 'audio-resample-filter-size': v['audio.resampleQuality'] === 'best' ? 32 : v['audio.resampleQuality'] === 'fast' ? 8 : 16 })
  },
  {
    keys: [
      'audio.pitch', 'audio.karaoke', 'audio.eq', 'fx.eqBands', 'fx.eqPreamp', 'audio.compressor', 'fx.compThreshold', 'fx.compRatio',
      'fx.compAttack', 'fx.compRelease', 'fx.compKnee', 'fx.compMakeup', 'audio.nightMode', 'audio.spatial', 'audio.spatialMode',
      'fx.spatialStrength', 'fx.spatialRange', 'audio.stereoWiden', 'fx.widenDelay', 'fx.widenFeedback', 'fx.widenCrossfeed',
      'fx.widenDry', 'audio.chorus', 'audio.normalize', 'audio.normalizeTarget'
    ],
    apply: (v) => ({ af: buildAudioFilters(v).join(',') })
  },

  // Subtitles
  { keys: ['subtitles.enabled'], apply: (v) => ({ 'sub-visibility': !!v['subtitles.enabled'] }) },
  { keys: ['subtitles.language'], apply: (v) => ({ slang: v['subtitles.language'] === 'system' ? systemLangs() : v['subtitles.language'] }) },
  { keys: ['subtitles.encoding'], apply: (v) => ({ 'sub-codepage': v['subtitles.encoding'] }) },
  {
    keys: ['subtitles.autoload', 'subtitles.matching'],
    apply: (v) => ({ 'sub-auto': v['subtitles.autoload'] ? v['subtitles.matching'] : 'no' })
  },
  {
    keys: ['subtitles.folders'],
    apply: (v) => ({ 'sub-file-paths': String(v['subtitles.folders'] ?? '').split(',').map((s) => s.trim()).filter(Boolean).join(':') })
  },
  {
    keys: ['subtitles.font', 'subtitles.fontSize', 'subtitles.bold', 'subtitles.color', 'subtitles.opacity'],
    apply: (v) => ({
      'sub-font': String(v['subtitles.font'] || '').split(',')[0].trim().replace(/^System$/i, '') || 'sans-serif',
      'sub-font-size': v['subtitles.fontSize'],
      'sub-bold': !!v['subtitles.bold'],
      'sub-color': hex2mpv(v['subtitles.color'], Number(v['subtitles.opacity'] ?? 100))
    })
  },
  {
    keys: ['subtitles.outline', 'subtitles.outlineColor', 'subtitles.shadow', 'subtitles.shadowColor', 'subtitles.shadowDistance',
      'subtitles.background', 'subtitles.backgroundColor', 'subtitles.backgroundOpacity'],
    apply: (v) => {
      const box = v['subtitles.background'] === 'box'
      const outline = { none: 0, thin: 1.5, normal: 3, thick: 5 }[String(v['subtitles.outline'])] ?? 3
      const shadow = v['subtitles.shadow'] ? ({ small: 1, medium: 2, large: 4 }[String(v['subtitles.shadowDistance'])] ?? 1) : 0
      // mpv uses one colour (sub-back-color, alias sub-shadow-color) for both the shadow and the background box.
      return {
        'sub-border-style': box ? 'background-box' : 'outline-and-shadow',
        'sub-outline-size': outline,
        'sub-outline-color': hex2mpv(v['subtitles.outlineColor']),
        'sub-back-color': box ? hex2mpv(v['subtitles.backgroundColor'], Number(v['subtitles.backgroundOpacity'] ?? 50)) : hex2mpv(v['subtitles.shadowColor'], 80),
        'sub-shadow-offset': box ? 0 : shadow
      }
    }
  },
  {
    keys: ['subtitles.position'],
    apply: (v) => {
      const p = v['subtitles.position']
      if (p === 'top') return { 'sub-align-y': 'top', 'sub-pos': 100 }
      return { 'sub-align-y': 'bottom', 'sub-pos': p === 'raised' ? 90 : p === 'middle' ? 55 : 100 }
    }
  },
  { keys: ['subtitles.ignoreAssStyle'], apply: (v) => ({ 'sub-ass-override': v['subtitles.ignoreAssStyle'] ? 'force' : 'scale' }) },
  { keys: ['subtitles.delay'], apply: (v) => ({ 'sub-delay': v['subtitles.delay'] }) },

  // Network
  {
    keys: ['network.buffering', 'network.cacheNetwork'],
    apply: (v) => {
      const secs = v['network.buffering'] === 'custom' ? Number(v['network.cacheNetwork']) : BUFFER_PRESETS[String(v['network.buffering'])] ?? 10
      return { 'cache-secs': secs, 'demuxer-readahead-secs': Math.min(secs, 20) }
    }
  },
  {
    keys: ['network.proxy', 'network.proxyUser', 'network.proxyPassword'],
    apply: (v) => {
      const raw = String(v['network.proxy'] || '').trim()
      if (!raw) return { 'http-proxy': '' }
      try {
        const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`)
        if (v['network.proxyUser']) u.username = encodeURIComponent(String(v['network.proxyUser']))
        if (v['network.proxyPassword']) u.password = encodeURIComponent(String(v['network.proxyPassword']))
        return { 'http-proxy': u.href }
      } catch {
        return { 'http-proxy': raw }
      }
    }
  },
  { keys: ['network.verifyTls'], apply: (v) => ({ 'tls-verify': !!v['network.verifyTls'] }) },
  { keys: ['network.userAgent'], apply: (v) => ({ 'user-agent': v['network.userAgent'] || 'libmpv' }) },

  // Performance
  {
    keys: ['performance.postProcessing'],
    apply: (v) => {
      const p = v['performance.postProcessing']
      return { scale: p === 'high' ? 'ewa_lanczossharp' : 'lanczos', cscale: p === 'high' ? 'ewa_lanczossharp' : 'lanczos' }
    }
  },
  { keys: ['performance.skipLoopFilter'], apply: (v) => ({ 'vd-lavc-skiploopfilter': v['performance.skipLoopFilter'] }) },
  { keys: ['performance.threads'], apply: (v) => ({ 'vd-lavc-threads': v['performance.threads'] }) },
  { keys: ['performance.dropFrames'], apply: (v) => ({ framedrop: v['performance.dropFrames'] ? 'vo' : 'no' }) },
  {
    keys: ['performance.displaySync', 'performance.interpolation'],
    apply: (v) => {
      const sync = v['performance.displaySync'] || v['performance.interpolation']
      return { 'video-sync': sync ? 'display-resample' : 'audio', interpolation: !!v['performance.interpolation'] }
    }
  },
  { keys: ['performance.decoder'], apply: (v) => ({ vd: v['performance.decoder'] || '' }) },
  { keys: ['performance.demuxerMax'], apply: (v) => ({ 'demuxer-max-bytes': `${v['performance.demuxerMax']}MiB` }) },

  // Diagnostics
  // The log (general.saveLog / logFile / logLevel) is written by the main process; see app-log.ts.
]

function systemLangs(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0]
  return [locale, 'en', 'eng'].filter((x, i, a) => a.indexOf(x) === i).join(',')
}

/** Applies every rule touched by `changed` (or all rules if omitted). Errors are logged, not fatal. */
export function applySettings(player: PlayerBridge, values: SettingValues, changed?: string[]): void {
  const touched = changed ? new Set(changed) : null
  for (const rule of RULES) {
    if (touched && !rule.keys.some((k) => touched.has(k))) continue
    for (const [prop, value] of Object.entries(rule.apply(values))) {
      player.set(prop, value).catch((err: Error) => console.warn(`[settings] ${prop}=${JSON.stringify(value)}: ${err.message}`))
    }
  }
}
