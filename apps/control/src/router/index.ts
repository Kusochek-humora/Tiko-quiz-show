import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Hash-режим: GitHub Pages не умеет отдавать index.html на произвольные пути
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/admin/games' },
    { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { roles: ['admin'] },
      children: [
        { path: '', redirect: '/admin/games' },
        { path: 'games', name: 'games', component: () => import('@/pages/admin/GamesListPage.vue') },
        { path: 'games/:id', name: 'game-editor', component: () => import('@/pages/admin/GameEditorPage.vue') },
        { path: 'media', name: 'media', component: () => import('@/pages/admin/MediaPage.vue') },
        { path: 'participants', name: 'participants', component: () => import('@/pages/admin/ParticipantsPage.vue') },
      ],
    },
    {
      path: '/host',
      name: 'host',
      component: () => import('@/pages/host/HostConsolePage.vue'),
      meta: { roles: ['admin', 'host'] },
    },
    // Экран эфира: без авторизации (в бою доступ по токену сессии)
    { path: '/screen', name: 'screen', component: () => import('@/screen/ScreenPage.vue'), meta: { public: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()

  if (to.meta.public) {
    return auth.isAuthed && to.name === 'login' ? { path: '/' } : true
  }
  if (!auth.isAuthed) return { name: 'login' }

  const roles = to.matched.flatMap((r) => (r.meta.roles as string[] | undefined) ?? [])
  if (roles.length && !roles.includes(auth.user!.role)) {
    return auth.user!.role === 'host' ? { name: 'host' } : { name: 'login' }
  }
  return true
})
