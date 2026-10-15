import { describe, expect, it } from 'vitest'
import { typeOf } from '@shared/library'
import { mediaKind } from '@shared/player'
import { pluginSettingKey, toSettingDef } from '@shared/plugins'

describe('media types', () => {
  it('recognises files by extension', () => {
    expect(typeOf('/a/b/Movie.MKV')).toBe('video')
    expect(typeOf('song.flac')).toBe('audio')
    expect(typeOf('photo.heic')).toBe('image')
    expect(typeOf('notes.txt')).toBeNull()
  })

  it('treats audio with cover art as audio, not video', () => {
    const tracks = [
      { id: 1, type: 'audio' as const, selected: true, external: false },
      { id: 1, type: 'video' as const, selected: true, external: false, albumart: true }
    ]
    expect(mediaKind('/x/song.mp3', tracks)).toBe('audio')
  })
})

describe('plugin settings', () => {
  it('namespaces keys and lands on the Extensions page', () => {
    const def = toSettingDef('sleep-timer', { key: 'fade', label: 'Fade', type: 'toggle', default: true })
    expect(def.key).toBe(pluginSettingKey('sleep-timer', 'fade'))
    expect(def.page).toBe('extensions')
  })
})
