// A lightweight visualizer drawn from the track's waveform and the playback clock.
// (mpv owns the audio output, so this animates the precomputed peaks around the playhead.)
import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '@/state/player'

export function Visualizer({ mode }: { mode: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const path = usePlayer((s) => s.path)
  const [peaks, setPeaks] = useState<number[]>([])

  useEffect(() => {
    setPeaks([])
    if (!path || /^[a-z]+:\/\//i.test(path)) return
    let alive = true
    window.flp.media.waveform(path).then((p) => alive && setPeaks(p))
    return () => {
      alive = false
    }
  }, [path])

  useEffect(() => {
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    let raf = 0
    let last = performance.now()
    let t = usePlayer.getState().time
    const draw = (now: number) => {
      const { paused, duration, time } = usePlayer.getState()
      // Interpolate between the ~10 Hz time updates for smooth motion.
      t = paused ? time : Math.abs(t - time) > 0.5 ? time : t + (now - last) / 1000
      last = now
      const w = (c.width = c.clientWidth * devicePixelRatio)
      const h = (c.height = c.clientHeight * devicePixelRatio)
      ctx.clearRect(0, 0, w, h)
      const accent = getComputedStyle(c).getPropertyValue('--accent').trim() || '#1f9a3a'
      const bars = mode === 'spectrum' ? 48 : 96
      const pos = duration > 0 ? t / duration : 0
      for (let i = 0; i < bars; i++) {
        const src = peaks.length ? peaks[Math.min(peaks.length - 1, Math.floor((pos + (i - bars / 2) / (bars * 8)) * peaks.length))] ?? 0 : 0.3
        const wobble = paused ? 0.6 : 0.75 + 0.25 * Math.sin(now / 140 + i * 0.9)
        const v = Math.max(0.04, src * wobble)
        const x = (i / bars) * w
        const bw = (w / bars) * 0.6
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.35 + 0.65 * v
        if (mode === 'spectrometer') ctx.fillRect(x, h - v * h, bw, v * h)
        else ctx.fillRect(x, (h - v * h) / 2, bw, v * h)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [peaks, mode])

  return <canvas ref={canvas} className="flp-visualizer" />
}
