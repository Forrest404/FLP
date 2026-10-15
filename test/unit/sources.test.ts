import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { typeOf } from '@shared/library'
import { parsePodcast } from '../../src/main/feeds'
import { LibraryDb } from '../../src/main/library/db'

describe('typeOf for streams and look-alikes', () => {
  it('uses the URL path, not the query', () => {
    expect(typeOf('https://cdn.example/ep.mp3?dest-id=1')).toBe('audio')
    expect(typeOf('http://ice1.somafm.com/groovesalad-128-mp3')).toBeNull()
    expect(typeOf('https://example.com/watch?v=abc.mp4')).toBeNull()
  })
})

describe('podcast feeds', () => {
  it('decodes numeric entities and single-quoted enclosures', () => {
    const p = parsePodcast(
      `<rss><channel><title>Don&#039;t Panic &#x2019; &amp; more</title>
       <item><title><![CDATA[It's &amp; raw]]></title><enclosure type='audio/mpeg' url='https://x/a.mp3?x=1&amp;y=2'/></item>
       </channel></rss>`,
      'f'
    )
    expect(p.title).toBe('Don\'t Panic ’ & more')
    expect(p.episodes[0].title).toBe("It's &amp; raw")
    expect(p.episodes[0].url).toBe('https://x/a.mp3?x=1&y=2')
  })

  it('reads Atom feeds', () => {
    const p = parsePodcast(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Cast</title><author><name>Ann</name></author>
       <entry><title>One</title><published>2024-01-02T00:00:00Z</published><link rel="alternate" href="https://x/page"/><link rel="enclosure" href="https://x/1.m4a"/></entry></feed>`,
      'f'
    )
    expect(p.author).toBe('Ann')
    expect(p.episodes).toHaveLength(1)
    expect(p.episodes[0].url).toBe('https://x/1.m4a')
    expect(p.episodes[0].published).toBeGreaterThan(0)
  })
})

describe('library database', () => {
  const db = () => new LibraryDb(join(mkdtempSync(join(tmpdir(), 'flp-db-')), 'lib.sqlite'))

  it('keeps no resume point for live streams', () => {
    const d = db()
    d.touchPlayed('http://radio/live', 'video', 'Live', 0)
    d.savePosition('http://radio/live', 1800, 0)
    expect(d.byPath('http://radio/live')!.position).toBe(0)
  })

  it('makes a finished film resumable again when rewatched part-way', () => {
    const d = db()
    d.touchPlayed('/m/film.mkv', 'video', 'Film', 6000)
    d.finished('/m/film.mkv')
    expect(d.byPath('/m/film.mkv')!.watched).toBe(true)
    d.savePosition('/m/film.mkv', 2000, 6000)
    const m = d.byPath('/m/film.mkv')!
    expect(m.watched).toBe(false)
    expect(m.position).toBe(2000)
  })

  it('searches below the library folder, not the whole path', () => {
    const d = db()
    d.addRoot('/Users/me/Movies')
    d.upsertScanned({ path: '/Users/me/Movies/Alien/Alien.mkv', type: 'video', size: 1, mtime: 1 })
    d.upsertScanned({ path: '/Users/me/Movies/Heat.mkv', type: 'video', size: 1, mtime: 1 })
    expect(d.search('movies', ['video'])).toHaveLength(0)
    expect(d.search('alien', ['video'])).toHaveLength(1)
  })

  it('keeps files under folders that could not be read', () => {
    const d = db()
    d.addRoot('/r')
    d.upsertScanned({ path: '/r/nas/a.mkv', type: 'video', size: 1, mtime: 1 })
    d.upsertScanned({ path: '/r/b.mkv', type: 'video', size: 1, mtime: 1 })
    d.prune('/r', new Set(['/r/b.mkv']), ['/r/nas'])
    expect(d.byPath('/r/nas/a.mkv')!.inLibrary).toBe(true)
  })
})
