import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { validateHostingEnv } from './config/hosting.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const hosting = mode === 'hosting'
  if (hosting) validateHostingEnv(process.env)
  return {
    // Hosting recibe solo variables del proceso de build, sin cargar .env locales.
    ...(hosting ? { envDir: false } : {}),
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: process.env.VITE_PROXI_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
