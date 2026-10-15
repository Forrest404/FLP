// Sleep Timer: commands + a panel + settings + a control-bar button.

// Module-level so deactivate() can stop it when the plugin is turned off or reloaded.
let tick = null

/** @param {import('../../docs/plugin-api').FLP} flp */
export function activate(flp) {
  let endsAt = 0 // timestamp, or -1 for "end of current item"

  flp.settings.define([
    { key: 'action', label: 'When the timer ends', type: 'select', default: 'pause', options: [
      { value: 'pause', label: 'Pause' }, { value: 'stop', label: 'Stop' }] },
    { key: 'fade', label: 'Fade out the volume over the last minute', type: 'toggle', default: true }
  ])

  const panel = flp.ui.addPanel({ id: 'timer', title: 'Sleep', file: 'panel.html' })
  const remaining = () => (endsAt > 0 ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : endsAt)
  const update = () => panel.postMessage({ remaining: remaining() })

  let startVolume = null
  async function finish() {
    cancel(false)
    if (flp.settings.get('action') === 'stop') await flp.player.stop()
    else await flp.player.pause()
    if (startVolume !== null) await flp.player.set('volume', startVolume)
    startVolume = null
    flp.ui.notify('Sleep timer finished. Good night!')
  }

  function cancel(announce = true) {
    clearInterval(tick)
    tick = null
    endsAt = 0
    // Cancelled during the fade: put the volume back.
    if (announce && startVolume !== null) void flp.player.set('volume', startVolume)
    if (announce) startVolume = null
    update()
    if (announce) flp.ui.osd('Sleep timer off')
  }

  async function start(minutes) {
    clearInterval(tick)
    if (startVolume !== null) await flp.player.set('volume', startVolume)
    endsAt = minutes === 'end' ? -1 : Date.now() + minutes * 60000
    startVolume = null
    flp.ui.osd(minutes === 'end' ? 'Sleep at the end of this item' : `Sleep in ${minutes} min`)
    update()
    if (endsAt === -1) return
    tick = setInterval(async () => {
      const left = remaining()
      update()
      if (flp.settings.get('fade') && left <= 60 && left > 0) {
        if (startVolume === null) startVolume = (await flp.player.state()).volume
        await flp.player.set('volume', Math.round(startVolume * (left / 60)))
      }
      if (left <= 0) await finish()
    }, 1000)
  }

  for (const m of [15, 30, 45, 60, 90]) {
    flp.commands.register({ id: `in-${m}`, title: `Sleep timer: ${m} minutes`, icon: 'recent', run: () => start(m) })
  }
  flp.commands.register({ id: 'end', title: 'Sleep timer: end of this item', icon: 'recent', run: () => start('end') })
  flp.commands.register({ id: 'cancel', title: 'Sleep timer: cancel', icon: 'close', run: () => cancel() })
  flp.commands.register({
    id: 'open',
    title: 'Sleep timer',
    icon: 'recent',
    run: () => flp.commands.run('ui.showPanel', 'plugin:sleep-timer:timer')
  })
  flp.ui.addControlButton('open')

  panel.onMessage((msg) => {
    if (msg.start) start(msg.start)
    if (msg.cancel) cancel()
    if (msg.hello) update()
  })

  flp.player.on('ended', (e) => {
    if (endsAt === -1 && e.reason === 'eof') finish()
  })
}

export function deactivate() {
  clearInterval(tick)
  tick = null
}
