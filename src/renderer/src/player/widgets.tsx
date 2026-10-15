import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/controls'
import { openMenu } from '@/components/Menu'
import { runCommand } from '@/commands/registry'
import { player, usePlayer } from '@/state/player'
import { baseName, fmtTime, folderName, seekTo, setVolume } from '@/state/playback'
import { useSetting } from '@/state/settings'
import { ui, useUi } from '@/state/ui'
import { defineItem } from './items'
import { mainMenu } from './menus'
import { nav } from '@/library/state'
import { Logo } from '@/components/Logo'

// ── Play button (accent pill) ────────────────────────────────────────────────

function PlayButton() {
  const paused = usePlayer((s) => s.paused || s.idle)
  return (
    <button type="button" className="flp-play" aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'} onClick={() => void runCommand('player.playPause')}>
      <Icon name={paused ? 'play' : 'pause'} size={16} filled />
    </button>
  )
}

// ── Time labels ──────────────────────────────────────────────────────────────

function TimeLabel({ which }: { which: 'time' | 'duration' }) {
  const time = usePlayer((s) => s.time)
  const duration = usePlayer((s) => s.duration)
  const [remaining, setRemaining] = useState(false)
  const hours = duration >= 3600
  if (which === 'time') return <span className="flp-time">{fmtTime(time, hours)}</span>
  return (
    <button type="button" className="flp-time flp-time--btn" title="Click to show remaining time" onClick={() => setRemaining(!remaining)}>
      {remaining ? `-${fmtTime(Math.max(0, duration - time), hours)}` : fmtTime(duration, hours)}
    </button>
  )
}

// ── Seek bar ─────────────────────────────────────────────────────────────────

function SeekBar({ waveform }: { waveform?: boolean }) {
  const { time, duration, chapters, abA, abB, cacheAhead, path, kind, seekable } = usePlayer()
  const showThumbs = useSetting<boolean>('playback.scrubThumbnail') !== false
  const trackRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const shown = drag ?? time
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0

  useEffect(() => {
    setPeaks([])
    if (!waveform || !path || /^[a-z]+:\/\//i.test(path)) return
    let alive = true
    window.flp.media.waveform(path).then((p) => alive && setPeaks(p))
    return () => {
      alive = false
    }
  }, [waveform, path])

  // Fetch a thumbnail for the hovered time (local video files only).
  useEffect(() => {
    if (!hover || !showThumbs || kind !== 'video' || !path || /^[a-z]+:\/\//i.test(path)) return setThumb(null)
    let alive = true
    const t = setTimeout(() => window.flp.media.thumbnail(path, hover.t).then((url) => alive && setThumb(url)), 60)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [hover?.t, path, kind, showThumbs])

  const timeAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect()
    const x = Math.min(r.width, Math.max(0, clientX - r.left))
    return { x, t: duration * (x / r.width) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !duration || !seekable) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let last = timeAt(e.clientX).t
    setDrag(last)
    let pending = false
    const move = (ev: PointerEvent) => {
      last = timeAt(ev.clientX).t
      setDrag(last)
      setHover(timeAt(ev.clientX))
      // Live scrub, at most one keyframe seek in flight.
      if (!pending) {
        pending = true
        void player.command('seek', last, 'absolute+keyframes').finally(() => (pending = false))
      }
    }
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      // Released outside the bar: hide the preview too.
      const r = el.getBoundingClientRect()
      if (ev.type === 'pointercancel' || ev.clientY < r.top || ev.clientY > r.bottom || ev.clientX < r.left || ev.clientX > r.right) setHover(null)
      if (ev.type === 'pointercancel') return setDrag(null)
      void seekTo(last).finally(() => setDrag(null))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  // A menu, dialog or window switch can cover the bar without a pointerleave.
  useEffect(() => {
    const clear = () => setHover(null)
    window.addEventListener('blur', clear)
    window.addEventListener('contextmenu', clear)
    return () => {
      window.removeEventListener('blur', clear)
      window.removeEventListener('contextmenu', clear)
    }
  }, [])

  const chapterAt = (t: number) => [...chapters].reverse().find((c) => c.time <= t)?.title

  const bars = useMemo(() => {
    if (!waveform) return null
    const n = 160
    const src = peaks.length ? peaks : Array.from({ length: n }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 1.7)))
    return Array.from({ length: n }, (_, i) => src[Math.floor((i / n) * src.length)] ?? 0.2)
  }, [waveform, peaks])

  return (
    <div className="flp-seek-wrap">
      <div
        ref={trackRef}
        className={`flp-seek ${waveform ? 'flp-seek--wave' : ''}`}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => duration && setHover(timeAt(e.clientX))}
        onPointerLeave={() => drag === null && setHover(null)}
      >
        {bars ? (
          <div className="flp-wave">
            {bars.map((h, i) => (
              <i key={i} style={{ height: `${Math.max(8, h * 100)}%` }} data-played={(i / bars.length) * 100 < pct} />
            ))}
          </div>
        ) : (
          <>
            {cacheAhead > 0 && duration > 0 && /^[a-z]+:\/\//i.test(path ?? '') && (
              <div className="flp-seek__buffer" style={{ left: `${pct}%`, width: `${Math.min(100 - pct, (cacheAhead / duration) * 100)}%` }} />
            )}
            <div className="flp-seek__fill" style={{ width: `${pct}%` }} />
          </>
        )}
        {duration > 0 && chapters.slice(1).map((c, i) => <i key={i} className="flp-seek__chapter" style={{ left: `${(c.time / duration) * 100}%` }} />)}
        {abA !== null && duration > 0 && (
          <div className="flp-seek__ab" style={{ left: `${(abA / duration) * 100}%`, width: abB !== null ? `${((abB - abA) / duration) * 100}%` : 2 }} />
        )}
        {!waveform && <div className="flp-seek__knob" style={{ left: `${pct}%` }} />}
      </div>
      {hover && duration > 0 && (
        <div className="flp-seek__tip" style={{ left: hover.x }}>
          {thumb && <img src={thumb} alt="" />}
          <span>{fmtTime(hover.t, duration >= 3600)}</span>
          {chapterAt(hover.t) && <span className="flp-seek__tipchap">{chapterAt(hover.t)}</span>}
        </div>
      )}
    </div>
  )
}

// ── Volume (wedge) ───────────────────────────────────────────────────────────

function VolumeControl() {
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const max = useSetting<number>('audio.maxVolume') ?? 130
  const ref = useRef<HTMLDivElement>(null)
  const level = muted ? 0 : volume
  const icon = level === 0 ? 'volume-0' : level < 34 ? 'volume-low' : level < 67 ? 'volume-mid' : 'volume-high'
  // The wedge spans 0–100%; above 100% (boost) the fill turns to the accent.
  const pct = Math.min(100, level)

  const valueAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    void setVolume(valueAt(e.clientX))
    const move = (ev: PointerEvent) => void setVolume(valueAt(ev.clientX))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  return (
    <div
      className="flp-volume"
      onWheel={(e) => void setVolume(Math.min(max, volume + (e.deltaY < 0 ? 2 : -2)))}
      title={`Volume ${Math.round(level)}% — scroll to adjust`}
    >
      <IconButton icon={icon} label={muted ? 'Unmute' : 'Mute'} onClick={() => void runCommand('audio.mute')} />
      <div
        ref={ref}
        className="flp-volume__wedge"
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(level)}
        tabIndex={-1}
        onPointerDown={onPointerDown}
      >
        <div className="flp-volume__fill" style={{ width: `${pct}%` }} data-boost={level > 100} />
      </div>
    </div>
  )
}

// ── Title bar pieces ─────────────────────────────────────────────────────────

function FolderCrumb() {
  const path = usePlayer((s) => s.path)
  const section = useUi((s) => s.section)
  const name = folderName(path) || section.charAt(0).toUpperCase() + section.slice(1)
  const dir = path && folderName(path) ? path.slice(0, path.lastIndexOf('/')) : null
  const open = () => {
    if (!dir) return ui.set({ view: 'library' })
    ui.set({ view: 'library', section: 'videos' })
    nav.go({ dir, allKinds: true })
  }
  return (
    <button type="button" className="flp-crumb" title="Show this folder in the library" onClick={open}>
      <Icon name="folder" size={18} />
      <span>{name}</span>
    </button>
  )
}

export function TitleText() {
  const title = usePlayer((s) => s.title)
  const path = usePlayer((s) => s.path)
  const showFile = useSetting<boolean>('interface.titleShowsFile') !== false
  return <span className="flp-titletext">{(showFile && (title || baseName(path))) || 'FLP'}</span>
}

function MoreButton() {
  return <IconButton icon="more" label="Menu" onClick={(e) => openMenu(mainMenu(), e.currentTarget)} />
}

function Thumbnail() {
  const path = usePlayer((s) => s.path)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    setSrc(null)
    if (!path || /^[a-z]+:\/\//i.test(path)) return
    let alive = true
    window.flp.media.thumbnail(path, 5).then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [path])
  return src ? <img className="flp-barthumb" src={src} alt="" /> : null
}

const Text = ({ children }: { children: React.ReactNode }) => <span className="flp-bartext">{children}</span>

defineItem({ id: 'play', label: 'Play / pause', icon: 'play', render: () => <PlayButton /> })
defineItem({ id: 'time', label: 'Current time', icon: 'recent', render: () => <TimeLabel which="time" /> })
defineItem({ id: 'duration', label: 'Duration', icon: 'recent', render: () => <TimeLabel which="duration" /> })
defineItem({ id: 'seek', label: 'Seek bar', icon: 'waveform', flex: true, render: () => <SeekBarAuto /> })
defineItem({ id: 'volume', label: 'Volume', icon: 'volume-high', render: () => <VolumeControl /> })
defineItem({ id: 'spacer', label: 'Spacer', icon: 'move', flex: true, render: () => <span style={{ flex: 1 }} /> })
defineItem({ id: 'divider', label: 'Divider', icon: 'divider', render: () => <span className="flp-divider" /> })
defineItem({ id: 'logo', label: 'FLP logo', icon: 'vlc', render: () => <span className="flp-logo-item"><Logo size={20} /></span> })
defineItem({ id: 'more', label: 'Menu', icon: 'more', render: () => <MoreButton /> })
defineItem({ id: 'folder', label: 'Folder', icon: 'folder', render: () => <FolderCrumb /> })
defineItem({ id: 'thumbnail', label: 'Thumbnail', icon: 'thumbnail', render: () => <Thumbnail /> })
const FileName = () => <Text>{baseName(usePlayer((s) => s.path))}</Text>
const ArtistName = () => <Text>{usePlayer((s) => s.metadata.artist ?? s.metadata.ARTIST ?? '')}</Text>
const FolderName = () => <Text>{folderName(usePlayer((s) => s.path))}</Text>
const PlaylistName = () => {
  const n = usePlayer((s) => s.playlist.length)
  const pos = usePlayer((s) => s.playlistPos)
  return <Text>{n > 1 ? `${pos + 1} of ${n}` : ''}</Text>
}

defineItem({ id: 'fileName', label: 'File name', icon: 'info', render: () => <FileName /> })
defineItem({ id: 'artistName', label: 'Artist name', icon: 'artist', render: () => <ArtistName /> })
defineItem({ id: 'folderName', label: 'Folder name', icon: 'folder', render: () => <FolderName /> })
defineItem({ id: 'playlistName', label: 'Playlist name', icon: 'playlist', render: () => <PlaylistName /> })

function SeekBarAuto() {
  const kind = usePlayer((s) => s.kind)
  return <SeekBar waveform={kind === 'audio'} />
}
