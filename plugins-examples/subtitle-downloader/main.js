// Subtitle Downloader: network access + writing files + a panel.
import { writeFile } from 'node:fs/promises'

const API = 'https://api.opensubtitles.com/api/v1'

/** @param {import('../../docs/plugin-api').FLP} flp */
export function activate(flp) {
  flp.settings.define([
    { key: 'apiKey', label: 'OpenSubtitles API key', info: 'Free at opensubtitles.com → Consumers', type: 'text', default: '', secret: true },
    { key: 'language', label: 'Language code(s)', info: 'Comma-separated, e.g. en,fr', type: 'text', default: 'en' }
  ])

  const panel = flp.ui.addPanel({ id: 'search', title: 'Find Subs', file: 'panel.html' })
  const headers = () => ({ 'Api-Key': flp.settings.get('apiKey'), 'User-Agent': 'FLP v1.0', 'Content-Type': 'application/json', Accept: 'application/json' })

  const cleanName = (path) =>
    path.split('/').pop().replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/\b(1080p|720p|2160p|x264|x265|hevc|web-?dl|bluray|h264|aac)\b.*$/i, '').trim()

  async function search(query) {
    if (!flp.settings.get('apiKey')) return panel.postMessage({ error: 'Add your OpenSubtitles API key in Settings → Extensions → Subtitle Downloader.' })
    const s = await flp.player.state()
    const q = query || (s.path ? cleanName(s.path) : '')
    if (!q) return panel.postMessage({ error: 'Play a video first, or type a title.' })
    panel.postMessage({ searching: q })
    const url = `${API}/subtitles?query=${encodeURIComponent(q)}&languages=${encodeURIComponent(flp.settings.get('language') || 'en')}`
    const res = await flp.fetch(url, { headers: headers() })
    if (!res.ok) return panel.postMessage({ error: `OpenSubtitles said ${res.status}` })
    const json = await res.json()
    const results = (json.data ?? []).slice(0, 30).map((r) => ({
      fileId: r.attributes.files?.[0]?.file_id,
      name: r.attributes.release || r.attributes.feature_details?.title || 'Subtitle',
      lang: r.attributes.language,
      downloads: r.attributes.download_count
    })).filter((r) => r.fileId)
    panel.postMessage({ results, query: q })
  }

  async function download(fileId, lang) {
    const s = await flp.player.state()
    if (!s.path || /^[a-z]+:\/\//i.test(s.path)) return panel.postMessage({ error: 'Downloading needs a local video playing.' })
    const res = await flp.fetch(`${API}/download`, { method: 'POST', headers: headers(), body: JSON.stringify({ file_id: fileId }) })
    if (!res.ok) return panel.postMessage({ error: `Download failed (${res.status}). You may have hit the daily limit.` })
    const { link } = await res.json()
    const text = await (await flp.fetch(link)).text()
    const target = s.path.replace(/\.[^.]+$/, '') + `.${lang || 'en'}.srt`
    await writeFile(target, text)
    await flp.player.command('sub-add', target, 'select')
    flp.ui.osd('Subtitles loaded')
    panel.postMessage({ done: target.split('/').pop() })
  }

  // "Find subtitles online" opens the panel first; the search runs once the panel says hello
  // (or straight away if it was already open).
  let pending = null
  const runPending = () => {
    if (pending === null) return
    const q = pending
    pending = null
    search(q).catch((e) => panel.postMessage({ error: e.message }))
  }

  panel.onMessage((msg) => {
    if (msg.hello) runPending()
    if (msg.search !== undefined) search(msg.search).catch((e) => panel.postMessage({ error: e.message }))
    if (msg.download) download(msg.download, msg.lang).catch((e) => panel.postMessage({ error: e.message }))
  })

  flp.commands.register({
    id: 'find',
    title: 'Find subtitles online',
    icon: 'subtitles',
    run: async () => {
      pending = ''
      await flp.commands.run('ui.showPanel', 'plugin:subtitle-downloader:search')
      setTimeout(runPending, 600)
    }
  })
}
