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

async function stations(url: string): Promise<Record<string, any>[]> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Radio directory unavailable (${res.status})`)
  return (await res.json()) as Record<string, any>[]
}

export async function searchStations(query: string): Promise<Station[]> {
  const q = encodeURIComponent(query.trim())
  const opts = 'limit=60&hidebroken=true&order=clickcount&reverse=true'
  // Search names and genres ("jazz", "lofi") together; name matches first.
  const list = q
    ? (await Promise.all([stations(`${RADIO_API}/stations/search?name=${q}&${opts}`), stations(`${RADIO_API}/stations/search?tag=${q}&${opts}`).catch(() => [])])).flat()
    : await stations(`${RADIO_API}/stations/topclick/60`)
  const seen = new Set<string>()
  return list.filter((s) => !seen.has(s.stationuuid) && seen.add(s.stationuuid)).slice(0, 80).map((s) => ({
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

const NAMED: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }
/** Text content of an element: CDATA as-is, everything else with entities decoded (&#8217; &#x2019; &amp; …). */
const decode = (s: string) =>
  s
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part) =>
      part.startsWith('<![CDATA[')
        ? part.slice(9, -3)
        : part.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
            if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m
            const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
            return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
          })
    )
    .join('')
    .trim()
const attr = (el: string, name: string) => el.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find((v) => v !== undefined)
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
  return parsePodcast(await res.text(), feed)
}

export function parsePodcast(xml: string, feed: string): Podcast {
  if (!/<rss|<feed/i.test(xml)) throw new Error("That address isn't a podcast feed")
  // RSS uses <item>, Atom uses <entry> with <link rel="enclosure">.
  const atom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const itemTag = atom ? 'entry' : 'item'
  const channel = xml.split(new RegExp(`<${itemTag}[\\s>]`, 'i'))[0]
  const itunesImage = channel.match(/<itunes:image[^>]*>/i)?.[0]
  const image = (itunesImage && attr(itunesImage, 'href')) || tag(tag(channel, 'image'), 'url') || tag(channel, 'logo') || tag(channel, 'icon')
  const episodes: Episode[] = []
  for (const m of xml.matchAll(new RegExp(`<${itemTag}[\\s>]([\\s\\S]*?)</${itemTag}>`, 'gi'))) {
    const item = m[1]
    const enclosure = atom
      ? [...item.matchAll(/<link\b[^>]*>/gi)].map((l) => l[0]).find((l) => attr(l, 'rel') === 'enclosure')
      : item.match(/<enclosure\b[^>]*>/i)?.[0]
    const url = enclosure && attr(enclosure, atom ? 'href' : 'url')
    if (!url) continue
    episodes.push({
      title: tag(item, 'title'),
      url: decode(url),
      published: Date.parse(tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated')) || 0,
      duration: parseDuration(tag(item, 'itunes:duration')),
      description: strip(tag(item, 'itunes:summary') || tag(item, 'description') || tag(item, 'summary') || tag(item, 'content')).slice(0, 400)
    })
  }
  const author = tag(channel, 'itunes:author') || tag(tag(channel, 'author'), 'name')
  return { feed, title: tag(channel, 'title') || feed, author, image, episodes }
}
