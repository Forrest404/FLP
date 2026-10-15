// Aspect-ratio and crop choices: the built-in ones plus the user's video.customAspects / video.customCrops.
import { getSetting } from './settings'

export const BUILTIN_ASPECTS = ['16:9', '4:3', '16:10', '2.35:1', '1:1']
export const BUILTIN_CROPS = ['16:9', '4:3', '2.35:1', '1.85:1']

/** "3:2, 21:9, junk, 0:1" → ['3:2', '21:9']. Only W:H with positive numbers. */
function parseRatios(text: unknown): string[] {
  const out: string[] = []
  for (const raw of String(text ?? '').split(',')) {
    const r = raw.trim().replace(/\s*:\s*/, ':')
    const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(r)
    if (m && Number(m[1]) > 0 && Number(m[2]) > 0 && !out.includes(r)) out.push(r)
  }
  return out
}

/** Built-in values followed by the user's custom ones (no duplicates). */
export function withCustom(key: 'video.aspect' | 'video.crop', builtin: string[]): string[] {
  const custom = parseRatios(getSetting(key === 'video.aspect' ? 'video.customAspects' : 'video.customCrops'))
  return [...builtin, ...custom.filter((r) => !builtin.includes(r))]
}

/** Select options with the custom ratios appended. */
export function withCustomOptions(base: { value: string; label: string }[], customText: unknown): { value: string; label: string }[] {
  const extra = parseRatios(customText).filter((r) => !base.some((o) => o.value === r))
  return extra.length ? [...base, ...extra.map((r) => ({ value: r, label: r }))] : base
}
