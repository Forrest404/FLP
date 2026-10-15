// Internet radio (radio-browser.info directory) and podcasts (any RSS feed).
// Nothing is fetched until the user searches or subscribes.

export interface Station {
  id: string
  name: string
  url: string
  country: string
  tags: string
  codec: string
  bitrate: number
  favicon: string
}

export interface Episode {
  title: string
  url: string
  published: number
  duration: number
  description: string
}

export interface Podcast {
  feed: string
  title: string
  author: string
  image: string
  episodes: Episode[]
}

const RADIO_API = 'https://all.api.radio-browser.info/json'
const UA = { 'user-agent': 'FLP/0.1 (Forrest Labs Play)' }

export async function searchStations(query: string): Promise<Station[]> {
  const url = query.trim()
    ? `${RADIO_API}/stations/search?name=${encodeURIComponent(query)}&limit=60&hidebroken=true&order=clickcount&reverse=true`
    : `${RADIO_API}/stations/topclick/60`
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Radio directory unavailable (${res.status})`)
  const list = (await res.json()) as Record<string, any>[]
  return list.map((s) => ({
    id: s.stationuuid,
    name: String(s.name).trim(),
    url: s.url_resolved || s.url,
    country: s.countrycode ?? '',
    tags: String(s.tags ?? '').split(',').slice(0, 3).join(', '),
    codec: s.codec ?? '',
    bitrate: s.bitrate ?? 0,
    favicon: s.favicon ?? ''
  }))
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim()
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : ''
}
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function parseDuration(d: string): number {
  if (!d) return 0
  if (/^\d+$/.test(d)) return Number(d)
  return d.split(':').reduce((a, b) => a * 60 + Number(b), 0)
}

export async function fetchPodcast(feed: string): Promise<Podcast> {
  const res = await fetch(feed, { headers: UA, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Couldn't load the feed (${res.status})`)
  const xml = await res.text()
  if (!/<rss|<feed/i.test(xml)) throw new Error("That address isn't a podcast feed")
  const channel = xml.split(/<item[\s>]/i)[0]
  const image = channel.match(/<itunes:image[^>]*href="([^"]+)"/i)?.[1] ?? tag(tag(channel, 'image'), 'url')
  const episodes: Episode[] = []
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const item = m[1]
    const url = item.match(/<enclosure[^>]*url="([^"]+)"/i)?.[1]
    if (!url) continue
    episodes.push({
      title: tag(item, 'title'),
      url: decode(url),
      published: Date.parse(tag(item, 'pubDate')) || 0,
      duration: parseDuration(tag(item, 'itunes:duration')),
      description: strip(tag(item, 'itunes:summary') || tag(item, 'description')).slice(0, 400)
    })
  }
  return { feed, title: tag(channel, 'title') || feed, author: tag(channel, 'itunes:author'), image, episodes }
}
