/// <reference types="vite/client" />
import type { RendererApi } from '@shared/api'

declare global {
  interface Window {
    flp: RendererApi
  }
}
