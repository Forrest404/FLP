import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'
import { openMenu } from '@/components/Menu'
import { runCommand } from '@/commands/registry'
import { player, usePlayer } from '@/state/player'
import { changeVolume, seekBy } from '@/state/playback'
import { getSetting, useSetting } from '@/state/settings'
import { useUi } from '@/state/ui'
import { rightClickMenu } from './menus'

/** Transparent area the native mpv view sits exactly underneath. */
export function VideoSurface({ children, showVideo, onRect }: {
  children?: ReactNode
  showVideo: boolean
  /** Called with the surface's window rect whenever it moves (used to cut holes in layers above). */
  onRect?: (r: DOMRect) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Latest callback, so a parent that starts or stops needing the rect (miniplayer audio↔video) works.
  const onRectRef = useRef(onRect)
  onRectRef.current = onRect
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const el = ref.current!
    let frame = 0
    const report = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        onRectRef.current?.(r)
        window.flp.player.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
      })
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    report()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    window.flp.player.setVisible(showVideo)
  }, [showVideo])

  // Match the native view's corners and letterbox colour to this panel.
  // Same rule as App's data-overlay (auto-hide "Always" floats the bars over video too).
  const isVideo = usePlayer((s) => s.kind === 'video')
  const autoHideVideo = useSetting<string>('interface.autoHide') === 'always' && isVideo
  const overlay = useUi((s) => s.fullscreen || s.hideUi || (autoHideVideo && s.view === 'player'))
  useEffect(() => {
    const radius = parseFloat(getComputedStyle(ref.current!).borderTopLeftRadius) || 0
    window.flp.player.setCornerRadius(radius)
    void player.set('background-color', overlay ? '#000000' : '#2B2A28')
  }, [overlay])
  // With no surface mounted (e.g. browsing the library with nothing playing) the video is hidden.
  useEffect(() => () => window.flp.player.setVisible(false), [])

  const mouseAction = (action: string) => {
    if (action === 'play-pause') void runCommand('player.playPause')
    else if (action === 'toggle-fullscreen') void runCommand('window.fullscreen')
    else if (action === 'show-controls') useUi.setState({ idle: false })
  }

  const onClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    // Wait briefly so a double click doesn't also count as a single click.
    clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => mouseAction(String(getSetting('controls.click') ?? 'play-pause')), 220)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    clearTimeout(clickTimer.current)
    mouseAction(String(getSetting('controls.doubleClick') ?? 'toggle-fullscreen'))
  }

  const onWheel = (e: React.WheelEvent) => {
    const reverse = getSetting<boolean>('controls.reverseWheel') ? -1 : 1
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    const action = String(getSetting(horizontal ? 'controls.hWheel' : 'controls.wheel'))
    const delta = (horizontal ? e.deltaX : -e.deltaY) * reverse
    if (Math.abs(delta) < 2) return
    if (action === 'volume') void changeVolume(delta > 0 ? 2 : -2)
    else if (action === 'seek') void seekBy(delta > 0 ? 5 : -5)
    else if (action === 'zoom') void player.command('add', 'video-zoom', delta > 0 ? 0.05 : -0.05)
  }

  return (
    <div
      ref={ref}
      className="flp-surface"
      data-video={showVideo}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(rightClickMenu(), e)
      }}
    >
      {children}
      <SurfaceStatus />
    </div>
  )
}

function SurfaceStatus() {
  const { buffering, error, idle, path } = usePlayer()
  if (error)
    return (
      <div className="flp-surface__msg">
        <Icon name="info" size={28} />
        <p>Couldn't play this file.</p>
        <small>{error}</small>
      </div>
    )
  if (buffering) return <div className="flp-surface__msg"><div className="flp-spinner" /><small>Buffering…</small></div>
  if (idle && !path)
    return (
      <div className="flp-surface__msg flp-surface__msg--empty">
        <Icon name="file-video" size={40} />
        <p>Drop a file here, or press {navigator.platform.startsWith('Mac') ? '⌘O' : 'Ctrl+O'} to open one.</p>
      </div>
    )
  return null
}
