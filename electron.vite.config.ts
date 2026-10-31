import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Alias dùng chung: '@core' (API công khai của core), '@data' (JSON dữ liệu game).
// Phải khớp với "paths" trong tsconfig.node.json / tsconfig.web.json và vitest.config.mts.
const sharedAlias = {
  '@core': resolve('src/core'),
  '@data': resolve('src/data')
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias }
  },
  preload: {
    resolve: { alias: sharedAlias }
  },
  renderer: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
