<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isMock } from '@/api'

const auth = useAuthStore()
const router = useRouter()

const login = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.login(login.value.trim(), password.value)
    router.push(auth.user?.role === 'host' ? '/host' : '/admin/games')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось войти'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wrap">
    <form class="card box" @submit.prevent="submit">
      <h1>Своя игра</h1>
      <p class="muted">Вход в панель управления</p>

      <div class="field">
        <label for="login">Логин</label>
        <input id="login" v-model="login" class="input" autocomplete="username" autofocus required />
      </div>
      <div class="field">
        <label for="password">Пароль</label>
        <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required />
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn btn-primary full" :disabled="busy">{{ busy ? 'Входим…' : 'Войти' }}</button>
      <p v-if="isMock" class="muted hint">Демо-режим: admin / admin</p>
    </form>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 16px;
}

.box {
  width: 100%;
  max-width: 360px;
  padding: 28px;
}

.box h1 {
  color: var(--gold);
}

.box p {
  margin: 4px 0 20px;
}

.full {
  width: 100%;
  margin-top: 6px;
}

.hint {
  margin: 14px 0 0 !important;
  font-size: 13px;
  text-align: center;
}
</style>
