// The Figma "…" menu and right-click menu. Every entry is a command, so shortcuts shown here
// are always the user's current ones.
import type { MenuEntry } from '@/components/Menu'
import { getCommand, formatKey, runCommand } from '@/commands/registry'
import { keysFor } from '@/commands/keys'
import { player, usePlayer } from '@/state/player'
import { getSetting, setSetting, useSettings } from '@/state/settings'
import { openPaths, setSpeed, trackLabel } from '@/state/playback'
import { ui, useUi } from '@/state/ui'
import { BUILTIN_ASPECTS, BUILTIN_CROPS, withCustom } from '@/state/ratios'
import type { IconName } from '@/components/Icon'
import { usePlugins } from '@/plugins/state'

/** A menu entry for a command, with its icon and current shortcut. */
export function cmd(id: string, label?: string, icon?: IconName): MenuEntry {
  const c = getCommand(id)
  if (!c) return { label: label ?? id, disabled: true }
  const key = keysFor(c)[0]
  return { label: label ?? c.title, icon: icon ?? c.icon, hint: key ? formatKey(key) : undefined, run: () => void runCommand(id) }
}

function recentMenu(): MenuEntry[] {
  const recent = (useSettings.getState().ui.recent as string[] | undefined) ?? []
  if (!recent.length) return [{ label: 'Nothing played yet', disabled: true }]
  return [
    ...recent.slice(0, 15).map((path): MenuEntry => ({ label: path.split('/').pop() || path, run: () => void openPaths([path]) })),
    'separator',
    { label: 'Clear recent', run: () => window.flp.settings.setUi('recent', []) }
  ]
}

function profileMenu(): MenuEntry[] {
  const { profiles, activeProfile } = useSettings.getState()
  return [
    { label: 'Default', checked: activeProfile === null, run: () => window.flp.settings.setProfile(null) },
    ...profiles.map((p): MenuEntry => ({ label: p.name, checked: activeProfile === p.id, run: () => window.flp.settings.setProfile(p.id) })),
    'separator',
    { label: 'New', icon: 'add', iconState: 'default', run: () => ui.openDialog('profiles', 'new') },
    { label: 'Manage profiles…', run: () => ui.openDialog('profiles') }
  ]
}

export function mainMenu(): MenuEntry[] {
  const { profiles, activeProfile } = useSettings.getState()
  const profileName = profiles.find((p) => p.id === activeProfile)?.name ?? 'Default'
  return [
    cmd('media.openFile', 'Open File(s)'),
    cmd('media.openFolder', 'Open Folder'),
    cmd('media.openNetwork', 'Open Network Stream'),
    cmd('media.openDisc', 'Open Disc'),
    cmd('media.openCapture', 'Open Capture Device'),
    cmd('media.convert', 'Convert'),
    cmd('media.stream', 'Stream'),
    { label: 'Open Recent', icon: 'recent', submenu: recentMenu },
    'separator',
    { label: `Profile (${profileName})`, icon: 'profile', submenu: profileMenu },
    cmd('ui.keyboardShortcuts', 'Keyboard Shortcuts'),
    cmd('ui.customizePlayer', 'Customize Player'),
    cmd('ui.settings', 'Settings'),
    cmd('app.about', 'About FLP')
  ]
}

function trackMenu(type: 'audio' | 'sub' | 'video'): MenuEntry[] {
  const prop = type === 'audio' ? 'aid' : type === 'sub' ? 'sid' : 'vid'
  const tracks = usePlayer.getState().tracks.filter((t) => t.type === type && !t.albumart)
  const none = !tracks.some((t) => t.selected)
  return [
    { label: type === 'sub' ? 'Off' : 'Disable', checked: none, run: () => void player.set(prop, 'no') },
    ...tracks.map((t): MenuEntry => ({ label: trackLabel(t), checked: t.selected, run: () => void player.set(prop, t.id) }))
  ]
}

const speedMenu = (): MenuEntry[] =>
  [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map((s) => ({
    label: s === 1 ? 'Normal' : `${s}×`,
    checked: Math.abs(usePlayer.getState().speed - s) < 0.001,
    run: () => void setSpeed(s)
  }))

const choice = (key: string, options: [string, string][]): MenuEntry[] =>
  options.map(([value, label]) => ({ label, checked: String(getSetting(key)) === value, run: () => setSetting(key, value) }))

export function rightClickMenu(): MenuEntry[] {
  const s = usePlayer.getState()
  const chapters = s.chapters
  return [
    cmd('player.playPause', s.paused ? 'Play' : 'Pause', s.paused ? 'play' : 'pause'),
    cmd('player.stop', 'Stop'),
    cmd('player.previous', 'Previous Item'),
    cmd('player.next', 'Next Item'),
    cmd('player.record', s.recording ? 'Stop Recording' : 'Record'),
    'separator',
    cmd('ui.hideUi', useUi.getState().hideUi ? 'Show UI' : 'Hide UI'),
    'separator',
    {
      label: 'Playback', icon: 'playback', submenu: () => [
        { label: 'Speed', icon: 'speed', submenu: speedMenu },
        ...(chapters.length ? [{ label: 'Chapters', icon: 'chapters' as const, submenu: () => chapters.map((c, i): MenuEntry => ({
          label: c.title || `Chapter ${i + 1}`, checked: s.chapter === i, run: () => void player.set('chapter', i) })) }] : []),
        cmd('player.repeat'), cmd('player.shuffle'), cmd('player.abLoop'),
        'separator',
        cmd('player.forwardShort'), cmd('player.backShort'), cmd('player.frameStep'), cmd('player.frameBack')
      ]
    },
    {
      label: 'Video', icon: 'video', submenu: () => [
        { label: 'Video Track', submenu: () => trackMenu('video') },
        { label: 'Aspect Ratio', submenu: () => choice('video.aspect', [['auto', 'Automatic'], ...withCustom('video.aspect', BUILTIN_ASPECTS).map((r): [string, string] => [r, r])]) },
        { label: 'Crop', submenu: () => choice('video.crop', [['none', 'None'], ...withCustom('video.crop', BUILTIN_CROPS).map((r): [string, string] => [r, r])]) },
        { label: 'Zoom', submenu: () => choice('video.zoom', [['fit', 'Fit'], ['fill', 'Fill'], ['0.5', '50%'], ['1', '100%'], ['2', '200%']]) },
        { label: 'Deinterlace', submenu: () => choice('video.deinterlace', [['auto', 'Automatic'], ['on', 'On'], ['off', 'Off']]) },
        'separator',
        cmd('video.rotate'), cmd('video.flip'), cmd('player.snapshot'), cmd('ui.pip'), cmd('window.fullscreen'), cmd('cast.to'),
        'separator',
        cmd('video.effects', 'Adjustments & Effects…')
      ]
    },
    {
      label: 'Audio', icon: 'audio', submenu: () => [
        { label: 'Audio Track', submenu: () => trackMenu('audio') },
        { label: 'Stereo Mode', submenu: () => choice('audio.channels', [['auto', 'Automatic'], ['stereo', 'Stereo'], ['mono', 'Mono']]) },
        cmd('audio.mute'), cmd('audio.normalize'), cmd('audio.toggleEq'),
        'separator',
        cmd('audio.effects', 'Equalizer & Effects…')
      ]
    },
    {
      label: 'Subtitle', icon: 'subtitles', submenu: () => [
        { label: 'Subtitle Track', submenu: () => trackMenu('sub') },
        cmd('subs.add', 'Add Subtitle File…'),
        cmd('subs.toggle'),
        cmd('subs.delayUp'), cmd('subs.delayDown'),
        'separator',
        cmd('subs.panel', 'Subtitle Options…')
      ]
    },
    'separator',
    {
      label: 'More Settings', icon: 'settings', submenu: () => [
        cmd('ui.settings', 'All Settings…'), cmd('ui.keyboardShortcuts'), cmd('ui.customizePlayer'), cmd('ui.mediaInfo'), cmd('ui.alwaysOnTop'), cmd('ui.palette', 'Find Any Action…')
      ]
    },
    {
      label: 'Playlist', icon: 'playlist', submenu: () => [
        cmd('ui.playlist', 'Show Playlist'), cmd('player.shuffle'), cmd('player.repeat'), cmd('playlist.clear')
      ]
    },
    {
      label: 'Open Media', icon: 'file', submenu: () => [
        cmd('media.openFile', 'Open File(s)'), cmd('media.openFolder', 'Open Folder'), cmd('media.openNetwork', 'Open Network Stream'),
        cmd('media.openDisc', 'Open Disc'), cmd('media.openCapture', 'Open Capture Device'), { label: 'Open Recent', icon: 'recent', submenu: recentMenu }
      ]
    },
    ...pluginMenu(),
    'separator',
    { label: 'Quit FLP', icon: 'quit', hint: '⌘Q', run: () => window.flp.window.close() }
  ]
}

/** Items plugins add to the right-click menu, plus their commands, under "Plugins". */
function pluginMenu(): MenuEntry[] {
  const { menuItems, commands } = usePlugins.getState().contributions
  if (!menuItems.length && !commands.length) return []
  const items: MenuEntry[] = menuItems.map((m) => ({ label: m.label, run: () => void runCommand(m.command) }))
  const extra = commands.filter((c) => !menuItems.some((m) => m.command === c.id)).map((c) => cmd(c.id))
  return [{ label: 'Plugins', icon: 'plugins', submenu: [...items, ...(items.length && extra.length ? ['separator' as const] : []), ...extra] }]
}
