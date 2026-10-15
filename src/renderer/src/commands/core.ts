// Built-in commands. Default shortcuts follow VLC where it has one, so muscle memory carries over.
import { player, usePlayer } from '@/state/player'
import { getSetting, setSetting } from '@/state/settings'
import { showOsd, ui, useUi } from '@/state/ui'
import { changeVolume, nextSpeed, openPaths, seekBy, setSpeed, trackLabel } from '@/state/playback'
import { registerCommands, runCommand, type Command } from './registry'

const p = () => usePlayer.getState()
const skip = (key: string, fallback: number) => getSetting<number>(key) ?? fallback

async function cycleTrack(type: 'audio' | 'sub' | 'video') {
  const prop = type === 'audio' ? 'aid' : type === 'sub' ? 'sid' : 'vid'
  await player.command('cycle', prop)
  setTimeout(() => {
    const t = p().tracks.find((x) => x.type === type && x.selected)
    const what = type === 'audio' ? 'Audio' : type === 'sub' ? 'Subtitles' : 'Video'
    showOsd(t ? `${what}: ${trackLabel(t)}` : `${what}: Off`)
  }, 120)
}

async function cycleSetting(key: string, values: string[], label: string) {
  const cur = String(getSetting(key))
  const next = values[(values.indexOf(cur) + 1) % values.length]
  setSetting(key, next)
  showOsd(`${label}: ${next === 'auto' || next === 'none' || next === 'fit' ? 'Default' : next}`)
}

const playback: Command[] = [
  { id: 'player.playPause', title: 'Play / pause', category: 'Playback', icon: 'play', keys: ['Space'],
    run: async () => {
      if (p().idle && !p().path) return ui.set({ view: 'library' })
      if (p().eof) await player.command('seek', 0, 'absolute')
      await player.command('cycle', 'pause')
    } },
  { id: 'player.play', title: 'Play', category: 'Playback', icon: 'play', hidden: true, run: () => player.set('pause', false) },
  { id: 'player.pause', title: 'Pause', category: 'Playback', icon: 'pause', hidden: true, run: () => player.set('pause', true) },
  { id: 'player.stop', title: 'Stop playback', category: 'Playback', icon: 'stop', keys: ['S'],
    run: async () => {
      await player.command('stop')
      ui.set({ view: 'library' })
    } },
  { id: 'player.next', title: 'Next item', category: 'Playback', icon: 'next', keys: ['N', 'Shift+Period'], run: () => player.command('playlist-next', 'force') },
  { id: 'player.previous', title: 'Previous item', category: 'Playback', icon: 'previous', keys: ['P', 'Shift+Comma'],
    run: async () => {
      // Like most players: restart the item if we're more than a few seconds in.
      if (p().time > 3) await player.command('seek', 0, 'absolute')
      else await player.command('playlist-prev', 'force')
    } },
  { id: 'player.replay', title: 'Replay from the start', category: 'Playback', icon: 'replay', run: () => player.command('seek', 0, 'absolute') },
  { id: 'player.forwardVeryShort', title: 'Jump forward (very short)', category: 'Navigation', keys: ['Shift+ArrowRight'], run: () => seekBy(skip('controls.skipVeryShort', 3)) },
  { id: 'player.backVeryShort', title: 'Jump back (very short)', category: 'Navigation', keys: ['Shift+ArrowLeft'], run: () => seekBy(-skip('controls.skipVeryShort', 3)) },
  { id: 'player.forwardShort', title: 'Jump forward (short)', category: 'Navigation', keys: ['ArrowRight'], run: () => seekBy(skip('controls.skipShort', 10)) },
  { id: 'player.backShort', title: 'Jump back (short)', category: 'Navigation', keys: ['ArrowLeft'], run: () => seekBy(-skip('controls.skipShort', 10)) },
  { id: 'player.forwardMedium', title: 'Jump forward (medium)', category: 'Navigation', keys: ['Alt+ArrowRight'], run: () => seekBy(skip('controls.skipMedium', 60)) },
  { id: 'player.backMedium', title: 'Jump back (medium)', category: 'Navigation', keys: ['Alt+ArrowLeft'], run: () => seekBy(-skip('controls.skipMedium', 60)) },
  { id: 'player.forwardLong', title: 'Jump forward (long)', category: 'Navigation', keys: ['Mod+ArrowRight'], run: () => seekBy(skip('controls.skipLong', 300)) },
  { id: 'player.backLong', title: 'Jump back (long)', category: 'Navigation', keys: ['Mod+ArrowLeft'], run: () => seekBy(-skip('controls.skipLong', 300)) },
  { id: 'player.forward10', title: 'Forward 10 seconds', category: 'Navigation', icon: 'forward-10-sec', run: () => seekBy(10) },
  { id: 'player.back10', title: 'Backward 10 seconds', category: 'Navigation', icon: 'backward-10-sec', run: () => seekBy(-10) },
  { id: 'player.forward15', title: 'Forward 15 seconds', category: 'Navigation', icon: 'forward-15-sec', run: () => seekBy(15) },
  { id: 'player.back15', title: 'Backward 15 seconds', category: 'Navigation', icon: 'backward-15-sec', run: () => seekBy(-15) },
  { id: 'player.frameStep', title: 'Next frame', category: 'Navigation', keys: ['Period', 'E'], run: () => player.command('frame-step') },
  { id: 'player.frameBack', title: 'Previous frame', category: 'Navigation', keys: ['Comma', 'Shift+E'], run: () => player.command('frame-back-step') },
  { id: 'player.nextChapter', title: 'Next chapter', category: 'Navigation', icon: 'chapters', keys: ['Shift+N'], run: () => player.command('add', 'chapter', 1) },
  { id: 'player.prevChapter', title: 'Previous chapter', category: 'Navigation', keys: ['Shift+P'], run: () => player.command('add', 'chapter', -1) },
  { id: 'player.nextProgram', title: 'Next program / Service ID', category: 'Navigation', keys: ['X'], run: () => player.command('cycle', 'program') },
  { id: 'player.speedUp', title: 'Faster', category: 'Playback', icon: 'speed', keys: ['BracketRight'], run: () => setSpeed(nextSpeed(1)) },
  { id: 'player.speedDown', title: 'Slower', category: 'Playback', keys: ['BracketLeft'], run: () => setSpeed(nextSpeed(-1)) },
  { id: 'player.speedFineUp', title: 'Faster (fine)', category: 'Playback', keys: ['Shift+BracketRight'], run: () => setSpeed(p().speed + 0.05) },
  { id: 'player.speedFineDown', title: 'Slower (fine)', category: 'Playback', keys: ['Shift+BracketLeft'], run: () => setSpeed(p().speed - 0.05) },
  { id: 'player.speedReset', title: 'Normal speed', category: 'Playback', keys: ['Equal'], run: () => setSpeed(1) },
  { id: 'player.speedMenu', title: 'Playback speed', category: 'Playback', icon: 'speed', run: () => ui.togglePanel('playback') },
  { id: 'player.repeat', title: 'Repeat (off / one / all)', category: 'Playback', icon: 'repeat', keys: ['R'],
    active: () => p().loopFile || p().loopPlaylist,
    run: async () => {
      const { loopFile, loopPlaylist } = p()
      if (!loopFile && !loopPlaylist) {
        await player.set('loop-playlist', 'inf')
        showOsd('Repeat all')
      } else if (loopPlaylist) {
        await player.set('loop-playlist', 'no')
        await player.set('loop-file', 'inf')
        showOsd('Repeat one')
      } else {
        await player.set('loop-file', 'no')
        showOsd('Repeat off')
      }
    } },
  { id: 'player.shuffle', title: 'Shuffle', category: 'Playback', icon: 'shuffle', keys: ['Shift+Z'],
    active: () => useUi.getState().shuffled,
    run: async () => {
      const on = !useUi.getState().shuffled
      await player.command(on ? 'playlist-shuffle' : 'playlist-unshuffle')
      ui.set({ shuffled: on })
      showOsd(on ? 'Shuffle on' : 'Shuffle off')
    } },
  { id: 'player.abLoop', title: 'A-B loop (set A, set B, clear)', category: 'Playback', keys: ['Shift+L'],
    active: () => p().abA !== null,
    run: async () => {
      await player.command('ab-loop')
      setTimeout(() => {
        const { abA, abB } = p()
        showOsd(abA === null ? 'A-B loop cleared' : abB === null ? 'Loop start (A) set' : 'Looping A → B')
      }, 100)
    } },
  { id: 'player.record', title: 'Record', category: 'Playback', icon: 'record', keys: ['Shift+R'],
    active: () => p().recording,
    run: async () => {
      if (p().recording) {
        await player.set('stream-record', '')
        showOsd('Recording saved')
        return
      }
      const dir = String(getSetting('recording.folder') || '~/Movies')
      const name = `FLP Recording ${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.mkv`
      await player.set('stream-record', `${dir}/${name}`)
      showOsd('Recording…')
    } },
  { id: 'player.snapshot', title: 'Take a snapshot', category: 'Video', icon: 'snapshot', keys: ['Shift+S'],
    run: async () => {
      const withSubs = getSetting('video.snapshotSize') === 'window'
      const res = (await player.command('screenshot', withSubs ? 'subtitles' : 'video')) as { filename?: string } | undefined
      showOsd(res?.filename ? `Snapshot saved: ${res.filename.split('/').pop()}` : 'Snapshot saved')
    } }
]

const library: Command[] = [
  { id: 'player.bookmark', title: 'Add bookmark', category: 'Playback', icon: 'bookmark', keys: ['Mod+B'],
    run: async () => {
      const { path, time } = p()
      if (!path) return
      const { fmtTime } = await import('@/state/playback')
      await window.flp.library.addBookmark(path, time, `Bookmark at ${fmtTime(time)}`)
      window.dispatchEvent(new Event('flp:bookmarks-changed'))
      showOsd(`Bookmarked ${fmtTime(time)}`)
    } },
  { id: 'ui.bookmarks', title: 'Bookmarks', category: 'Playback', icon: 'bookmarks', run: () => ui.set({ rightPanel: 'playback' }) },
  { id: 'ui.chapters', title: 'Chapters', category: 'Navigation', icon: 'chapters', run: () => ui.set({ rightPanel: 'playback' }) },
  { id: 'library.favorite', title: 'Favorite', category: 'Library', icon: 'favorite', keys: ['Mod+Shift+F'],
    run: async () => {
      const path = p().path
      if (!path) return
      const item = await window.flp.library.item(path)
      const on = !item?.favorite
      await window.flp.library.setFavorite(path, on)
      showOsd(on ? 'Added to favorites' : 'Removed from favorites')
    } },
  { id: 'library.rescan', title: 'Rescan media folders', category: 'Library', icon: 'refresh', run: () => window.flp.library.rescan() },
  { id: 'library.clearHistory', title: 'Clear playback history', category: 'Library', icon: 'remove', run: () => window.flp.library.clearHistory() },
  { id: 'library.addFolder', title: 'Add a media folder…', category: 'Library', icon: 'new-folder', run: () => window.dispatchEvent(new CustomEvent('flp:add-library-folder')) }
]

const audio: Command[] = [
  { id: 'audio.volumeUp', title: 'Volume up', category: 'Audio', keys: ['ArrowUp'], run: () => changeVolume(getSetting<number>('audio.volumeStep') ?? 5) },
  { id: 'audio.volumeDown', title: 'Volume down', category: 'Audio', keys: ['ArrowDown'], run: () => changeVolume(-(getSetting<number>('audio.volumeStep') ?? 5)) },
  { id: 'audio.mute', title: 'Mute', category: 'Audio', icon: 'volume-0', keys: ['M'], active: () => p().muted,
    run: async () => {
      await player.command('cycle', 'mute')
      showOsd(p().muted ? 'Sound on' : 'Muted')
    } },
  { id: 'audio.cycleTrack', title: 'Next audio track', category: 'Audio', icon: 'audio', keys: ['B'], run: () => cycleTrack('audio') },
  { id: 'audio.delayUp', title: 'Audio delay +50 ms', category: 'Audio', keys: ['K'],
    run: async () => {
      await player.command('add', 'audio-delay', 0.05)
      showOsd(`Audio delay ${Math.round((p().audioDelay + 0.05) * 1000)} ms`)
    } },
  { id: 'audio.delayDown', title: 'Audio delay −50 ms', category: 'Audio', keys: ['J'],
    run: async () => {
      await player.command('add', 'audio-delay', -0.05)
      showOsd(`Audio delay ${Math.round((p().audioDelay - 0.05) * 1000)} ms`)
    } },
  { id: 'audio.effects', title: 'Audio effects & equalizer', category: 'Audio', icon: 'eq', keywords: ['equalizer', 'eq', 'compressor', 'spatializer', 'widener'],
    keys: ['Mod+E'], active: () => useUi.getState().rightPanel === 'audio', run: () => ui.togglePanel('audio') },
  { id: 'audio.toggleEq', title: 'Equalizer on/off', category: 'Audio', keywords: ['eq'],
    run: () => {
      const on = !getSetting('audio.eq')
      setSetting('audio.eq', on)
      showOsd(on ? 'Equalizer on' : 'Equalizer off')
    } },
  { id: 'audio.normalize', title: 'Normalize loudness', category: 'Audio', keywords: ['volume', 'loudness'],
    active: () => !!getSetting('audio.normalize'),
    run: () => {
      const on = !getSetting('audio.normalize')
      setSetting('audio.normalize', on)
      showOsd(on ? 'Loudness normalization on' : 'Loudness normalization off')
    } }
]

const subtitles: Command[] = [
  { id: 'subs.cycleTrack', title: 'Next subtitle track', category: 'Subtitles', icon: 'subtitles', keys: ['V'], run: () => cycleTrack('sub') },
  { id: 'subs.toggle', title: 'Show / hide subtitles', category: 'Subtitles', keys: ['Shift+V'],
    run: async () => {
      await player.command('cycle', 'sub-visibility')
      showOsd('Subtitles toggled')
    } },
  { id: 'subs.panel', title: 'Subtitle options', category: 'Subtitles', icon: 'subtitles', active: () => useUi.getState().rightPanel === 'subtitles',
    run: () => ui.togglePanel('subtitles') },
  { id: 'subs.delayUp', title: 'Subtitle delay +50 ms', category: 'Subtitles', keys: ['H'],
    run: async () => {
      await player.command('add', 'sub-delay', 0.05)
      showOsd(`Subtitle delay ${Math.round((p().subDelay + 0.05) * 1000)} ms`)
    } },
  { id: 'subs.delayDown', title: 'Subtitle delay −50 ms', category: 'Subtitles', keys: ['G'],
    run: async () => {
      await player.command('add', 'sub-delay', -0.05)
      showOsd(`Subtitle delay ${Math.round((p().subDelay - 0.05) * 1000)} ms`)
    } },
  { id: 'subs.add', title: 'Add subtitle file…', category: 'Subtitles', icon: 'add',
    run: async () => {
      const files = await window.flp.dialog.openFiles({ title: 'Choose a subtitle file', multiple: true })
      for (const f of files) await player.command('sub-add', f, 'select')
    } },
  { id: 'subs.addToFolder', title: 'Add subtitles to playlist / folder…', category: 'Subtitles', run: () => ui.openDialog('addSubtitles') },
  { id: 'subs.bigger', title: 'Larger subtitles', category: 'Subtitles', keys: ['Shift+Equal'], run: () => player.command('add', 'sub-scale', 0.1) },
  { id: 'subs.smaller', title: 'Smaller subtitles', category: 'Subtitles', keys: ['Shift+Minus'], run: () => player.command('add', 'sub-scale', -0.1) }
]

const video: Command[] = [
  { id: 'video.effects', title: 'Video adjustments & effects', category: 'Video', icon: 'paint', keywords: ['brightness', 'contrast', 'crop', 'colors', 'hue', 'gamma', 'sharpen'],
    keys: ['Mod+Shift+E'], active: () => useUi.getState().rightPanel === 'video', run: () => ui.togglePanel('video') },
  { id: 'video.cycleAspect', title: 'Cycle aspect ratio', category: 'Video', keys: ['A'],
    run: () => cycleSetting('video.aspect', ['auto', '16:9', '4:3', '16:10', '2.35:1', '1:1'], 'Aspect ratio') },
  { id: 'video.cycleCrop', title: 'Cycle crop', category: 'Video', keys: ['C'],
    run: () => cycleSetting('video.crop', ['none', '16:9', '4:3', '2.35:1', '1.85:1'], 'Crop') },
  { id: 'video.cycleDeinterlace', title: 'Cycle deinterlacing', category: 'Video', keys: ['D'],
    run: () => cycleSetting('video.deinterlace', ['auto', 'on', 'off'], 'Deinterlacing') },
  { id: 'video.cycleZoom', title: 'Cycle zoom', category: 'Video', icon: 'zoom', keys: ['Z'],
    run: () => cycleSetting('video.zoom', ['fit', 'fill', '0.5', '1', '2'], 'Zoom') },
  { id: 'video.rotate', title: 'Rotate 90°', category: 'Video', keys: ['Mod+Shift+R'],
    run: () => {
      const deg = ((getSetting<number>('vfx.rotate') ?? 0) + 90) % 360
      setSetting('vfx.rotate', deg)
      showOsd(`Rotation ${deg}°`)
    } },
  { id: 'video.flip', title: 'Flip horizontally', category: 'Video', active: () => !!getSetting('vfx.flipH'),
    run: () => {
      const on = !getSetting('vfx.flipH')
      setSetting('vfx.flipH', on)
      showOsd(on ? 'Flipped' : 'Flip off')
    } },
  { id: 'video.flipV', title: 'Flip vertically', category: 'Video', active: () => !!getSetting('vfx.flipV'),
    run: () => setSetting('vfx.flipV', !getSetting('vfx.flipV')) },
  { id: 'video.resetPicture', title: 'Reset picture', category: 'Video',
    run: async () => {
      const { VFX_DEFAULTS } = await import('@shared/video-effects')
      await window.flp.settings.setMany({ ...VFX_DEFAULTS, 'video.crop': 'none', 'video.aspect': 'auto', 'video.zoom': 'fit' })
      showOsd('Picture reset')
    } },
  { id: 'video.hdr', title: 'HDR options', category: 'Video', icon: 'hdr', run: () => ui.togglePanel('video') }
]

const windowCmds: Command[] = [
  { id: 'window.fullscreen', title: 'Toggle fullscreen', category: 'Basic', icon: 'fullscreen', keys: ['F', 'Mod+Ctrl+F'],
    active: () => useUi.getState().fullscreen, run: () => window.flp.window.toggleFullscreen() },
  { id: 'window.exitFullscreen', title: 'Exit fullscreen / close dialog', category: 'Basic', keys: ['Escape'],
    run: () => {
      const s = useUi.getState()
      if (s.paletteOpen) ui.set({ paletteOpen: false })
      else if (s.dialog) ui.closeDialog()
      else if (s.fullscreen) window.flp.window.toggleFullscreen()
      else if (s.pip) void runCommand('ui.pip')
      else if (s.hideUi) ui.set({ hideUi: false })
      else if (s.rightPanel) ui.set({ rightPanel: null })
    } },
  { id: 'ui.showTime', title: 'Show playback position and time', category: 'Basic', keys: ['T'],
    run: async () => {
      const { fmtTime } = await import('@/state/playback')
      const { time, duration } = p()
      showOsd(`${fmtTime(time)} / ${fmtTime(duration)}`, 2500)
    } },
  { id: 'ui.showControls', title: 'Show interface controls in fullscreen', category: 'Basic', keys: ['I'], run: () => ui.set({ idle: false, hideUi: false }) },
  { id: 'ui.hideUi', title: 'Hide UI', category: 'Interface', icon: 'ui', keys: ['Mod+Backslash'], active: () => useUi.getState().hideUi,
    run: () => ui.set({ hideUi: !useUi.getState().hideUi }) },
  { id: 'ui.palette', title: 'Find any action or setting', category: 'Interface', icon: 'search', keys: ['Mod+K', 'Mod+Shift+P'], hidden: true,
    run: () => ui.set({ paletteOpen: !useUi.getState().paletteOpen }) },
  { id: 'ui.settings', title: 'Settings', category: 'Interface', icon: 'settings', keys: ['Mod+Comma'], run: () => ui.openSettings() },
  { id: 'ui.keyboardShortcuts', title: 'Keyboard shortcuts', category: 'Interface', icon: 'hotkeys', keys: ['Mod+Slash'], run: () => ui.openDialog('shortcuts') },
  { id: 'ui.customizePlayer', title: 'Customize player', category: 'Interface', icon: 'paint',
    run: () => {
      ui.set({ view: 'player', hideUi: false })
      ui.openDialog('customize')
    } },
  { id: 'ui.leftSidebar', title: 'Toggle sidebar', category: 'Interface', icon: 'sidebar-left', keys: ['L', 'Mod+Shift+L'], active: () => useUi.getState().leftOpen,
    run: () => {
      const s = useUi.getState()
      if (s.view === 'library') ui.set({ view: 'player' })
      else ui.set({ leftOpen: !s.leftOpen })
    } },
  { id: 'ui.rightSidebar', title: 'Right sidebar (effects)', category: 'Interface', icon: 'sidebar-right', active: () => useUi.getState().rightPanel !== null,
    run: () => ui.set({ rightPanel: useUi.getState().rightPanel ? null : 'video' }) },
  { id: 'ui.playlist', title: 'Show / hide queue', category: 'Interface', icon: 'playlist', keys: ['Q', 'Mod+L'],
    run: () => {
      const s = useUi.getState()
      ui.set(s.view === 'player' && s.leftOpen && s.section === 'playlists' ? { leftOpen: false } : { view: 'player', leftOpen: true, section: 'playlists' })
    } },
  { id: 'ui.home', title: 'Go home', category: 'Interface', icon: 'home', keys: ['Mod+H'], run: () => ui.set({ view: 'library', section: 'home' }) },
  { id: 'ui.library', title: 'Toggle library / player', category: 'Interface', icon: 'library', keys: ['Mod+Shift+H'],
    run: () => ui.set({ view: useUi.getState().view === 'library' ? 'player' : 'library' }) },
  { id: 'ui.miniplayer', title: 'Miniplayer (browse the library while watching)', category: 'Interface', icon: 'thumbnail', keys: ['Mod+Shift+M'],
    run: () => ui.set({ view: useUi.getState().view === 'library' ? 'player' : 'library' }) },
  { id: 'ui.pip', title: 'Picture in picture', category: 'Interface', icon: 'pip', keys: ['Mod+Shift+I'], active: () => useUi.getState().pip,
    run: () => {
      const on = !useUi.getState().pip
      ui.set({ pip: on, hideUi: on, view: 'player' })
      window.flp.window.pip(on)
    } },
  { id: 'ui.alwaysOnTop', title: 'Keep window on top', category: 'Interface',
    run: () => {
      const on = getSetting('interface.alwaysOnTop') !== 'always'
      setSetting('interface.alwaysOnTop', on ? 'always' : 'never')
      showOsd(on ? 'Always on top' : 'Normal window')
    } },
  { id: 'ui.mediaInfo', title: 'Media information', category: 'Interface', icon: 'info', keys: ['Mod+I'], run: () => ui.openDialog('mediaInfo') },
  { id: 'ui.profiles', title: 'Manage profiles', category: 'Interface', icon: 'profile', run: () => ui.openDialog('profiles') },
  { id: 'app.openConfigFolder', title: 'Open configuration folder', category: 'Interface', icon: 'folder', run: () => window.flp.app.openConfigFolder() },
  { id: 'settings.resetAll', title: 'Reset all settings', category: 'Interface', icon: 'refresh',
    run: async () => {
      await window.flp.settings.resetAll()
      showOsd('All settings reset')
    } },
  { id: 'shortcuts.resetAll', title: 'Reset all keyboard shortcuts', category: 'Interface', icon: 'hotkeys',
    run: async () => {
      await window.flp.settings.setUi('shortcuts', {})
      await window.flp.settings.setUi('globalShortcuts', {})
      showOsd('Keyboard shortcuts reset')
    } },
  { id: 'app.about', title: 'About FLP', category: 'Interface', icon: 'info', keys: ['Shift+F1'], run: () => ui.openDialog('about') }
]

const media: Command[] = [
  { id: 'media.openFile', title: 'Open file(s)…', category: 'Media', icon: 'file', keys: ['Mod+O'],
    run: async () => openPaths(await window.flp.dialog.openFiles({ title: 'Open media' })) },
  { id: 'media.openFolder', title: 'Open folder…', category: 'Media', icon: 'folder', keys: ['Mod+Shift+O'],
    run: async () => openPaths(await window.flp.dialog.openFiles({ folders: true, multiple: false, title: 'Open a folder' })) },
  { id: 'media.openNetwork', title: 'Open network stream…', category: 'Media', icon: 'streaming', keys: ['Mod+N'], keywords: ['url', 'youtube', 'stream', 'http'],
    run: () => ui.openDialog('network') },
  { id: 'media.openDisc', title: 'Open disc…', category: 'Media', icon: 'disc', keys: ['Mod+D'], keywords: ['dvd', 'blu-ray', 'cd'], run: () => ui.openDialog('disc') },
  { id: 'media.openCapture', title: 'Open capture device…', category: 'Media', icon: 'capture-device', keys: ['Mod+Alt+C'], keywords: ['camera', 'webcam', 'microphone', 'screen'],
    run: () => ui.openDialog('capture') },
  { id: 'media.convert', title: 'Convert / save…', category: 'Media', icon: 'swap', keys: ['Mod+R'], keywords: ['transcode', 'export', 'mp4', 'mp3'], run: () => ui.openDialog('convert') },
  { id: 'playlist.new', title: 'New playlist…', category: 'Media', icon: 'add', run: () => ui.openDialog('newPlaylist') },
  { id: 'playlist.clear', title: 'Clear playlist', category: 'Media', icon: 'remove', run: () => player.command('playlist-clear') }
]

export function registerCoreCommands() {
  return registerCommands([...playback, ...library, ...audio, ...subtitles, ...video, ...windowCmds, ...media])
}
