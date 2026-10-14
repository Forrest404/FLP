// Builds mpv's audio filter chain (the `af` property) from settings and effect-panel values.
// Shared so the Settings page and the Effects sidebar always agree.

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const

// VLC's equalizer presets (dB per band), so presets sound the way VLC users expect.
export const EQ_PRESETS: Record<string, { label: string; bands: number[] }> = {
  flat: { label: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  classical: { label: 'Classical', bands: [0, 0, 0, 0, 0, 0, -7.2, -7.2, -7.2, -9.6] },
  club: { label: 'Club', bands: [0, 0, 8, 5.6, 5.6, 5.6, 3.2, 0, 0, 0] },
  dance: { label: 'Dance', bands: [9.6, 7.2, 2.4, 0, 0, -5.6, -7.2, -7.2, 0, 0] },
  'full-bass': { label: 'Full bass', bands: [-8, 9.6, 9.6, 5.6, 1.6, -4, -8, -10.4, -11.2, -11.2] },
  'bass-treble': { label: 'Full bass & treble', bands: [7.2, 5.6, 0, -7.2, -4.8, 1.6, 8, 11.2, 12, 12] },
  'full-treble': { label: 'Full treble', bands: [-9.6, -9.6, -9.6, -4, 2.4, 11.2, 16, 16, 16, 16.8] },
  headphones: { label: 'Headphones', bands: [4.8, 11.2, 5.6, -3.2, -2.4, 1.6, 4.8, 9.6, 12.8, 14.4] },
  'large-hall': { label: 'Large hall', bands: [10.4, 10.4, 5.6, 5.6, 0, -4.8, -4.8, -4.8, 0, 0] },
  live: { label: 'Live', bands: [-4.8, 0, 4, 5.6, 5.6, 5.6, 4, 2.4, 2.4, 2.4] },
  party: { label: 'Party', bands: [7.2, 7.2, 0, 0, 0, 0, 0, 0, 7.2, 7.2] },
  pop: { label: 'Pop', bands: [-1.6, 4.8, 7.2, 8, 5.6, 0, -2.4, -2.4, -1.6, -1.6] },
  reggae: { label: 'Reggae', bands: [0, 0, 0, -5.6, 0, 6.4, 6.4, 0, 0, 0] },
  rock: { label: 'Rock', bands: [8, 4.8, -5.6, -8, -3.2, 4, 8.8, 11.2, 11.2, 11.2] },
  ska: { label: 'Ska', bands: [-2.4, -4.8, -4, 0, 4, 5.6, 8.8, 9.6, 11.2, 9.6] },
  soft: { label: 'Soft', bands: [4.8, 1.6, 0, -2.4, 0, 4, 8, 9.6, 11.2, 12] },
  'soft-rock': { label: 'Soft rock', bands: [4, 4, 2.4, 0, -4, -5.6, -3.2, 0, 2.4, 8.8] },
  techno: { label: 'Techno', bands: [8, 5.6, 0, -5.6, -4.8, 0, 8, 9.6, 9.6, 8.8] }
}

// Effect-panel values live alongside settings under "fx." keys (saved per profile).
export const FX_DEFAULTS = {
  'fx.eqBands': EQ_PRESETS.flat.bands,
  'fx.eqPreamp': 0,
  'fx.compThreshold': -20, // dB
  'fx.compRatio': 4,
  'fx.compAttack': 20, // ms
  'fx.compRelease': 250, // ms
  'fx.compKnee': 2.8, // dB
  'fx.compMakeup': 2, // dB
  'fx.spatialStrength': 0.4,
  'fx.spatialRange': 0.5,
  'fx.widenDelay': 20, // ms
  'fx.widenFeedback': 0.3,
  'fx.widenCrossfeed': 0.3,
  'fx.widenDry': 0.8
} as const

type Values = Record<string, unknown>
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const r = (n: number) => Number(n.toFixed(3))

/** Returns the full `af` list for mpv. Each filter is labelled (@name) so it can be inspected. */
export function buildAudioFilters(v: Values): string[] {
  const af: string[] = []
  let boosts = false

  const pitch = num(v['audio.pitch'], 0)
  if (pitch) af.push(`@pitch:rubberband=pitch-scale=${r(2 ** (pitch / 12))}`)

  if (v['audio.karaoke']) af.push('@karaoke:lavfi=[pan=stereo|c0=0.5*c0-0.5*c1|c1=0.5*c1-0.5*c0]')

  if (v['audio.eq']) {
    const bands = (Array.isArray(v['fx.eqBands']) ? v['fx.eqBands'] : FX_DEFAULTS['fx.eqBands']) as number[]
    const preamp = num(v['fx.eqPreamp'], 0)
    const parts = EQ_BANDS.map((f, i) => `equalizer=f=${f}:t=o:w=1:g=${r(num(bands[i], 0))}`)
    if (preamp) parts.unshift(`volume=${r(preamp)}dB`)
    af.push(`@eq:lavfi=[${parts.join(',')}]`)
    boosts ||= preamp > 0 || bands.some((b) => b > 0)
  }

  if (v['audio.compressor']) {
    const db = (x: number) => r(10 ** (x / 20))
    af.push(
      `@comp:lavfi=[acompressor=threshold=${db(num(v['fx.compThreshold'], -20))}:ratio=${num(v['fx.compRatio'], 4)}` +
        `:attack=${num(v['fx.compAttack'], 20)}:release=${num(v['fx.compRelease'], 250)}` +
        `:knee=${db(num(v['fx.compKnee'], 2.8))}:makeup=${db(num(v['fx.compMakeup'], 2))}]`
    )
    boosts = true
  }

  if (v['audio.nightMode']) {
    af.push('@night:lavfi=[acompressor=threshold=0.05:ratio=6:attack=5:release=200:makeup=4]')
    boosts = true
  }

  if (v['audio.spatial']) {
    const strength = v['audio.spatialMode'] === 'crossfeed' ? 0.2 : num(v['fx.spatialStrength'], 0.4)
    af.push(`@spatial:lavfi=[crossfeed=strength=${strength}:range=${num(v['fx.spatialRange'], 0.5)}]`)
  }

  if (v['audio.stereoWiden']) {
    af.push(
      `@widen:lavfi=[stereowiden=delay=${num(v['fx.widenDelay'], 20)}:feedback=${num(v['fx.widenFeedback'], 0.3)}` +
        `:crossfeed=${num(v['fx.widenCrossfeed'], 0.3)}:drymix=${num(v['fx.widenDry'], 0.8)}]`
    )
  }

  if (v['audio.chorus']) af.push('@chorus:lavfi=[chorus=0.7:0.9:55:0.4:0.25:2]')

  if (v['audio.normalize']) {
    af.push(`@norm:lavfi=[loudnorm=I=${num(v['audio.normalizeTarget'], -16)}:TP=-1.5:LRA=11]`)
    boosts = true
  }

  // Anything that can raise the level gets a limiter so it never clips.
  if (boosts) af.push('@limit:lavfi=[alimiter=limit=0.97:level=disabled]')
  return af
}
