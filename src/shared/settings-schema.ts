// Every setting, taken from the Figma settings pages. The Settings window, settings search,
// profiles and plugin settings all render from this one list. "advanced" rows sit behind the
// "Advanced Options" expander, as in the Figma.

export type PageId =
  | 'general' | 'interface' | 'privacy' | 'controls'
  | 'playback' | 'video' | 'audio' | 'subtitles' | 'library'
  | 'network' | 'performance' | 'recording' | 'extensions'

interface PageDef {
  id: PageId
  nav: string
  title: string
  group: 'App' | 'Media' | 'System'
  icon: string
}

export const PAGES: PageDef[] = [
  { id: 'general', nav: 'General', title: 'Global Settings', group: 'App', icon: 'preferences' },
  { id: 'interface', nav: 'Interface', title: 'Interface Settings', group: 'App', icon: 'interface' },
  { id: 'privacy', nav: 'Privacy', title: 'Privacy Settings', group: 'App', icon: 'privacy' },
  { id: 'controls', nav: 'Controls', title: 'Mouse, Keyboard & Remote Controls', group: 'App', icon: 'hotkeys' },
  { id: 'playback', nav: 'Playback', title: 'Playback Preferences', group: 'Media', icon: 'play' },
  { id: 'video', nav: 'Video', title: 'Video Defaults', group: 'Media', icon: 'video' },
  { id: 'audio', nav: 'Audio', title: 'Audio Defaults', group: 'Media', icon: 'audio' },
  { id: 'subtitles', nav: 'Subtitles', title: 'Subtitle Defaults', group: 'Media', icon: 'subtitles' },
  { id: 'library', nav: 'Library', title: 'Playlists, Folders & Files', group: 'Media', icon: 'folder' },
  { id: 'network', nav: 'Network', title: 'Network Connections & Security', group: 'System', icon: 'streaming' },
  { id: 'performance', nav: 'Performance', title: 'Performance Settings', group: 'System', icon: 'preferences' },
  { id: 'recording', nav: 'Recording', title: 'Recording, Casting & Streaming Out', group: 'System', icon: 'record' },
  { id: 'extensions', nav: 'Extensions', title: 'Add-ons & Scripts', group: 'System', icon: 'plugins' }
]

export interface Option<T = string | number> {
  value: T
  label: string
}

interface Base {
  key: string
  page: PageId
  section: string
  label: string
  info?: string
  advanced?: boolean
  keywords?: string[]
}

export type SettingDef = Base &
  (
    | { type: 'toggle'; default: boolean }
    | { type: 'select'; default: string | number; options: Option[] | DynamicOptions }
    | { type: 'segmented'; default: string; options: Option<string>[] }
    | { type: 'accent'; default: string }
    | {
        type: 'slider'
        default: number
        min: number
        max: number
        step: number
        ticks?: number[]
        labels?: { value: number; text: string }[]
        origin?: number
      }
    | { type: 'number'; default: number; min?: number; max?: number; step?: number; suffix?: string }
    | { type: 'text'; default: string; placeholder?: string; secret?: boolean }
    | { type: 'path'; default: string; directory?: boolean; placeholder?: string; filters?: string[] }
    | { type: 'color'; default: string }
    | { type: 'action'; button: string; command: string }
    | { type: 'custom'; component: string }
  )

/** Options filled in at runtime (audio devices, discs…). */
type DynamicOptions = { dynamic: 'audio-devices' | 'optical-drives' | 'languages' | 'displays' | 'eq-presets' }

const opts = (...labels: string[]): Option<string>[] =>
  labels.map((l) => ({ value: l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label: l }))

const secs = (vals: number[]) => vals.map((v) => ({ value: v, text: `${v} s` }))
const pct = (vals: number[]) => vals.map((v) => ({ value: v, text: `${v}%` }))

type Row = SettingDef extends infer T ? (T extends unknown ? Omit<T, 'page' | 'section'> : never) : never

const S = (page: PageId, section: string, rows: Row[]): SettingDef[] =>
  rows.map((r) => ({ ...r, page, section }) as SettingDef)

export const SETTINGS: SettingDef[] = [
  // ───────── General ─────────
  ...S('general', 'Appearance', [
    { key: 'general.language', label: 'Interface language', info: 'More languages are on the way.', type: 'select', default: 'en', options: [{ value: 'en', label: 'English' }] },
    { key: 'general.theme', label: 'Theme', type: 'segmented', default: 'dark', options: [
      { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }] },
    { key: 'general.accent', label: 'Accent color', type: 'accent', default: 'green' }
  ]),
  ...S('general', 'Startup', [
    { key: 'general.confirmDialogs', label: 'Show confirmation and error dialogs', info: 'Ask before destructive actions and show a message when a file fails to play.', type: 'toggle', default: true },
  ]),
  ...S('general', 'Diagnostics', [
    { key: 'general.developerMode', label: 'Developer mode', info: 'Shows developer tools and extra plugin logging.', type: 'toggle', default: false },
    { key: 'general.saveLog', label: 'Save a log', info: 'Playback messages are written to the log file (default: ~/Library/Logs/FLP/flp.log).', type: 'toggle', default: false },
    { key: 'general.logFile', label: 'Log file', type: 'path', default: '', placeholder: '~/Library/Logs/FLP/flp.log' },
    { key: 'general.logLevel', label: 'Log details', type: 'select', default: 'error', options: [
      { value: 'error', label: 'Errors only' }, { value: 'warn', label: 'Errors and warnings' }, { value: 'info', label: 'Everything' }, { value: 'debug', label: 'Debug' }] },
    { key: 'general.extraMpvOptions', label: 'Additional command line options', info: 'Extra mpv options, e.g. --deband=yes --sub-scale=1.2. Applied the next time FLP starts.', type: 'text', default: '', placeholder: '--option=value', advanced: true },
    { key: 'general.openConfig', label: 'Open configurations folder', type: 'action', button: 'Open', command: 'app.openConfigFolder', advanced: true },
    { key: 'general.reset', label: 'Reset all settings', type: 'action', button: 'Reset', command: 'settings.resetAll', advanced: true }
  ]),

  // ───────── Interface ─────────
  ...S('interface', 'Skin', [
    { key: 'interface.customSkin', label: 'Use a custom skin', info: 'Load your own CSS file to restyle FLP. Every colour is a CSS variable, e.g. --accent, --bg-chrome.', type: 'toggle', default: false },
    { key: 'interface.skinFile', label: 'Skin file', type: 'path', default: '', filters: ['css'] }
  ]),
  ...S('interface', 'Window', [
    { key: 'interface.resizeToVideo', label: 'Resize window to fit video', type: 'select', default: 'never', options: opts('Never', 'First video only', 'Always') },
    { key: 'interface.rememberWindow', label: 'Remember window size and position', type: 'toggle', default: true },
    { key: 'interface.alwaysOnTop', label: 'Keep window above other windows', type: 'select', default: 'never', options: opts('Never', 'While playing', 'Always') },
    { key: 'interface.titleShowsFile', label: 'Show the file name in the title bar', type: 'toggle', default: true },
    { key: 'interface.fullscreenScreen', label: 'Open fullscreen on', type: 'select', default: 'current', options: { dynamic: 'displays' } }
  ]),
  ...S('interface', 'Playback Controls', [
    { key: 'interface.compactStart', label: 'Start in compact mode', info: 'Open as a small floating picture-in-picture window.', type: 'toggle', default: false },
    { key: 'interface.autoHide', label: 'Auto-hide the controls', type: 'select', default: 'fullscreen', options: [
      { value: 'never', label: 'Never' }, { value: 'fullscreen', label: 'In fullscreen only' }, { value: 'always', label: 'Always' }] },
    { key: 'interface.hideAfter', label: 'Hide after', type: 'slider', default: 3, min: 0, max: 10, step: 0.5, ticks: [0, 2.5, 5, 7.5, 10], labels: secs([0, 5, 10]) },
    { key: 'interface.fullscreenControls', label: 'Show controls in fullscreen', type: 'toggle', default: true }
  ]),
  ...S('interface', 'Notifications and System Tray', [
    { key: 'interface.trayIcon', label: 'Show a menu bar icon', type: 'toggle', default: false, keywords: ['tray'] },
    { key: 'interface.startInTray', label: 'Start minimized to the menu bar', type: 'toggle', default: false, keywords: ['tray'] },
    { key: 'interface.trackPopup', label: 'Show a popup when the track changes', type: 'select', default: 'minimized', options: [
      { value: 'never', label: 'Never' }, { value: 'minimized', label: 'When minimized' }, { value: 'always', label: 'Always' }] },
    { key: 'interface.popupDuration', label: 'Popup duration', type: 'slider', default: 4, min: 0, max: 10, step: 0.5, ticks: [0, 2.5, 5, 7.5, 10], labels: secs([0, 5, 10]) }
  ]),
  ...S('interface', 'Playlist', [
    { key: 'interface.opacity', label: 'Window opacity', type: 'slider', default: 100, min: 10, max: 100, step: 1, labels: pct([10, 100]), advanced: true },
    { key: 'interface.pauseMinimized', label: 'Pause video when window is minimized', type: 'toggle', default: false, advanced: true },
    { key: 'interface.raiseOnPlay', label: 'Bring FLP to the front when playback starts', type: 'select', default: 'video', options: opts('Never', 'Video', 'Always'), advanced: true },
    { key: 'interface.coverArt', label: 'Show cover art in the window when playing audio', type: 'toggle', default: true, advanced: true },
    { key: 'interface.allowIconChange', label: 'Allow the app icon to change', info: 'Shows cover art in the Dock while music plays.', type: 'toggle', default: false, advanced: true },
    { key: 'interface.fsControlsOpacity', label: 'Fullscreen controls opacity', type: 'slider', default: 100, min: 10, max: 100, step: 1, labels: pct([10, 100]), advanced: true },
    { key: 'interface.fsSensitivity', label: 'Fullscreen controls sensitivity', type: 'slider', default: 2, min: 1, max: 3, step: 1, ticks: [1, 2, 3], labels: [{ value: 1, text: 'Low' }, { value: 2, text: 'Medium' }, { value: 3, text: 'High' }], advanced: true }
  ]),

  // ───────── Privacy ─────────
  ...S('privacy', 'History', [
    { key: 'privacy.saveRecent', label: 'Save recently played items', type: 'toggle', default: true },
    { key: 'privacy.rememberPosition', label: 'Remember the playback position', type: 'toggle', default: true },
    { key: 'privacy.neverRemember', label: 'Never remember items matching', info: 'Comma-separated words or folder paths.', type: 'text', default: '', placeholder: 'e.g. Private, ~/Downloads' },
    { key: 'privacy.clearHistory', label: 'Clear history now', type: 'action', button: 'Clear', command: 'library.clearHistory' }
  ]),

  // ───────── Controls ─────────
  ...S('controls', 'Keyboard Shortcuts', [
    { key: 'controls.editShortcuts', label: 'Defaults', type: 'action', button: 'Edit Keyboard Shortcuts', command: 'ui.keyboardShortcuts' },
    { key: 'controls.resetShortcuts', label: 'Reset all shortcuts', type: 'action', button: 'Reset', command: 'shortcuts.resetAll' }
  ]),
  ...S('controls', 'Skip Amounts', [
    { key: 'controls.skipVeryShort', label: 'Very short skip', type: 'number', default: 3, min: 1, max: 600, suffix: 's' },
    { key: 'controls.skipShort', label: 'Short skip', type: 'number', default: 10, min: 1, max: 600, suffix: 's' },
    { key: 'controls.skipMedium', label: 'Medium skip', type: 'number', default: 60, min: 1, max: 3600, suffix: 's' },
    { key: 'controls.skipLong', label: 'Long skip', type: 'number', default: 300, min: 1, max: 7200, suffix: 's' }
  ]),
  ...S('controls', 'Mouse', [
    { key: 'controls.click', label: 'Single click on the video', type: 'select', default: 'play-pause', options: opts('Nothing', 'Play / Pause', 'Toggle fullscreen', 'Show controls') },
    { key: 'controls.doubleClick', label: 'Double click on the video', type: 'select', default: 'toggle-fullscreen', options: opts('Nothing', 'Play / Pause', 'Toggle fullscreen') },
    { key: 'controls.wheel', label: 'Scroll wheel', type: 'select', default: 'volume', options: opts('Nothing', 'Volume', 'Seek', 'Zoom') },
    { key: 'controls.hWheel', label: 'Horizontal scroll', type: 'select', default: 'seek', options: opts('Nothing', 'Volume', 'Seek') },
    { key: 'controls.reverseWheel', label: 'Reverse scroll direction', type: 'toggle', default: false }
  ]),
  ...S('controls', 'Remotes', [
    { key: 'controls.webRemote', label: 'Web remote control', info: 'Control FLP from a phone or another computer on your network.', type: 'toggle', default: false },
    { key: 'controls.webRemotePort', label: 'Port', type: 'number', default: 8090, min: 1024, max: 65535 },
    { key: 'controls.webRemotePassword', label: 'Password', type: 'text', default: '', secret: true },
    { key: 'controls.webRemoteInfo', label: 'Remote address', type: 'custom', component: 'remote-info' },
    { key: 'controls.mediaKeys', label: 'Respond to media keys', info: 'Also shows FLP in Control Center\'s Now Playing.', type: 'toggle', default: true, advanced: true }
  ]),

  // ───────── Playback ─────────
  ...S('playback', 'Startup', [
    { key: 'playback.resume', label: 'Continue where you left off', type: 'select', default: 'always', options: opts('Always', 'Ask', 'Never') },
    { key: 'playback.autoplay', label: 'Start playing as soon as a file opens', type: 'toggle', default: true },
    { key: 'playback.speed', label: 'Default playback speed', type: 'slider', default: 1, min: 0.25, max: 2, step: 0.05,
      ticks: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], labels: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => ({ value: v, text: String(v) })) },
  ]),
  ...S('playback', 'Tracks', [
    { key: 'playback.videoQuality', label: 'Preferred video quality', info: 'Used for online videos and adaptive streams.', type: 'select', default: 'best', options: [
      { value: 'best', label: 'Best available' }, { value: '2160', label: '4K' }, { value: '1080', label: '1080p' }, { value: '720', label: '720p' }, { value: '480', label: '480p' }] },
    { key: 'playback.defaultAudioTrack', label: 'Default audio track', info: '0 = choose automatically by language. Otherwise always start with this track number.', type: 'number', default: 0, min: 0, max: 99 },
    { key: 'playback.defaultSubTrack', label: 'Default subtitle track', info: '0 = choose automatically by language. Otherwise always start with this track number.', type: 'number', default: 0, min: 0, max: 99 }
  ]),
  ...S('playback', 'Order', [
    { key: 'playback.repeat', label: 'Repeat', type: 'select', default: 'off', options: opts('Off', 'One', 'All') },
    { key: 'playback.shuffle', label: 'Shuffle', type: 'toggle', default: false },
    { key: 'playback.stopAfterEach', label: 'Stop after each item', type: 'toggle', default: false },
    { key: 'playback.whenFinished', label: 'When playback finishes', type: 'select', default: 'stop', options: opts('Stop', 'Quit', 'Return to library', 'Sleep computer') }
  ]),
  ...S('playback', 'Seeking', [
    { key: 'playback.preciseSeek', label: 'Seek precisely', info: 'Slower, but lands on the exact frame.', type: 'toggle', default: true },
    { key: 'playback.scrubThumbnail', label: 'Show thumbnail while scrubbing', type: 'toggle', default: true }
  ]),
  ...S('playback', 'Files & Discs', [
    { key: 'playback.opticalDrive', label: 'Default optical drive', type: 'select', default: '', options: { dynamic: 'optical-drives' } },
    { key: 'playback.repairAvi', label: 'Repair damaged AVI files', info: 'Rebuilds a missing or broken index so the file can be played and seeked.', type: 'select', default: 'auto', options: [
      { value: 'auto', label: 'When needed' }, { value: 'always', label: 'Always rebuild the index' }] },
    { key: 'playback.loadMatchingMkv', label: 'Load matching .mkv files from the same folder', info: 'Enables ordered chapters that span several files.', type: 'toggle', default: true },
    { key: 'playback.timeshiftFolder', label: 'Time-shift buffer folder', info: 'Store the rewind buffer for live streams on disk here instead of in memory.', type: 'path', default: '', directory: true, advanced: true },
    { key: 'playback.timeshiftSize', label: 'Time-shift buffer size', info: 'How far back you can rewind a live stream.', type: 'select', default: 'medium', options: opts('Small', 'Medium', 'Large'), advanced: true }
  ]),

  // ───────── Video ─────────
  ...S('video', 'Output', [
    { key: 'video.enabled', label: 'Enable video', type: 'toggle', default: true },
    { key: 'video.startFullscreen', label: 'Start videos in fullscreen', type: 'toggle', default: false },
    { key: 'video.stopScreensaver', label: 'Stop the screensaver during playback', type: 'toggle', default: true },
  ]),
  ...S('video', 'Picture', [
    { key: 'video.resetPicture', label: 'Reset picture', info: 'Resets brightness, contrast, colour and sharpness to their defaults.', type: 'action', button: 'Reset', command: 'video.resetPicture' }
  ]),
  ...S('video', 'Deinterlacing', [
    { key: 'video.deinterlace', label: 'Deinterlacing', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automatic' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] },
    { key: 'video.deinterlaceMethod', label: 'Method', type: 'select', default: 'auto', options: [
      { value: 'auto', label: 'Automatic' }, { value: 'bwdif', label: 'Bwdif' }, { value: 'yadif', label: 'Yadif' }, { value: 'yadif-double', label: 'Yadif (2x)' }, { value: 'w3fdif', label: 'W3FDIF' }] }
  ]),
  ...S('video', 'Framing', [
    { key: 'video.aspect', label: 'Aspect ratio', type: 'select', default: 'auto', options: [
      { value: 'auto', label: 'Automatic' }, ...['1:1', '4:3', '5:4', '16:9', '16:10', '2.21:1', '2.35:1', '2.39:1'].map((v) => ({ value: v, label: v }))] },
    { key: 'video.crop', label: 'Crop', type: 'select', default: 'none', options: [
      { value: 'none', label: 'None' }, ...['16:10', '16:9', '4:3', '1.85:1', '2.21:1', '2.35:1', '2.39:1', '5:3', '5:4', '1:1'].map((v) => ({ value: v, label: v }))] },
    { key: 'video.scaleToWindow', label: 'Scale video to the window', type: 'toggle', default: true },
    { key: 'video.zoom', label: 'Zoom', type: 'select', default: 'fit', options: [
      { value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Fill' }, { value: '0.5', label: '50%' }, { value: '1', label: '100%' }, { value: '2', label: '200%' }] },
    { key: 'video.position', label: 'Position in the window', type: 'select', default: 'center', options: opts('Center', 'Top', 'Bottom', 'Left', 'Right') },
    { key: 'video.customAspects', label: 'Custom aspect ratios', info: 'Comma-separated, e.g. 3:2, 21:9', type: 'text', default: '', advanced: true },
    { key: 'video.customCrops', label: 'Custom crop ratios', type: 'text', default: '', advanced: true },
    { key: 'video.monitorPixelAspect', label: 'Monitor pixel aspect ratio', info: 'Only change this for displays with non-square pixels, e.g. 1.2 or 4:3.', type: 'text', default: '1:1', advanced: true }
  ]),
  ...S('video', 'Snapshots', [
    { key: 'video.snapshotFolder', label: 'Save to', type: 'path', default: '', directory: true, placeholder: '~/Pictures' },
    { key: 'video.snapshotPrefix', label: 'File name prefix', type: 'text', default: 'flp-snap-' },
    { key: 'video.snapshotFormat', label: 'Format', type: 'select', default: 'png', options: [{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }, { value: 'jxl', label: 'JPEG XL' }] },
    { key: 'video.snapshotSize', label: 'Size', type: 'select', default: 'video', options: [{ value: 'video', label: 'Same as video' }, { value: 'window', label: 'As shown (with subtitles)' }] },
    { key: 'video.snapshotSequential', label: 'Number files sequentially', type: 'toggle', default: false },
    { key: 'video.snapshotPreview', label: 'Show a preview after capture', type: 'toggle', default: true }
  ]),

  // ───────── Audio ─────────
  ...S('audio', 'Output', [
    { key: 'audio.enabled', label: 'Enable audio', type: 'toggle', default: true },
    { key: 'audio.device', label: 'Output device', type: 'select', default: 'auto', options: { dynamic: 'audio-devices' } },
    { key: 'audio.channels', label: 'Speaker setup', type: 'select', default: 'auto', options: [
      { value: 'auto', label: 'Automatic' }, { value: 'stereo', label: 'Stereo' }, { value: 'mono', label: 'Mono' }, { value: '5.1', label: '5.1 surround' }, { value: '7.1', label: '7.1 surround' }] }
  ]),
  ...S('audio', 'Volume', [
    { key: 'audio.maxVolume', label: 'Maximum volume', type: 'slider', default: 130, min: 100, max: 300, step: 5, ticks: [100, 150, 200, 250, 300], labels: pct([100, 200, 300]) },
    { key: 'audio.startupVolume', label: 'Startup volume', info: 'Leave at the last used volume with "Remember".', type: 'number', default: 100, min: 0, max: 300, suffix: '%' },
    { key: 'audio.rememberVolume', label: 'Remember the last volume', type: 'toggle', default: true },
    { key: 'audio.volumeStep', label: 'Volume step', type: 'number', default: 5, min: 1, max: 25, suffix: '%' }
  ]),
  ...S('audio', 'Loudness', [
    { key: 'audio.normalize', label: 'Normalize loudness', type: 'toggle', default: false },
    { key: 'audio.normalizeTarget', label: 'Target level', type: 'number', default: -16, min: -40, max: -5, suffix: 'LUFS' },
    { key: 'audio.nightMode', label: 'Night mode', info: 'Makes quiet dialogue louder and loud explosions quieter.', type: 'toggle', default: false },
    { key: 'audio.replayGain', label: 'Replay gain', type: 'select', default: 'no', options: [{ value: 'no', label: 'Off' }, { value: 'track', label: 'Track' }, { value: 'album', label: 'Album' }] },
    { key: 'audio.replayGainPreamp', label: 'Replay gain preamp', type: 'number', default: 0, min: -15, max: 15, step: 0.5, suffix: 'dB' }
  ]),
  ...S('audio', 'Effects', [
    { key: 'audio.eq', label: 'Equalizer', type: 'toggle', default: false },
    { key: 'audio.eqPreset', label: 'Equalizer preset', type: 'select', default: 'flat', options: { dynamic: 'eq-presets' } },
    { key: 'audio.spatial', label: 'Spatial audio', type: 'toggle', default: false },
    { key: 'audio.spatialMode', label: 'Spatial audio mode', type: 'select', default: 'headphones', options: [
      { value: 'headphones', label: 'Headphone virtualization' }, { value: 'crossfeed', label: 'Crossfeed (gentle)' }] },
    { key: 'audio.stereoWiden', label: 'Stereo widening', type: 'toggle', default: false },
    { key: 'audio.compressor', label: 'Compressor', type: 'toggle', default: false },
    { key: 'audio.pitch', label: 'Pitch shift', type: 'number', default: 0, min: -12, max: 12, step: 0.5, suffix: 'semitones' },
    { key: 'audio.chorus', label: 'Chorus/flanger', type: 'toggle', default: false },
    { key: 'audio.karaoke', label: 'Karaoke', info: 'Removes centred vocals.', type: 'toggle', default: false }
  ]),
  ...S('audio', 'Tracks', [
    { key: 'audio.language', label: 'Preferred audio language', type: 'select', default: 'system', options: { dynamic: 'languages' } },
    { key: 'audio.delay', label: 'Audio delay', type: 'number', default: 0, min: -10, max: 10, step: 0.05, suffix: 's' }
  ]),
  ...S('audio', 'Visualization', [
    { key: 'audio.visualizer', label: 'Visualizer', type: 'select', default: 'waveform', options: opts('None', 'Waveform', 'Spectrum', 'Spectrometer') },
    { key: 'audio.passthrough', label: 'Pass compressed audio to the receiver', info: 'S/PDIF and HDMI passthrough for AC-3, E-AC-3 and DTS.', type: 'toggle', default: false, advanced: true },
    { key: 'audio.resampleQuality', label: 'Resampling quality', type: 'select', default: 'balanced', options: opts('Fast', 'Balanced', 'Best'), advanced: true },
    { key: 'audio.exclusive', label: 'Exclusive device access', type: 'toggle', default: false, advanced: true }
  ]),

  // ───────── Subtitles ─────────
  ...S('subtitles', 'Tracks & Languages', [
    { key: 'subtitles.enabled', label: 'Enable subtitles', type: 'toggle', default: true },
    { key: 'subtitles.language', label: 'Preferred language', type: 'select', default: 'system', options: { dynamic: 'languages' } },
    { key: 'subtitles.encoding', label: 'Text encoding', type: 'select', default: 'auto', options: [
      { value: 'auto', label: 'Automatic' }, { value: 'utf-8', label: 'UTF-8' }, { value: 'cp1252', label: 'Western (Windows-1252)' }, { value: 'cp1251', label: 'Cyrillic (Windows-1251)' },
      { value: 'cp1256', label: 'Arabic (Windows-1256)' }, { value: 'gb18030', label: 'Chinese (GB18030)' }, { value: 'big5', label: 'Chinese (Big5)' }, { value: 'shift-jis', label: 'Japanese (Shift-JIS)' }, { value: 'euc-kr', label: 'Korean (EUC-KR)' }] }
  ]),
  ...S('subtitles', 'Loading Subtitles', [
    { key: 'subtitles.autoload', label: 'Load subtitle files automatically', type: 'toggle', default: true },
    { key: 'subtitles.matching', label: 'File name matching', type: 'select', default: 'fuzzy', options: [
      { value: 'exact', label: 'Exact title' }, { value: 'fuzzy', label: 'Title with extra characters' }, { value: 'all', label: 'Any subtitle in the folder' }] },
    { key: 'subtitles.folders', label: 'Load subtitles from these folders', info: 'Comma-separated, relative to the video. e.g. Subs, subtitles', type: 'text', default: 'Subs, subs, subtitles', advanced: true }
  ]),
  ...S('subtitles', 'Appearance', [
    { key: 'subtitles.font', label: 'Font', type: 'text', default: 'System, sans-serif' },
    { key: 'subtitles.fontSize', label: 'Font size', type: 'slider', default: 46, min: 20, max: 100, step: 1, labels: [{ value: 20, text: 'Small' }, { value: 100, text: 'Huge' }] },
    { key: 'subtitles.bold', label: 'Bold', type: 'toggle', default: false },
    { key: 'subtitles.color', label: 'Text color', type: 'color', default: '#FFFFFF' },
    { key: 'subtitles.opacity', label: 'Text opacity', type: 'slider', default: 100, min: 0, max: 100, step: 1, ticks: [0, 50, 100], labels: pct([0, 50, 100]) },
    { key: 'subtitles.outline', label: 'Outline thickness', type: 'select', default: 'normal', options: [
      { value: 'none', label: 'None' }, { value: 'thin', label: 'Thin' }, { value: 'normal', label: 'Normal' }, { value: 'thick', label: 'Thick' }] },
    { key: 'subtitles.outlineColor', label: 'Outline color', type: 'color', default: '#000000' },
    { key: 'subtitles.shadow', label: 'Shadow', type: 'toggle', default: false },
    { key: 'subtitles.shadowColor', label: 'Shadow color', type: 'color', default: '#000000' },
    { key: 'subtitles.shadowDistance', label: 'Shadow distance', type: 'select', default: 'small', options: opts('Small', 'Medium', 'Large') },
    { key: 'subtitles.background', label: 'Background', type: 'select', default: 'none', options: [{ value: 'none', label: 'None' }, { value: 'box', label: 'Box behind text' }] },
    { key: 'subtitles.backgroundColor', label: 'Background color', type: 'color', default: '#000000' },
    { key: 'subtitles.backgroundOpacity', label: 'Background opacity', type: 'slider', default: 50, min: 0, max: 100, step: 1, ticks: [0, 50, 100], labels: pct([0, 50, 100]) },
    { key: 'subtitles.position', label: 'Vertical position', type: 'select', default: 'bottom', options: opts('Bottom', 'Raised', 'Middle', 'Top') },
    { key: 'subtitles.ignoreAssStyle', label: 'Ignore styling in ASS and SSA subtitles', type: 'toggle', default: false, advanced: true },
  ]),
  ...S('subtitles', 'Timing', [
    { key: 'subtitles.delay', label: 'Subtitle delay', type: 'slider', default: 0, min: -5, max: 5, step: 0.05, origin: 0, ticks: [-5, -2.5, 0, 2.5, 5], labels: [{ value: -5, text: '-5 s' }, { value: 0, text: '0 s' }, { value: 5, text: '+5 s' }] }
  ]),
  ...S('subtitles', 'On-Screen Messages', [
    { key: 'subtitles.osdFeedback', label: 'Show feedback for shortcuts', info: 'e.g. "Volume 80%" when you press a key.', type: 'toggle', default: true },
    { key: 'subtitles.osdDuration', label: 'Show feedback for', type: 'slider', default: 1.5, min: 0.5, max: 5, step: 0.5, labels: [{ value: 0.5, text: '0.5 s' }, { value: 5, text: '5 s' }] },
    { key: 'subtitles.showFilename', label: 'Show filename when a video starts', type: 'toggle', default: false },
    { key: 'subtitles.filenameDuration', label: 'Show filename for', type: 'slider', default: 3, min: 1, max: 10, step: 0.5, labels: secs([1, 10]) }
  ]),

  // ───────── Library ─────────
  ...S('library', 'Opening Files', [
    { key: 'library.singleInstance', label: 'Only allow one FLP window', type: 'toggle', default: true },
    { key: 'library.enqueueFromFinder', label: 'Apply to files opened from the file manager', type: 'toggle', default: true },
    { key: 'library.enqueue', label: 'Add to the playlist instead of replacing it', type: 'toggle', default: false },
    { key: 'library.folderMode', label: 'When opening a folder', type: 'select', default: 'recursive', options: [
      { value: 'recursive', label: 'Include subfolders' }, { value: 'flat', label: 'This folder only' }] },
    { key: 'library.showHidden', label: 'Show hidden files', type: 'toggle', default: false }
  ]),
  ...S('library', 'Metadata & Artwork', [
    { key: 'library.metadataSource', label: 'Fetch titles and artwork', type: 'select', default: 'folder', options: [
      { value: 'file', label: 'From the file only' }, { value: 'folder', label: 'From the file and folder (cover.jpg)' }] },
    { key: 'library.enabled', label: 'Use the media library', info: 'Scan your media folders to fill Home, Videos and Music.', type: 'toggle', default: true },
    { key: 'library.folders', label: 'Media folders', type: 'custom', component: 'media-folders' },
    { key: 'library.rescan', label: 'Rescan media folders', type: 'action', button: 'Rescan', command: 'library.rescan', advanced: true }
  ]),

  // ───────── Network ─────────
  ...S('network', 'Buffering', [
    { key: 'network.buffering', label: 'Buffering', info: 'How much of a network stream to load ahead.', type: 'select', default: 'normal', options: opts('Low latency', 'Normal', 'Large', 'Custom') },
    { key: 'network.cacheNetwork', label: 'Custom buffer', info: 'Used when Buffering is set to Custom.', type: 'number', default: 10, min: 0, max: 600, step: 1, suffix: 's' },
  ]),
  ...S('network', 'Proxy', [
    { key: 'network.proxy', label: 'HTTP proxy', info: 'e.g. http://proxy.example.com:8080. Leave empty for a direct connection.', type: 'text', default: '', placeholder: 'No proxy' },
    { key: 'network.proxyUser', label: 'HTTP proxy user name', type: 'text', default: '' },
    { key: 'network.proxyPassword', label: 'HTTP proxy password', type: 'text', default: '', secret: true }
  ]),
  ...S('network', 'Security', [
    { key: 'network.verifyTls', label: 'Verify certificates against the system trust store', type: 'toggle', default: true },
    { key: 'network.userAgent', label: 'User agent', type: 'text', default: '', placeholder: 'Default', advanced: true },
    { key: 'network.ytdlFormat', label: 'Online video format', info: 'yt-dlp format string for YouTube and similar sites.', type: 'text', default: '', placeholder: 'Matches "Preferred video quality"', advanced: true }
  ]),

  // ───────── Performance ─────────
  ...S('performance', 'Decoding', [
    { key: 'performance.hwdec', label: 'Hardware-accelerated decoding', type: 'select', default: 'auto-safe', options: [
      { value: 'auto-safe', label: 'Automatic' }, { value: 'videotoolbox', label: 'VideoToolbox' }, { value: 'no', label: 'Off' }] },
    { key: 'performance.postProcessing', label: 'Video post-processing', info: 'Debanding removes colour stripes in gradients.', type: 'select', default: 'off', options: [
      { value: 'off', label: 'Off' }, { value: 'deband', label: 'Debanding' }, { value: 'high', label: 'High quality scaling + debanding' }] },
    { key: 'performance.skipLoopFilter', label: 'Skip the H.264 loop filter', info: 'Faster on slow computers, slightly lower quality.', type: 'select', default: 'default', options: [
      { value: 'default', label: 'Never' }, { value: 'nonref', label: 'Non-reference frames' }, { value: 'all', label: 'Always' }] },
    { key: 'performance.threads', label: 'Decoding threads', info: '0 = automatic', type: 'number', default: 0, min: 0, max: 64 }
  ]),
  ...S('performance', 'Smooth Playback', [
    { key: 'performance.dropFrames', label: "Drop frames when the system can't keep up", type: 'toggle', default: true },
    { key: 'performance.displaySync', label: 'Sync video to the display refresh rate', info: 'Smoother motion; may resample audio slightly.', type: 'toggle', default: false },
    { key: 'performance.interpolation', label: 'Motion smoothing (interpolation)', type: 'toggle', default: false },
    { key: 'performance.reloadPlugins', label: 'Reload plugins', type: 'action', button: 'Reload', command: 'plugins.reload', advanced: true }
  ]),
  ...S('performance', 'Developer', [
    { key: 'performance.decoder', label: 'Decoder', info: 'Force a specific decoder (ffmpeg name).', type: 'text', default: '', placeholder: 'Automatic', advanced: true },
    { key: 'performance.demuxerMax', label: 'Demuxer cache size', type: 'number', default: 150, min: 16, max: 4096, suffix: 'MB', advanced: true }
  ]),

  // ───────── Recording ─────────
  ...S('recording', 'Recording', [
    { key: 'recording.folder', label: 'Save recordings to', type: 'path', default: '~/Movies', directory: true },
  ]),
  ...S('recording', 'Casting', [
    { key: 'recording.discoverCast', label: 'Discover cast devices', info: 'Lets "Cast to TV or speaker" search your network for DLNA/UPnP TVs and speakers.', type: 'toggle', default: true },
  ]),
  ...S('recording', 'Streaming', [
    { key: 'recording.playLocally', label: 'Keep playing here while streaming', type: 'toggle', default: true },
    { key: 'recording.includeAudio', label: 'Include audio', type: 'toggle', default: true },
    { key: 'recording.includeVideo', label: 'Include video', type: 'toggle', default: true },
    { key: 'recording.preset', label: 'Encoding preset', type: 'select', default: 'medium', options: opts('Ultrafast', 'Fast', 'Medium', 'Slow') },
    { key: 'recording.tune', label: 'Tuning', type: 'select', default: 'none', options: opts('None', 'Film', 'Animation', 'Grain', 'Zero latency') }
  ]),

  // ───────── Extensions ─────────
  ...S('extensions', 'Add-ons', [
    { key: 'extensions.list', label: 'Installed add-ons', type: 'custom', component: 'plugin-list' },
    { key: 'extensions.loadOnStartup', label: 'Load add-ons on startup', type: 'toggle', default: true },
    { key: 'extensions.mpvScripts', label: 'Load mpv scripts', info: 'Lua and JavaScript scripts from the mpv-scripts folder. Applied the next time FLP starts.', type: 'toggle', default: true, advanced: true },
    { key: 'extensions.openFolder', label: 'Open the plugins folder', type: 'action', button: 'Open', command: 'plugins.openFolder', advanced: true },
    { key: 'extensions.create', label: 'Create a new plugin', type: 'action', button: 'Create', command: 'plugins.create', advanced: true }
  ])
]

export type SettingValues = Record<string, unknown>

export function defaultValues(defs: SettingDef[] = SETTINGS): SettingValues {
  const out: SettingValues = {}
  for (const d of defs) if ('default' in d) out[d.key] = d.default
  return out
}

export const settingByKey = new Map(SETTINGS.map((s) => [s.key, s]))
