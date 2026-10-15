import { describe, expect, it } from 'vitest'
import { PAGES, SETTINGS, defaultValues } from '@shared/settings-schema'

describe('settings schema', () => {
  it('has unique keys', () => {
    const keys = SETTINGS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('puts every setting on a real page', () => {
    const pages = new Set(PAGES.map((p) => p.id))
    for (const s of SETTINGS) expect(pages.has(s.page), s.key).toBe(true)
  })

  it('uses defaults that are valid options', () => {
    for (const s of SETTINGS) {
      if ((s.type === 'select' || s.type === 'segmented') && Array.isArray(s.options)) {
        expect(s.options.map((o) => o.value), s.key).toContain(s.default)
      }
      if (s.type === 'slider') {
        expect(s.default, s.key).toBeGreaterThanOrEqual(s.min)
        expect(s.default, s.key).toBeLessThanOrEqual(s.max)
      }
    }
  })

  it('produces a default for every value setting', () => {
    const d = defaultValues()
    for (const s of SETTINGS) if ('default' in s) expect(d[s.key], s.key).toBe(s.default)
  })
})
