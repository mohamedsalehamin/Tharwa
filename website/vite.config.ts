import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backendTarget =
  process.env.VITE_BACKEND_PROXY_TARGET?.trim() || 'http://127.0.0.1:3000'

export default defineConfig({
  server: {
    port: 3002,
    proxy: {
      '/__tharwa_api': {
        target: backendTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__tharwa_api/, ''),
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
