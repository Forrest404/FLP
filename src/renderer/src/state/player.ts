import { create } from 'zustand'
import { initialPlayerState, type PlayerState } from '@shared/player'

export const usePlayer = create<PlayerState>(() => initialPlayerState)

window.flp.player.onState((patch) => usePlayer.setState(patch))
window.flp.player.snapshot().then((s) => s && usePlayer.setState(s))

export const player = window.flp.player

// Opening something from idle brings up the player.
usePlayer.subscribe((s, prev) => {
  if (s.path && !prev.path) import('./ui').then(({ ui }) => ui.set({ view: 'player' }))
})
