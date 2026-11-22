import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// VITE_BASE нужен для GitHub Pages, например /quiz-web/control/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
