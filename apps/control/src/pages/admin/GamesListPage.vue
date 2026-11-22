<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGamesStore } from '@/stores/games'
import BaseModal from '@/components/BaseModal.vue'

const store = useGamesStore()
const router = useRouter()

const error = ref('')
const creating = ref(false)
const newTitle = ref('')

onMounted(() => store.loadList().catch((e) => (error.value = e.message)))

async function create() {
  const title = newTitle.value.trim()
  if (!title) return
  try {
    const game = await store.createGame(title)
    router.push({ name: 'game-editor', params: { id: game.id } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось создать игру'
  }
}

async function duplicate(id: string) {
  try {
    await store.duplicateGame(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось дублировать'
  }
}

async function remove(id: string, title: string) {
  if (!confirm(`Удалить игру «${title}» со всеми вопросами?`)) return
  try {
    await store.deleteGame(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось удалить'
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Игры</h1>
      <button class="btn btn-primary" @click="creating = true">+ Новая игра</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="store.loading" class="muted">Загрузка…</p>
    <p v-else-if="!store.list.length" class="empty">Игр пока нет. Создайте первую.</p>

    <div class="grid">
      <article v-for="g in store.list" :key="g.id" class="card game">
        <RouterLink :to="{ name: 'game-editor', params: { id: g.id } }" class="title">{{ g.title }}</RouterLink>
        <p v-if="g.description" class="muted desc">{{ g.description }}</p>
        <p class="muted meta">
          Раундов: {{ g.roundsCount }} · Вопросов: {{ g.questionsCount }}<br />
          Изменено: {{ fmt(g.updatedAt) }}
        </p>
        <div class="row actions">
          <RouterLink class="btn btn-sm btn-primary" :to="{ name: 'game-editor', params: { id: g.id } }">Редактировать</RouterLink>
          <button class="btn btn-sm" @click="duplicate(g.id)">Копия</button>
          <button class="btn btn-sm btn-danger" @click="remove(g.id, g.title)">Удалить</button>
        </div>
      </article>
    </div>

    <BaseModal v-if="creating" title="Новая игра" @close="creating = false">
      <form @submit.prevent="create">
        <div class="field">
          <label>Название</label>
          <input v-model="newTitle" class="input" autofocus required />
        </div>
        <div class="row" style="justify-content: flex-end">
          <button type="button" class="btn" @click="creating = false">Отмена</button>
          <button class="btn btn-primary">Создать</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.game {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  font-size: 18px;
  font-weight: 600;
}

.title:hover {
  color: var(--accent-hover);
}

.desc,
.meta {
  margin: 0;
}

.meta {
  font-size: 13px;
}

.actions {
  margin-top: auto;
  padding-top: 8px;
  flex-wrap: wrap;
}
</style>
