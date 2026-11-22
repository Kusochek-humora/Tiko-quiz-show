<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isMock } from '@/api'

const auth = useAuthStore()
const router = useRouter()

const nav = [
  { to: '/admin/games', label: 'Игры' },
  { to: '/admin/media', label: 'Медиа' },
  { to: '/admin/participants', label: 'Игроки' },
  { to: '/host', label: 'Пульт ведущего' },
]

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">Своя игра</div>
      <nav>
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="link" active-class="active">{{ n.label }}</RouterLink>
      </nav>
      <div class="foot">
        <span v-if="isMock" class="badge" title="Данные хранятся в браузере">Демо-режим</span>
        <div class="muted">{{ auth.user?.login }}</div>
        <button class="btn btn-sm" @click="logout">Выйти</button>
      </div>
    </aside>
    <main class="main"><RouterView /></main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100%;
}

.side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 220px;
  height: 100vh;
  padding: 20px 14px;
  background: var(--panel);
  border-right: 1px solid var(--line);
}

.brand {
  padding: 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--gold);
}

nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link {
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--muted);
}

.link:hover {
  background: var(--panel-2);
  color: var(--text);
}

.link.active {
  background: var(--accent);
  color: #fff;
}

.foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  padding: 0 4px;
}

.badge {
  align-self: flex-start;
  padding: 2px 8px;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  font-size: 12px;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 28px 32px;
}

@media (max-width: 760px) {
  .shell {
    flex-direction: column;
  }
  .side {
    position: static;
    width: 100%;
    height: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding: 10px 14px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .foot {
    flex-direction: row;
    align-items: center;
    margin: 0 0 0 auto;
  }
  .main {
    padding: 18px 14px;
  }
}
</style>
