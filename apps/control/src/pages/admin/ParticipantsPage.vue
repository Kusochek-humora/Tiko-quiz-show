<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Participant } from '@/api'
import { useParticipantsStore } from '@/stores/participants'
import MediaPicker from '@/components/MediaPicker.vue'

const store = useParticipantsStore()
const error = ref('')
const newName = ref('')
const newColor = ref('#4f8cff')
const newScore = ref(0)
const newPhoto = ref<string | null>(null)

onMounted(() => store.load().catch((e) => (error.value = e.message)))

async function run(fn: () => Promise<unknown>) {
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка'
  }
}

async function add() {
  const name = newName.value.trim()
  if (!name) return
  await run(() => store.create(name, newColor.value, Number(newScore.value) || 0, newPhoto.value))
  newName.value = ''
  newScore.value = 0
  newPhoto.value = null
}

const setPhoto = (p: Participant, id: string | null) => run(() => store.update(p.id, { photoMediaId: id }))

function rescore(p: Participant, e: Event) {
  const score = Math.trunc(Number((e.target as HTMLInputElement).value) || 0)
  if (score !== p.defaultStartScore) run(() => store.update(p.id, { defaultStartScore: score }))
}

function rename(p: Participant, e: Event) {
  const el = e.target as HTMLInputElement
  const name = el.value.trim()
  if (!name) {
    el.value = p.name
    return
  }
  if (name !== p.name) run(() => store.update(p.id, { name }))
}

const recolor = (p: Participant, e: Event) => run(() => store.update(p.id, { color: (e.target as HTMLInputElement).value }))

function remove(p: Participant) {
  if (confirm(`Удалить игрока «${p.name}»?`)) run(() => store.remove(p.id))
}
</script>

<template>
  <div>
    <div class="page-head"><h1>Игроки</h1></div>
    <p class="muted intro">Игроки выбираются при запуске игры и отображаются на табло. Число игроков не ограничено. Поле справа — стартовый балл по умолчанию, его можно изменить и во время игры.</p>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="card list">
      <div v-for="p in store.items" :key="p.id" class="row item">
        <MediaPicker compact type="image" :model-value="p.photoMediaId" @update:model-value="setPhoto(p, $event)" />
        <input type="color" class="color" :value="p.color" aria-label="Цвет" @change="recolor(p, $event)" />
        <input class="input" :value="p.name" aria-label="Имя" @blur="rename(p, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
        <input class="input score" type="number" step="100" :value="p.defaultStartScore" title="Стартовый балл" aria-label="Стартовый балл" @change="rescore(p, $event)" />
        <button class="btn btn-sm btn-danger" @click="remove(p)">Удалить</button>
      </div>
      <p v-if="!store.items.length" class="empty">Игроков пока нет</p>

      <form class="row add" @submit.prevent="add">
        <MediaPicker v-model="newPhoto" compact type="image" />
        <input v-model="newColor" type="color" class="color" aria-label="Цвет нового игрока" />
        <input v-model="newName" class="input" placeholder="Имя нового игрока" />
        <input v-model.number="newScore" class="input score" type="number" step="100" title="Стартовый балл" aria-label="Стартовый балл нового игрока" />
        <button class="btn btn-primary" :disabled="!newName.trim()">Добавить</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: -8px 0 18px;
}

.list {
  max-width: 640px;
}

.score {
  width: 110px;
  flex: none;
}

.item {
  margin-bottom: 10px;
}

.color {
  width: 40px;
  height: 36px;
  flex: none;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  cursor: pointer;
}

.add {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
</style>
