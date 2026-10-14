// Accent swatches from Figma (Settings → General → Accent color). Green is FLP's default.
export const ACCENTS = [
  { id: 'green', color: '#1f9a3a', contrast: '#f4f4f4' },
  { id: 'orange', color: '#d37918', contrast: '#141414' },
  { id: 'red', color: '#a13b26', contrast: '#f4f4f4' },
  { id: 'olive', color: '#8c721b', contrast: '#f4f4f4' },
  { id: 'teal', color: '#147a97', contrast: '#f4f4f4' },
  { id: 'blue', color: '#144497', contrast: '#f4f4f4' },
  { id: 'purple', color: '#6631b5', contrast: '#f4f4f4' },
  { id: 'pink', color: '#ab3c80', contrast: '#f4f4f4' },
  { id: 'grey', color: '#7e7e7e', contrast: '#141414' }
] as const

export type AccentId = (typeof ACCENTS)[number]['id']
export type ThemeMode = 'dark' | 'light' | 'system'
