// Video effect values (Figma "Video - Essential / Crop / Colors", "HDR Options"). Stored like
// settings under "vfx." / "hdr." keys so they persist per profile and can be saved as presets.

export const VFX_DEFAULTS = {
  // Essential (mpv equalizer properties, -100…100)
  'vfx.hue': 0,
  'vfx.brightness': 0,
  'vfx.contrast': 0,
  'vfx.saturation': 0,
  'vfx.gamma': 0,
  // Quality
  'vfx.sharpen': 0, // 0…1 (contrast-adaptive sharpening)
  'vfx.deband': 0, // banding removal radius, 0 = off, 1…64
  'vfx.grain': 0, // film grain variance, 0…100
  // Framing
  'vfx.cropLeft': 0, // percent of width/height trimmed from each edge
  'vfx.cropRight': 0,
  'vfx.cropTop': 0,
  'vfx.cropBottom': 0,
  'vfx.zoom': 0, // log2 scale, 0 = 100%
  'vfx.panX': 0,
  'vfx.panY': 0,
  'vfx.rotate': 0,
  'vfx.flipH': false,
  'vfx.flipV': false,
  // Colors
  'vfx.temperature': 6500,
  'vfx.grayscale': false,
  'vfx.sepia': false,
  'vfx.negative': false,
  'vfx.vignette': false,
  'vfx.posterize': false,
  // HDR
  'hdr.toneMapping': 'auto',
  'hdr.targetPeak': 0, // 0 = auto (nits otherwise)
  'hdr.computePeak': true,
  'hdr.gamutMapping': 'auto'
} as const

export const TONE_MAPPINGS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'spline', label: 'Spline' },
  { value: 'bt.2390', label: 'BT.2390' },
  { value: 'bt.2446a', label: 'BT.2446a' },
  { value: 'st2094-40', label: 'ST 2094-40 (HDR10+)' },
  { value: 'reinhard', label: 'Reinhard' },
  { value: 'hable', label: 'Hable (filmic)' },
  { value: 'mobius', label: 'Möbius' },
  { value: 'clip', label: 'Clip' }
]

type Values = Record<string, unknown>
const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Software filters (need decoded frames in system memory). */
export function buildVideoFilters(v: Values): string[] {
  const vf: string[] = []
  const sharpen = n(v['vfx.sharpen'])
  if (sharpen > 0) vf.push(`@sharpen:lavfi=[cas=strength=${sharpen.toFixed(2)}]`)
  const temp = n(v['vfx.temperature'], 6500)
  if (Math.abs(temp - 6500) > 50) vf.push(`@temp:lavfi=[colortemperature=temperature=${Math.round(temp)}]`)
  if (v['vfx.grayscale']) vf.push('@gray:lavfi=[hue=s=0]')
  if (v['vfx.sepia']) vf.push('@sepia:lavfi=[colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131]')
  if (v['vfx.negative']) vf.push('@negate:lavfi=[negate]')
  if (v['vfx.posterize']) vf.push('@poster:lavfi=[lutrgb=r=floor(val/64)*64:g=floor(val/64)*64:b=floor(val/64)*64]')
  if (v['vfx.vignette']) vf.push('@vignette:lavfi=[vignette=PI/4]')
  if (v['vfx.flipH']) vf.push('@hflip:lavfi=[hflip]')
  if (v['vfx.flipV']) vf.push('@vflip:lavfi=[vflip]')
  return vf
}

/** GPU-side properties (cheap, no frame download). */
export function videoProps(v: Values, debandFromPerformance = false): Record<string, unknown> {
  const deband = n(v['vfx.deband'])
  const grain = n(v['vfx.grain'])
  return {
    hue: n(v['vfx.hue']),
    brightness: n(v['vfx.brightness']),
    contrast: n(v['vfx.contrast']),
    saturation: n(v['vfx.saturation']),
    gamma: n(v['vfx.gamma']),
    deband: deband > 0 || grain > 0 || debandFromPerformance,
    'deband-range': deband > 0 ? deband : 16,
    'deband-grain': grain > 0 ? Math.round(grain * 4) : debandFromPerformance ? 48 : 0,
    // Panel zoom stacks on top of the Framing → Zoom setting (50%/100%/200%).
    'video-zoom': n(v['vfx.zoom']) + (Number(v['video.zoom']) > 0 ? Math.log2(Number(v['video.zoom'])) : 0),
    'video-pan-x': n(v['vfx.panX']),
    'video-pan-y': n(v['vfx.panY']),
    'video-rotate': ((n(v['vfx.rotate']) % 360) + 360) % 360,
    'tone-mapping': v['hdr.toneMapping'] ?? 'auto',
    'target-peak': n(v['hdr.targetPeak']) > 0 ? n(v['hdr.targetPeak']) : 'auto',
    'hdr-compute-peak': v['hdr.computePeak'] === false ? 'no' : 'auto',
    'gamut-mapping-mode': v['hdr.gamutMapping'] ?? 'auto'
  }
}

/** mpv video-crop string for an aspect-ratio crop plus per-edge trims (percent). */
export function cropString(w: number, h: number, v: Values): string {
  if (!w || !h) return ''
  let cw = w
  let ch = h
  const ratio = String(v['video.crop'] ?? 'none')
  if (ratio !== 'none') {
    const [a, b] = ratio.split(':').map(Number)
    const target = b ? a / b : a
    if (target > 0) {
      if (w / h > target) cw = Math.round(h * target)
      else ch = Math.round(w / target)
    }
  }
  let x = Math.round((w - cw) / 2)
  let y = Math.round((h - ch) / 2)
  const l = (n(v['vfx.cropLeft']) / 100) * w
  const r = (n(v['vfx.cropRight']) / 100) * w
  const t = (n(v['vfx.cropTop']) / 100) * h
  const btm = (n(v['vfx.cropBottom']) / 100) * h
  x += Math.round(l)
  y += Math.round(t)
  cw = Math.max(16, Math.round(cw - l - r))
  ch = Math.max(16, Math.round(ch - t - btm))
  if (cw === w && ch === h) return ''
  return `${cw}x${ch}+${x}+${y}`
}

export const VFX_KEYS = Object.keys(VFX_DEFAULTS)
