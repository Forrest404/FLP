// Listening Log: the smallest useful plugin, using events + storage + a command.

/** @param {import('../../docs/plugin-api').FLP} flp */
export function activate(flp) {
  flp.player.on('file-loaded', ({ path, title, private: hidden }) => {
    // Respect Settings → Privacy (files FLP is told not to remember).
    if (hidden) return
    const log = flp.storage.get('log', [])
    log.push({ at: new Date().toISOString(), title: title || path, path })
    flp.storage.set('log', log.slice(-500))
  })

  flp.commands.register({
    id: 'show',
    title: 'Show listening log',
    icon: 'recent',
    run: () => {
      const log = flp.storage.get('log', [])
      const today = log.filter((e) => e.at.slice(0, 10) === new Date().toISOString().slice(0, 10))
      flp.ui.notify(today.length ? `Today: ${today.map((e) => e.title).slice(-5).join(', ')}` : 'Nothing played yet today.')
    }
  })
}
