// Built-in commands. Default shortcuts follow VLC where it has one, so muscle memory carries over.
import { player, usePlayer } from '@/state/player'
import { getSetting, setSetting } from '@/state/settings'
import { confirmAction, showOsd, showToast, ui, useUi, type RightPanel } from '@/state/ui'
import { changeVolume, nextSpeed, openPaths, seekBy, setSpeed, shuffleQueue, trackLabel } from '@/state/playback'
import { expandHome } from '@/state/paths'
import { BUILTIN_ASPECTS, BUILTIN_CROPS, withCustom } from '@/state/ratios'
import { registerCommands, runCommand, type Command } from './registry'

const p = () => usePlayer.getState()
const skip = (key: string, fallback: number) => getSetting<number>(key) ?? fallback
/** Runs only while something is loaded (seeking an empty player is an mpv error). */
const withMedia = (fn: () => unknown) => () => (p().idle ? undefined : fn())

async function cycleTrack(type: 'audio' | 'sub' | 'video') {
  const prop = type === 'audio' ? 'aid' : type === 'sub' ? 'sid' : 'vid'
  await player.command('cycle', prop)
  setTimeout(() => {
    // The secondary subtitle track is selected too; the primary is the one that counts.
    const t = p().tracks.find((x) => x.type === type && x.selected && x.mainSelection !== 1)
    const what = type === 'audio' ? 'Audio' : type === 'sub' ? 'Subtitles' : 'Video'
    showOsd(t ? `${what}: ${trackLabel(t)}` : `${what}: Off`)
  }, 120)
}

async function cycleSetting(key: string, values: string[], label: string, names: Record<string, string> = {}) {
  const cur = String(getSetting(key))
  const next = values[(values.indexOf(cur) + 1) % values.length]
  setSetting(key, next)
  showOsd(`${label}: ${names[next] ?? (next === 'auto' || next === 'none' || next === 'fit' ? 'Default' : next)}`)
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
      await player.command('stop', 'keep-playlist')
      ui.set({ view: 'library' })
    } },
  // Weak (not 'force'): at the end of the queue mpv refuses instead of stopping playback.
  { id: 'player.next', title: 'Next item', category: 'Playback', icon: 'next', keys: ['N', 'Shift+Period'],
    run: () => player.command('playlist-next').catch(() => !p().idle && showOsd('End of the queue')) },
  { id: 'player.previous', title: 'Previous item', category: 'Playback', icon: 'previous', keys: ['P', 'Shift+Comma'],
    run: async () => {
      // Like most players: restart the item if we're more than a few seconds in (or it's the first one).
      if (p().time > 3) await player.command('seek', 0, 'absolute')
      else await player.command('playlist-prev').catch(() => !p().idle && player.command('seek', 0, 'absolute'))
    } },
  { id: 'player.replay', title: 'Replay from the start', category: 'Playback', icon: 'replay', run: withMedia(() => player.command('seek', 0, 'absolute')) },
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
  { id: 'player.frameStep', title: 'Next frame', category: 'Navigation', keys: ['Period', 'E'], run: withMedia(() => player.command('frame-step')) },
  { id: 'player.frameBack', title: 'Previous frame', category: 'Navigation', keys: ['Comma', 'Shift+E'], run: withMedia(() => player.command('frame-back-step')) },
  { id: 'player.nextChapter', title: 'Next chapter', category: 'Navigation', icon: 'chapters', keys: ['Shift+N'], run: withMedia(() => (p().chapters.length ? player.command('add', 'chapter', 1) : showOsd('This file has no chapters'))) },
  { id: 'player.prevChapter', title: 'Previous chapter', category: 'Navigation', keys: ['Shift+P'], run: withMedia(() => (p().chapters.length ? player.command('add', 'chapter', -1) : showOsd('This file has no chapters'))) },
  { id: 'player.speedUp', title: 'Faster', category: 'Playback', icon: 'speed', keys: ['BracketRight'], run: () => setSpeed(nextSpeed(1)) },
  { id: 'player.speedDown', title: 'Slower', category: 'Playback', keys: ['BracketLeft'], run: () => setSpeed(nextSpeed(-1)) },
  { id: 'player.speedFineUp', title: 'Faster (fine)', category: 'Playback', keys: ['Shift+BracketRight'], run: () => setSpeed(p().speed + 0.05) },
  { id: 'player.speedFineDown', title: 'Slower (fine)', category: 'Playback', keys: ['Shift+BracketLeft'], run: () => setSpeed(p().speed - 0.05) },
  { id: 'player.speedReset', title: 'Normal speed', category: 'Playback', keys: ['Equal'], run: () => setSpeed(1) },
  { id: 'player.speedMenu', title: 'Playback speed', category: 'Playback', icon: 'speed', run: () => ui.togglePanel('playback') },
  { id: 'ui.playbackSettings', title: 'Playback settings', category: 'Playback', icon: 'settings', keywords: ['speed', 'loop', 'sleep'],
    active: () => useUi.getState().rightPanel === 'playback', run: () => ui.togglePanel('playback') },
  { id: 'player.repeat', title: 'Repeat (off / one / all)', category: 'Playback', icon: 'repeat', keys: ['R'],
    // The setting, not loop-file: animated images loop regardless (see useAnimatedImageLoop).
    active: () => (getSetting('playback.repeat') ?? 'off') !== 'off',
    run: () => {
      // Saved as a setting, so it's remembered (per profile) and applied to the engine by the main process.
      const next = { off: 'all', all: 'one', one: 'off' }[String(getSetting('playback.repeat') ?? 'off')] ?? 'off'
      setSetting('playback.repeat', next)
      showOsd(next === 'all' ? 'Repeat all' : next === 'one' ? 'Repeat one' : 'Repeat off')
    } },
  { id: 'player.shuffle', title: 'Shuffle', category: 'Playback', icon: 'shuffle', keys: ['Shift+Z'],
    active: () => !!getSetting('playback.shuffle'),
    run: async () => {
      const on = !getSetting('playback.shuffle')
      setSetting('playback.shuffle', on)
      await (on ? shuffleQueue() : player.command('playlist-unshuffle'))
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
        await player.set('file-local-options/stream-record', '')
        showOsd('Recording saved')
        return
      }
      if (p().idle) return showOsd('Nothing to record')
      const dir = (await expandHome(String(getSetting('recording.folder') || '~/Movies'))).replace(/\/+$/, '')
      if (!(await window.flp.app.ensureDir(dir))) return showOsd(`Can't save recordings to ${dir}`)
      const name = `FLP Recording ${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.mkv`
      await player.set('file-local-options/stream-record', `${dir}/${name}`) // ends with this file
      showOsd('Recording…')
    } },
  { id: 'player.snapshot', title: 'Take a snapshot', category: 'Video', icon: 'snapshot', keys: ['Shift+S'],
    run: async () => {
      const withSubs = getSetting('video.snapshotSize') === 'window'
      const shoot = () => player.command('screenshot', withSubs ? 'subtitles' : 'video').catch(() => null) as Promise<{ filename?: string } | null>
      // Right after a picture change (aspect, crop) the video output is briefly busy; try once more.
      const res = (await shoot()) ?? (await new Promise((r) => setTimeout(r, 300)).then(shoot))
      if (!res) return showOsd("Couldn't take a snapshot")
      // mpv reports the full path (screenshot-dir is set to an absolute folder by the main process).
      const file = res.filename ? await expandHome(res.filename) : ''
      const name = file.split('/').pop()
      if (getSetting('video.snapshotPreview') !== false && file.startsWith('/'))
        showToast(`Snapshot saved: ${name}`, { label: 'Show in Finder', run: () => window.flp.shell.showInFolder(file) })
      else showOsd(name ? `Snapshot saved: ${name}` : 'Snapshot saved')
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
  { id: 'library.rescan', bar: false, title: 'Rescan media folders', category: 'Library', icon: 'refresh', run: () => window.flp.library.rescan() },
  { id: 'library.clearHistory', bar: false, title: 'Clear playback history', category: 'Library', icon: 'remove',
    run: async () => {
      if (await confirmAction({ title: 'Clear playback history?', message: 'Recently played items and resume positions will be forgotten.', confirmLabel: 'Clear' }))
        await window.flp.library.clearHistory()
    } },
  { id: 'library.addFolder', bar: false, title: 'Add a media folder…', category: 'Library', icon: 'new-folder', run: () => window.dispatchEvent(new CustomEvent('flp:add-library-folder')) }
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
  { id: 'audio.effects', title: 'Audio effects & equalizer', category: 'Audio', icon: 'audio', keywords: ['equalizer', 'eq', 'compressor', 'spatializer', 'widener'],
    keys: ['Mod+E'], active: () => useUi.getState().rightPanel === 'audio', run: () => ui.togglePanel('audio') },
  { id: 'audio.toggleEq', title: 'Equalizer on/off', category: 'Audio', keywords: ['eq'], active: () => !!getSetting('audio.eq'),
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
    run: () => cycleSetting('video.aspect', ['auto', ...withCustom('video.aspect', BUILTIN_ASPECTS)], 'Aspect ratio') },
  { id: 'video.cycleCrop', title: 'Cycle crop', category: 'Video', keys: ['C'],
    run: () => cycleSetting('video.crop', ['none', ...withCustom('video.crop', BUILTIN_CROPS)], 'Crop') },
  { id: 'video.cycleDeinterlace', title: 'Cycle deinterlacing', category: 'Video', keys: ['D'],
    run: () => cycleSetting('video.deinterlace', ['auto', 'on', 'off'], 'Deinterlacing') },
  { id: 'video.cycleZoom', title: 'Cycle zoom', category: 'Video', icon: 'zoom', keys: ['Z'],
    run: () => cycleSetting('video.zoom', ['fit', 'fill', '0.5', '1', '2'], 'Zoom', { fit: 'Fit', fill: 'Fill', '0.5': '50%', '1': '100%', '2': '200%' }) },
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
      // Live streams have no duration.
      showOsd(duration > 0 ? `${fmtTime(time)} / ${fmtTime(duration)}` : fmtTime(time), 2500)
    } },
  { id: 'ui.showControls', title: 'Show interface controls in fullscreen', category: 'Basic', keys: ['I'], run: () => ui.set({ idle: false, hideUi: false }) },
  { id: 'ui.hideUi', title: 'Hide UI', category: 'Interface', icon: 'ui', keys: ['Mod+Backslash'], active: () => useUi.getState().hideUi,
    run: () => ui.set({ hideUi: !useUi.getState().hideUi }) },
  { id: 'ui.palette', title: 'Find any action or setting', category: 'Interface', icon: 'search', keys: ['Mod+K', 'Mod+Shift+P'], hidden: true,
    run: () => ui.set({ paletteOpen: !useUi.getState().paletteOpen }) },
  { id: 'ui.settings', title: 'Settings', category: 'Interface', icon: 'settings', keys: ['Mod+Comma'], run: () => ui.openSettings() },
  { id: 'ui.keyboardShortcuts', bar: false, title: 'Keyboard shortcuts', category: 'Interface', icon: 'hotkeys', keys: ['Mod+Slash'], run: () => ui.openDialog('shortcuts') },
  { id: 'ui.customizePlayer', bar: false, title: 'Customize player', category: 'Interface', icon: 'paint',
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
  // Plugins call this with "plugin:<plugin id>:<panel id>" (or a built-in tab) to show a panel.
  { id: 'ui.showPanel', title: 'Show a sidebar panel', category: 'Interface', hidden: true, bar: false,
    run: (arg) => {
      const panel = String(arg ?? 'video')
      ui.set({ view: 'player', rightPanel: panel as RightPanel })
    } },
  { id: 'ui.playlist', title: 'Show / hide queue', category: 'Interface', icon: 'playlist', keys: ['Q', 'Mod+L'],
    run: () => {
      const s = useUi.getState()
      ui.set(s.view === 'player' && s.leftOpen && s.section === 'playlists' ? { leftOpen: false } : { view: 'player', leftOpen: true, section: 'playlists' })
    } },
  { id: 'ui.home', title: 'Go home', category: 'Interface', icon: 'home', keys: ['Mod+Alt+H'], run: () => ui.set({ view: 'library', section: 'home' }) },
  // Sent by the main process when a file is opened from Finder.
  { id: 'ui.showPlayer', title: 'Show the player', category: 'Interface', hidden: true, bar: false, run: () => ui.set({ view: 'player' }) },
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
  { id: 'ui.alwaysOnTop', title: 'Keep window on top', category: 'Interface', active: () => getSetting('interface.alwaysOnTop') === 'always',
    run: () => {
      const on = getSetting('interface.alwaysOnTop') !== 'always'
      setSetting('interface.alwaysOnTop', on ? 'always' : 'never')
      showOsd(on ? 'Always on top' : 'Normal window')
    } },
  { id: 'ui.mediaInfo', title: 'Media information', category: 'Interface', icon: 'info', keys: ['Mod+I'], run: () => ui.openDialog('mediaInfo') },
  { id: 'ui.profiles', bar: false, title: 'Manage profiles', category: 'Interface', icon: 'profile', run: () => ui.openDialog('profiles') },
  { id: 'app.openConfigFolder', bar: false, title: 'Open configuration folder', category: 'Interface', icon: 'folder', run: () => window.flp.app.openConfigFolder() },
  { id: 'settings.resetAll', bar: false, title: 'Reset all settings', category: 'Interface', icon: 'refresh',
    run: async () => {
      if (!(await confirmAction({ title: 'Reset all settings?', message: 'Every setting goes back to its default and custom profiles are removed. Keyboard shortcuts are kept.', confirmLabel: 'Reset' }))) return
      await window.flp.settings.resetAll()
      showOsd('All settings reset')
    } },
  { id: 'shortcuts.resetAll', bar: false, title: 'Reset all keyboard shortcuts', category: 'Interface', icon: 'hotkeys',
    run: async () => {
      if (!(await confirmAction({ title: 'Reset all keyboard shortcuts?', message: 'Your custom and global shortcuts will be removed.', confirmLabel: 'Reset' }))) return
      await window.flp.settings.setUi('shortcuts', {})
      await window.flp.settings.setUi('globalShortcuts', {})
      await window.flp.app.registerGlobalShortcuts({})
      showOsd('Keyboard shortcuts reset')
    } },
  { id: 'plugins.manage', bar: false, title: 'Manage plugins', category: 'Plugins', icon: 'plugins', run: () => ui.openSettings('extensions') },
  { id: 'plugins.reload', bar: false, title: 'Reload plugins', category: 'Plugins', icon: 'refresh', run: () => window.flp.plugins.reload() },
  { id: 'plugins.openFolder', bar: false, title: 'Open the plugins folder', category: 'Plugins', icon: 'folder', run: () => window.flp.plugins.openFolder() },
  { id: 'plugins.create', bar: false, title: 'Create a plugin…', category: 'Plugins', icon: 'add',
    run: () => {
      ui.openSettings('extensions')
      setTimeout(() => window.dispatchEvent(new Event('flp:create-plugin')), 100)
    } },
  { id: 'plugins.guide', bar: false, title: 'Plugin guide', category: 'Plugins', icon: 'info', run: () => window.flp.plugins.openGuide() },
  { id: 'app.devTools', bar: false, title: 'Toggle Developer Tools', category: 'Interface', icon: 'wrench', keys: ['Mod+Alt+I'], keywords: ['inspector', 'console', 'debug'],
    enabled: () => !!getSetting('general.developerMode'), run: () => window.flp.app.toggleDevTools() },
  { id: 'app.quit', title: 'Quit FLP', category: 'Interface', icon: 'quit', run: () => window.flp.window.close() },
  { id: 'app.about', bar: false, title: 'About FLP', category: 'Interface', icon: 'info', keys: ['Shift+F1'], run: () => ui.openDialog('about') }
]

const media: Command[] = [
  { id: 'media.openFile', title: 'Open file(s)…', category: 'Media', icon: 'file', keys: ['Mod+O'],
    run: async () => openPaths(await window.flp.dialog.openFiles({ title: 'Open media' })) },
  { id: 'media.openFolder', title: 'Open folder…', category: 'Media', icon: 'folder', keys: ['Mod+Shift+O'],
    run: async () => openPaths(await window.flp.dialog.openFiles({ folders: true, multiple: false, title: 'Open a folder' })) },
  { id: 'media.openNetwork', title: 'Open network stream…', category: 'Media', icon: 'streaming', keys: ['Mod+N'], keywords: ['url', 'youtube', 'stream', 'http'],
    run: () => ui.openDialog('network') },
  { id: 'media.openDisc', bar: false, title: 'Open disc…', category: 'Media', icon: 'disc', keys: ['Mod+D'], keywords: ['dvd', 'blu-ray', 'cd'], run: () => ui.openDialog('disc') },
  { id: 'media.openCapture', bar: false, title: 'Open capture device…', category: 'Media', icon: 'capture-device', keys: ['Mod+Alt+C'], keywords: ['camera', 'webcam', 'microphone', 'screen'],
    run: () => ui.openDialog('capture') },
  { id: 'media.convert', title: 'Convert / save…', category: 'Media', icon: 'swap', keys: ['Mod+R'], keywords: ['transcode', 'export', 'mp4', 'mp3'], run: () => ui.openDialog('convert') },
  { id: 'media.stream', title: 'Stream to the network…', category: 'Media', icon: 'streaming', keywords: ['broadcast', 'share', 'hls', 'udp'],
    run: () => ui.openDialog('convert', { tab: 'stream' }) },
  { id: 'cast.to', title: 'Cast to TV or speaker…', category: 'Media', icon: 'tv', keywords: ['dlna', 'upnp', 'chromecast', 'airplay', 'tv'],
    run: async () => {
      const { openCastMenu } = await import('@/library/Network')
      await openCastMenu({ clientX: window.innerWidth / 2 - 130, clientY: window.innerHeight / 2 - 100 })
    } },
  { id: 'cast.stop', title: 'Stop casting', category: 'Media', icon: 'stop', run: () => window.flp.cast.stop() },
  { id: 'playlist.new', title: 'New playlist…', category: 'Media', icon: 'add', run: () => ui.openDialog('newPlaylist') },
  { id: 'playlist.clear', bar: false, title: 'Clear playlist', category: 'Media', icon: 'remove',
    run: async () => {
      if (await confirmAction({ title: 'Clear the queue?', message: 'Everything except the item that is playing will be removed.', confirmLabel: 'Clear' }))
        await player.command('playlist-clear')
    } }
]

/** Recording is a per-file option, so mpv ends it when the file changes; say so. */
function stopRecordingOnFileChange() {
  return usePlayer.subscribe((s, prev) => {
    if (!prev.recording || s.path === prev.path) return
    showOsd('Recording saved')
  })
}

export function registerCoreCommands() {
  const off = stopRecordingOnFileChange()
  const unregister = registerCommands([...playback, ...library, ...audio, ...subtitles, ...video, ...windowCmds, ...media])
  return () => {
    off()
    unregister()
  }
}
