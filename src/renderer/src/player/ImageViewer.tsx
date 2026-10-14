import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '@shared/api'
import { IconButton } from '@/components/controls'
import { openMenu } from '@/components/Menu'
import { runCommand } from '@/commands/registry'
import { player, usePlayer } from '@/state/player'
import { rightClickMenu } from './menus'

/** Images are shown by the web layer (zoom, pan, rotate); mpv keeps the playlist. */
export function ImageViewer() {
  const path = usePlayer((s) => s.path)
  const [src, setSrc] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rotate, setRotate] = useState(0)
  const [slideshow, setSlideshow] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setRotate(0)
    setSrc(null)
    if (!path) return
    if (/^[a-z]+:\/\//i.test(path)) return setSrc(path)
    window.flp.media.displayableImage(path).then((p) => setSrc(mediaUrl(p)))
    // Keep mpv on the image indefinitely unless a slideshow is running.
    void player.set('image-display-duration', slideshow ? 5 : 'inf')
  }, [path])

  useEffect(() => {
    void player.set('image-display-duration', slideshow ? 5 : 'inf')
  }, [slideshow])

  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(16, Math.max(0.1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
    setZoom(next)
    if (next <= 1) setPan({ x: 0, y: 0 })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return
    const start = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => setPan({ x: ev.clientX - start.x, y: ev.clientY - start.y })
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={box}
      className="flp-image"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        setZoom(zoom === 1 ? 2 : 1)
        setPan({ x: 0, y: 0 })
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(rightClickMenu(), e)
      }}
      style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
    >
      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotate}deg)` }}
        />
      )}
      <div className="flp-image__tools" onPointerDown={(e) => e.stopPropagation()}>
        <IconButton icon="previous" label="Previous image" onClick={() => void runCommand('player.previous')} />
        <IconButton icon="zoom" label="Zoom in" onClick={() => setZoom(Math.min(16, zoom * 1.25))} />
        <span className="flp-image__zoom">{Math.round(zoom * 100)}%</span>
        <IconButton icon="refresh" label="Rotate" onClick={() => setRotate((rotate + 90) % 360)} />
        <IconButton icon={slideshow ? 'pause' : 'play'} label={slideshow ? 'Stop slideshow' : 'Slideshow'} pressed={slideshow} onClick={() => setSlideshow(!slideshow)} />
        <IconButton icon="next" label="Next image" onClick={() => void runCommand('player.next')} />
      </div>
    </div>
  )
}
