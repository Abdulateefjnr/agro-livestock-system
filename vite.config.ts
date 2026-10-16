import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 1. Import Tailwind

// https://vite.dev
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/agro-livestock-system/' : '/',
  plugins: [
    react(),
    tailwindcss(), // 2. Add to plugins
  ],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['tt6k6lb2-5173.uks1.devtunnels.ms'],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
