import { useEffect, useState } from 'react'
import { mediaUrl, type AudioTags } from '@shared/api'
import { Icon } from '@/components/Icon'
import { usePlayer } from '@/state/player'
import { baseName } from '@/state/playback'
import { useSetting } from '@/state/settings'
import { Visualizer } from './Visualizer'

export function MusicView() {
  const path = usePlayer((s) => s.path)
  const meta = usePlayer((s) => s.metadata)
  const mediaTitle = usePlayer((s) => s.title)
  const showCover = useSetting<boolean>('interface.coverArt') !== false
  const visualizer = useSetting<string>('audio.visualizer') ?? 'waveform'
  const [tags, setTags] = useState<AudioTags>({})

  useEffect(() => {
    setTags({})
    if (path && !/^[a-z]+:\/\//i.test(path)) window.flp.media.tags(path).then(setTags)
  }, [path])

  const title = tags.title || meta.title || meta.TITLE || mediaTitle || baseName(path)
  const artist = tags.artist || meta.artist || meta.ARTIST
  const cover = showCover && tags.cover ? mediaUrl(tags.cover) : null

  return (
    <div className="flp-music">
      {cover && <div className="flp-music__bg" style={{ backgroundImage: `url("${cover}")` }} />}
      <div className="flp-music__art">
        {cover ? (
          <img src={cover} alt="" />
        ) : visualizer !== 'none' ? (
          <Visualizer mode={visualizer} />
        ) : (
          <Icon name="music" size={120} />
        )}
      </div>
      <div className="flp-music__caption">
        {title}
        {artist ? ` - ${artist}` : ''}
        {tags.album && <small>{tags.album}{tags.year ? ` · ${tags.year}` : ''}</small>}
      </div>
    </div>
  )
}
