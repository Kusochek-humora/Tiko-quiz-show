import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api, authHooks, isMock, TOKEN_KEY, type User } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<User | null>(null)
  const ready = ref(false)
  const isAuthed = computed(() => !!user.value)

  function clear() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  // Любой 401 от API выкидывает на страницу входа
  authHooks.onUnauthorized = () => {
    clear()
    window.location.hash = '#/login'
  }

  async function init() {
    if (ready.value) return
    if (token.value) {
      try {
        user.value = await api.me()
      } catch {
        clear()
      }
    }
    // Демо-режим на моках: входим автоматически, чтобы не мешал экран логина
    if (isMock && !user.value) {
      try {
        await login('admin', 'admin')
      } catch {
        /* остаёмся на странице входа */
      }
    }
    ready.value = true
  }

  async function login(loginName: string, password: string) {
    const res = await api.login(loginName, password)
    token.value = res.token
    user.value = res.user
    localStorage.setItem(TOKEN_KEY, res.token)
  }

  function logout() {
    clear()
  }

  return { token, user, ready, isAuthed, init, login, logout }
})
