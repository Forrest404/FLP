import { describe, expect, it } from 'vitest'
import { buildAudioFilters, EQ_BANDS, EQ_PRESETS } from '@shared/audio-effects'
import { buildVideoFilters, cropString, videoProps } from '@shared/video-effects'

describe('audio filters', () => {
  it('is empty when nothing is on', () => {
    expect(buildAudioFilters({})).toEqual([])
  })

  it('builds a 10-band equalizer and a limiter when bands boost', () => {
    const af = buildAudioFilters({ 'audio.eq': true, 'fx.eqBands': EQ_PRESETS.rock.bands })
    expect(af[0]).toMatch(/^@eq:lavfi=\[/)
    expect(af[0].match(/equalizer=/g)).toHaveLength(EQ_BANDS.length)
    expect(af.at(-1)).toMatch(/alimiter/)
  })

  it('converts pitch semitones to a scale factor', () => {
    expect(buildAudioFilters({ 'audio.pitch': 12 })[0]).toBe('@pitch:rubberband=pitch-scale=2')
  })

  it('every EQ preset has one value per band', () => {
    for (const [id, p] of Object.entries(EQ_PRESETS)) expect(p.bands, id).toHaveLength(EQ_BANDS.length)
  })
})

describe('video effects', () => {
  it('crops 16:9 to 4:3 around the centre', () => {
    expect(cropString(1920, 1080, { 'video.crop': '4:3' })).toBe('1440x1080+240+0')
  })

  it('trims edges by percent', () => {
    expect(cropString(1000, 1000, { 'video.crop': 'none', 'vfx.cropLeft': 10, 'vfx.cropTop': 5 })).toBe('900x950+100+50')
  })

  it('returns no crop when nothing is cropped', () => {
    expect(cropString(1920, 1080, { 'video.crop': 'none' })).toBe('')
  })

  it('stacks panel zoom on the framing zoom', () => {
    expect(videoProps({ 'vfx.zoom': 1, 'video.zoom': '2' })['video-zoom']).toBe(2)
  })

  it('only adds software filters when asked', () => {
    expect(buildVideoFilters({})).toEqual([])
    expect(buildVideoFilters({ 'vfx.sepia': true, 'vfx.flipH': true })).toHaveLength(2)
  })
})
