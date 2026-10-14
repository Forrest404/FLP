import { useEffect, useRef } from 'react'
import { player, usePlayer } from './state/player'

const fmt = (s: number) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 19)

export function App() {
  const videoRef = useRef<HTMLDivElement>(null)
  const { paused, time, duration, title, error } = usePlayer()

  // Keep the native mpv view exactly under this transparent element.
  useEffect(() => {
    const el = videoRef.current!
    const report = () => {
      const r = el.getBoundingClientRect()
      player.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height })
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    report()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  const open = async () => {
    const [file] = await window.flp.dialog.openFiles()
    if (file) player.command('loadfile', file)
  }

  return (
    <div className="app">
      <div className="titlebar">{title ?? 'FLP'}</div>
      <div className="video" ref={videoRef} />
      <div className="controls">
        <button onClick={open}>Open</button>
        <button onClick={() => player.command('cycle', 'pause')}>{paused ? 'Play' : 'Pause'}</button>
        <span>{fmt(time)}</span>
        <input type="range" min={0} max={duration || 1} step={0.1} value={time}
          onChange={(e) => player.command('seek', Number(e.target.value), 'absolute')} />
        <span>{fmt(duration)}</span>
        {error && <span style={{ color: '#e66' }}>{error}</span>}
      </div>
    </div>
  )
}
