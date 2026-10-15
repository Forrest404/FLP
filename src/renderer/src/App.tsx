import { useEffect, useRef, useState } from 'react'
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
import { fmtTime, openPaths } from '@/state/playback'
import { getSetting, useSetting, useSettings } from '@/state/settings'
import { showToast, ui, useUi } from '@/state/ui'
import '@/player/widgets'

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
  const idle = useIdle()

  const { view, leftOpen, hideUi, fullscreen } = useUi()
  const kind = usePlayer((s) => s.kind)
  const [dragging, setDragging] = useState(false)

  // Bars float over the video in fullscreen / Hide UI, and fade out when the mouse is idle.
  const overlay = (fullscreen || hideUi) && view === 'player'
  const barsHidden = hideUi || (overlay && idle)
  const showVideo = view === 'player' && kind !== 'image' && kind !== 'audio'

  return (
    <div
      className="flp-app"
      data-overlay={overlay}
      data-bars-hidden={barsHidden}
      data-view={view}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
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
  if (!osd || !enabled) return null
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
  useEffect(() => {
    window.flp.window.setAlwaysOnTop(mode === 'always' || (mode === 'while-playing' && !paused))
  }, [mode, paused])
}

/** True after the mouse has been still for the configured time. */
function useIdle(): boolean {
  const idle = useUi((s) => s.idle)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const wake = (e: Event) => {
      if (useUi.getState().idle) ui.set({ idle: false })
      clearTimeout(timer.current)
      const hideAfter = (getSetting<number>('interface.hideAfter') ?? 3) * 1000
      // Don't hide while hovering the bars.
      if ((e.target as HTMLElement | null)?.closest?.('.flp-controls, .flp-titlebar, .ui-menu')) return
      if (hideAfter > 0) timer.current = setTimeout(() => ui.set({ idle: true }), hideAfter)
    }
    window.addEventListener('mousemove', wake)
    window.addEventListener('mousedown', wake)
    return () => {
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('mousedown', wake)
      clearTimeout(timer.current)
    }
  }, [])
  return idle
}
