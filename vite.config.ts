import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      // Requests to /api are forwarded to http://localhost:3001
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
