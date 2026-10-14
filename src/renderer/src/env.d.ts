/// <reference types="vite/client" />
import type { RendererApi } from '@shared/player'

declare global {
  interface Window {
    flp: RendererApi
  }
}
