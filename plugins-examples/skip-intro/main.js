// Skip Intro: storage + playback events + notifications with an action button.
// Markers are stored per folder, so marking one episode covers the whole season.

/** @param {import('../../docs/plugin-api').FLP} flp */
export function activate(flp) {
  flp.settings.define([
    { key: 'auto', label: 'Skip automatically (no button)', type: 'toggle', default: false },
    { key: 'skipCredits', label: 'Also skip end credits to the next episode', type: 'toggle', default: true }
  ])

  const folderOf = (path) => (path && !/^[a-z]+:\/\//i.test(path) ? path.replace(/\/[^/]+$/, '') : null)
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  let current = { folder: null, offeredIntro: false, offeredCredits: false }

  async function mark(kind) {
    const s = await flp.player.state()
    const folder = folderOf(s.path)
    if (!folder) return flp.ui.osd('Open a local file first')
    const markers = flp.storage.get(folder, {})
    markers[kind] = s.time
    flp.storage.set(folder, markers)
    flp.ui.osd(kind === 'introEnd' ? `Intro ends at ${fmt(s.time)} for this folder` : `Credits start at ${fmt(s.time)} for this folder`)
  }

  flp.commands.register({ id: 'mark-intro', title: 'Mark intro end here', icon: 'bookmark', run: () => mark('introEnd') })
  flp.commands.register({ id: 'mark-credits', title: 'Mark credits start here', icon: 'bookmark', run: () => mark('creditsStart') })
  flp.commands.register({
    id: 'skip',
    title: 'Skip intro',
    icon: 'forward-10-sec',
    keys: ['Mod+Shift+K'],
    run: async () => {
      const s = await flp.player.state()
      const m = flp.storage.get(folderOf(s.path), {})
      if (m.introEnd && s.time < m.introEnd) await flp.player.seek(m.introEnd)
      else flp.ui.osd('No intro marked here yet. Use "Mark intro end here"')
    }
  })
  flp.commands.register({
    id: 'clear',
    title: 'Clear intro/credits markers for this folder',
    icon: 'remove',
    run: async () => {
      const folder = folderOf((await flp.player.state()).path)
      if (folder) flp.storage.delete(folder)
      flp.ui.osd('Markers cleared')
    }
  })
  flp.ui.addContextMenuItem({ label: 'Mark intro end here', command: 'mark-intro' })
  flp.ui.addContextMenuItem({ label: 'Mark credits start here', command: 'mark-credits' })

  flp.player.on('file-loaded', ({ path }) => {
    current = { folder: folderOf(path), offeredIntro: false, offeredCredits: false }
  })

  flp.player.on('time', async (t) => {
    if (!current.folder) return
    const m = flp.storage.get(current.folder, {})
    if (m.introEnd && !current.offeredIntro && t < m.introEnd - 2) {
      current.offeredIntro = true
      if (flp.settings.get('auto')) await flp.player.seek(m.introEnd)
      else flp.ui.notify('Intro playing', { action: { label: 'Skip Intro', command: 'skip-intro.skip' } })
    }
    if (m.creditsStart && !current.offeredCredits && t >= m.creditsStart && flp.settings.get('skipCredits')) {
      current.offeredCredits = true
      flp.ui.notify('Credits', { action: { label: 'Next Episode', command: 'player.next' } })
    }
  })
}
