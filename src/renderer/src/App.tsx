import { useEffect, useRef, useState } from 'react'
import { runCommand } from '@/commands/registry'
import { mediaUrl } from '@shared/api'
import { registerCoreCommands } from '@/commands/core'
import { useKeyboardShortcuts, useMenuBar } from '@/commands/keys'
import { CommandPalette } from '@/components/CommandPalette'
import { Icon } from '@/components/Icon'
import { Button } from '@/components/controls'
import { LibraryView } from '@/library/LibraryView'
import { ControlBar, TitleBar } from '@/player/Bars'
import { ImageViewer } from '@/player/ImageViewer'
import { Miniplayer } from '@/player/Miniplayer'
import { MusicView } from '@/player/MusicView'
import { PlayerSidebar } from '@/player/Sidebar'
import { VideoSurface } from '@/player/VideoSurface'
import { RightPanel } from '@/panels/RightPanel'
import { Dialogs } from '@/dialogs/Dialogs'
import { usePlayer } from '@/state/player'
import { expandHome } from '@/state/paths'
import { fmtTime, openPaths } from '@/state/playback'
import { getSetting, useSetting, useSettings } from '@/state/settings'
import { showOsd, showToast, ui, useUi } from '@/state/ui'
import '@/player/widgets'
import '@/plugins/state'

registerCoreCommands()

// Dev hooks for automated UI checks (see src/main/dev-snapshot.ts).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('dev')) {
  void Promise.all([import('@/commands/registry'), import('@/components/Menu'), import('@/player/menus'), import('@/state/playback')]).then(
    ([reg, menu, menus, playback]) => {
      void import('@/player/customize').then((c) => ((window as unknown as { __flpCustomize: unknown }).__flpCustomize = c))
      ;(window as unknown as { __flp: unknown }).__flp = { runCommand: reg.runCommand, ui, openMenu: menu.openMenu, menus, playback }
    }
  )
}

export function App() {
  useKeyboardShortcuts()
  useMenuBar()
  useFullscreenTracking()
  useAlwaysOnTop()
  useFirstRun()
  useResumeOffer()
  useSkin()
  useFilenameOsd()
  usePlayErrors()

  const { view, leftOpen, hideUi, fullscreen } = useUi()
  const kind = usePlayer((s) => s.kind)
  const autoHide = useSetting<string>('interface.autoHide') ?? 'fullscreen'
  const fsControls = useSetting<boolean>('interface.fullscreenControls') !== false
  const fsOpacity = useSetting<number>('interface.fsControlsOpacity') ?? 100
  const { idle, nearEdge } = useIdle(fullscreen)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

  // Children that take a drop themselves (and stop it) never reach the root's onDrop, so reset here.
  useEffect(() => {
    let leaveTimer: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      clearTimeout(leaveTimer)
      dragDepth.current = 0
      setDragging(false)
    }
    // Left the window: no dragover follows (it fires every ~50 ms while over the page).
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget) return
      clearTimeout(leaveTimer)
      leaveTimer = setTimeout(reset, 150)
    }
    const onOver = () => clearTimeout(leaveTimer)
    window.addEventListener('drop', reset, true)
    window.addEventListener('dragend', reset, true)
    window.addEventListener('dragleave', onLeave, true)
    window.addEventListener('dragover', onOver, true)
    return () => {
      clearTimeout(leaveTimer)
      window.removeEventListener('drop', reset, true)
      window.removeEventListener('dragend', reset, true)
      window.removeEventListener('dragleave', onLeave, true)
      window.removeEventListener('dragover', onOver, true)
    }
  }, [])

  useEffect(() => document.documentElement.style.setProperty('--fs-controls-opacity', String(fsOpacity / 100)), [fsOpacity])

  const showVideo = view === 'player' && kind !== 'image' && kind !== 'audio'
  // Bars float over the video in fullscreen / Hide UI (and over any video with auto-hide "Always"),
  // and fade out when the mouse is idle unless auto-hide is "Never".
  const overlay = (fullscreen || hideUi || (autoHide === 'always' && kind === 'video')) && view === 'player'
  const idleHidden = overlay && idle && autoHide !== 'never'
  // "Show controls in fullscreen" off: only while the mouse is over the bar area.
  const fsHidden = overlay && fullscreen && !fsControls && !nearEdge
  const barsHidden = hideUi || idleHidden || fsHidden

  return (
    <div
      className="flp-app"
      data-overlay={overlay}
      data-bars-hidden={barsHidden}
      data-idle={idleHidden}
      data-fullscreen={fullscreen}
      data-view={view}
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => isFileDrag(e) && e.preventDefault()}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }}
      onDrop={(e) => {
        dragDepth.current = 0
        setDragging(false)
        if (e.defaultPrevented) return // a child (e.g. a dialog's drop box) took it
        if (!isFileDrag(e) && !e.dataTransfer.types.includes('text/uri-list')) return
        e.preventDefault()
        const paths = [...e.dataTransfer.files].map((f) => window.flp.pathForFile(f)).filter(Boolean)
        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
        if (paths.length) void openPaths(paths, { append: e.altKey || undefined })
        else if (/^[a-z]+:\/\//i.test(url)) void openPaths([url.trim()])
      }}
    >
      {!hideUi && <TitleBar />}
      <div className="flp-main">
        {view === 'library' ? (
          <LibraryView />
        ) : (
          <>
            {leftOpen && !hideUi && <PlayerSidebar />}
            <div className="flp-stage">
              <VideoSurface showVideo={showVideo}>
                {kind === 'audio' && <MusicView />}
                {kind === 'image' && <ImageViewer />}
              </VideoSurface>
            </div>
            {!hideUi && <RightPanel />}
          </>
        )}
      </div>
      {view === 'player' && !hideUi && <ControlBar />}
      {view === 'library' && <Miniplayer />}

      <Osd />
      <Toast />
      <CommandPalette />
      <Dialogs />
      {dragging && (
        <div className="flp-dropzone">
          <Icon name="upload" size={36} />
          <p>Drop to play · hold ⌥ to add to the queue</p>
        </div>
      )}
    </div>
  )
}

function useFirstRun() {
  const ready = useSettings((s) => s.ready)
  const onboarded = useSettings((s) => s.ui.onboarded)
  useEffect(() => {
    if (ready && !onboarded && !new URLSearchParams(location.search).has('dev')) ui.openDialog('onboarding')
  }, [ready, onboarded])
  // Settings → Interface → "Start in compact mode", once settings have arrived.
  const started = useRef(false)
  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    if (getSetting('interface.compactStart') && !useUi.getState().pip) void runCommand('ui.pip')
  }, [ready])
}

function useResumeOffer() {
  useEffect(
    () =>
      window.flp.onResumeOffer(({ position }) =>
        showToast(`You’ve watched till ${fmtTime(position, position >= 3600)} already.`, {
          label: 'Continue Watching',
          run: () => void window.flp.player.command('seek', position, 'absolute')
        })
      ),
    []
  )
}

function Osd() {
  const osd = useUi((s) => s.osd)
  const enabled = useSetting<boolean>('subtitles.osdFeedback') !== false
  if (!osd || (!enabled && !osd.force)) return null
  return <div key={osd.id} className="flp-osd">{osd.text}</div>
}

function Toast() {
  const toast = useUi((s) => s.toast)
  if (!toast) return null
  return (
    <div className="ui-toast" role="status">
      <span>{toast.text}</span>
      {toast.action && (
        <Button variant="primary" onClick={() => { toast.action!.run(); ui.set({ toast: null }) }}>{toast.action.label}</Button>
      )}
    </div>
  )
}

function useFullscreenTracking() {
  useEffect(() => {
    window.flp.window.isFullscreen().then((fullscreen) => ui.set({ fullscreen }))
    return window.flp.window.onFullscreen((fullscreen) => ui.set({ fullscreen }))
  }, [])
}

function useAlwaysOnTop() {
  const mode = useSetting<string>('interface.alwaysOnTop')
  const paused = usePlayer((s) => s.paused || s.idle)
  const pip = useUi((s) => s.pip)
  useEffect(() => {
    if (pip) return // picture-in-picture manages its own always-on-top
    window.flp.window.setAlwaysOnTop(mode === 'always' || (mode === 'while-playing' && !paused))
  }, [mode, paused, pip])
}

// Accumulated mouse movement (px) that brings the controls back in fullscreen, by interface.fsSensitivity.
const WAKE_PX: Record<number, number> = { 1: 24, 2: 8, 3: 1 }

/** `idle`: the mouse has been still for interface.hideAfter. `nearEdge`: (fullscreen) the mouse is over the bar area. */
function useIdle(fullscreen: boolean): { idle: boolean; nearEdge: boolean } {
  const idle = useUi((s) => s.idle)
  const [nearEdge, setNearEdge] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let moved = 0
    const arm = () => {
      clearTimeout(timer)
      const hideAfter = (getSetting<number>('interface.hideAfter') ?? 3) * 1000
      if (hideAfter > 0) timer = setTimeout(() => !useUi.getState().dialog && ui.set({ idle: true }), hideAfter)
    }
    const wake = (e: MouseEvent) => {
      if (fullscreen) {
        setNearEdge(e.clientY <= 48 || e.clientY >= window.innerHeight - 72)
        // Small jitters don't bring the controls back.
        if (e.type === 'mousemove' && useUi.getState().idle) {
          moved += Math.abs(e.movementX) + Math.abs(e.movementY)
          if (moved < (WAKE_PX[getSetting<number>('interface.fsSensitivity') ?? 2] ?? 8)) return
        }
      }
      moved = 0
      if (useUi.getState().idle) ui.set({ idle: false })
      clearTimeout(timer)
      // Don't hide while hovering the bars.
      if ((e.target as HTMLElement | null)?.closest?.('.flp-controls, .flp-titlebar, .ui-menu')) return
      arm()
    }
    // Start counting on entering/leaving fullscreen and when something else shows the controls (e.g. the I key).
    arm()
    const off = useUi.subscribe((s, prev) => prev.idle && !s.idle && arm())
    window.addEventListener('mousemove', wake)
    window.addEventListener('mousedown', wake)
    return () => {
      off()
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('mousedown', wake)
      clearTimeout(timer)
      setNearEdge(false)
    }
  }, [fullscreen])
  return { idle, nearEdge }
}

/** interface.customSkin: the user's CSS file, loaded after the app's own styles. */
function useSkin() {
  const on = useSetting<boolean>('interface.customSkin')
  const file = useSetting<string>('interface.skinFile')?.trim()
  useEffect(() => {
    if (!on || !file) return
    let link: HTMLLinkElement | undefined
    let alive = true
    void expandHome(file).then((path) => {
      if (!alive || !path.startsWith('/')) return
      document.getElementById('flp-skin')?.remove()
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.id = 'flp-skin'
      link.href = `${mediaUrl(path)}?v=${Date.now()}` // fresh copy whenever it's (re)applied
      link.onerror = () => showToast(`Couldn't load the skin ${path.split('/').pop()}`)
      // At the end of <body>, so it wins over the app's styles, including lazily loaded ones.
      document.body.appendChild(link)
    })
    return () => {
      alive = false
      link?.remove()
    }
  }, [on, file])
}

/** subtitles.showFilename: the title / file name on the OSD when a new video starts. */
function useFilenameOsd() {
  useEffect(() => {
    let pending: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = usePlayer.subscribe((s, prev) => {
      if (s.path !== prev.path) pending = s.path
      // Wait for the new file's tracks so `kind` (and media-title) belong to it, not the previous file.
      if (!pending || s.path !== pending || s.tracks === prev.tracks || !s.tracks.length) return
      pending = null
      if (s.kind !== 'video' || !getSetting('subtitles.showFilename')) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { path, title } = usePlayer.getState()
        if (path === s.path) showOsd(title || path!.split('/').pop() || path!, (getSetting<number>('subtitles.filenameDuration') ?? 3) * 1000, true)
      }, 150)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])
}

/** general.confirmDialogs also covers "show a message when a file fails to play". */
function usePlayErrors() {
  useEffect(
    () =>
      usePlayer.subscribe((s, prev) => {
        if (!s.error || s.error === prev.error || getSetting('general.confirmDialogs') === false) return
        const path = s.path ?? prev.path
        showToast(`Couldn't play ${path ? `“${path.split('/').pop()}”` : 'this file'}: ${s.error}`)
      }),
    []
  )
}
