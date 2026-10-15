import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: {
        // The plugin host runs in its own utility process.
        input: { index: resolve('src/main/index.ts'), 'plugin-host': resolve('src/plugin-host/index.ts') }
      }
    }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
