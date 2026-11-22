import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// VITE_BASE нужен для GitHub Pages, например /quiz-web/control/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = env.VITE_API_URL

  return {
    base: process.env.VITE_BASE ?? '/',
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // В разработке запросы к бэку идут через dev-сервер: для браузера это тот же адрес,
    // поэтому CORS не мешает, и на бэке не нужно разрешать localhost.
    server: api
      ? {
          proxy: {
            '/api': { target: api, changeOrigin: true },
            '/uploads': { target: api, changeOrigin: true },
            '/ws': { target: api, changeOrigin: true, ws: true },
          },
        }
      : {},
  }
})
