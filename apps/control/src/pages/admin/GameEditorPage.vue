<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Question, RoundType, Theme } from '@/api'
import { KIND_LABELS, KIND_SHORT, questionSummary } from '@/kinds'
import { useGamesStore } from '@/stores/games'
import QuestionModal from '@/components/QuestionModal.vue'

const route = useRoute()
const store = useGamesStore()

const error = ref('')
const loading = ref(true)
const activeRoundId = ref<string | null>(null)
const gameTitle = ref('')
const roundTitle = ref('')

const game = computed(() => store.game)
const round = computed(() => game.value?.rounds.find((r) => r.id === activeRoundId.value) ?? null)

interface Editing {
  theme: Theme
  question: Question | null
}
const editing = ref<Editing | null>(null)

onMounted(async () => {
  try {
    await store.load(route.params.id as string)
    gameTitle.value = store.game!.title
    activeRoundId.value = store.game!.rounds[0]?.id ?? null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить игру'
  } finally {
    loading.value = false
  }
})

watch(round, (r) => {
  roundTitle.value = r?.title ?? ''
}, { immediate: true })

// Если активный раунд исчез (удалили), переключаемся на первый
watch(game, (g) => {
  if (g && !g.rounds.some((r) => r.id === activeRoundId.value)) activeRoundId.value = g.rounds[0]?.id ?? null
})

async function run(fn: () => Promise<unknown>) {
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка'
  }
}

const saveGameTitle = () => {
  const t = gameTitle.value.trim()
  if (!t) return (gameTitle.value = game.value!.title)
  if (t !== game.value!.title) run(() => store.renameGame(t))
}

const saveRoundTitle = () => {
  if (!round.value) return
  const t = roundTitle.value.trim()
  if (!t) return (roundTitle.value = round.value.title)
  if (t !== round.value.title) run(() => store.renameRound(round.value!.id, t))
}

async function addRound() {
  const n = (game.value?.rounds.length ?? 0) + 1
  await run(() => store.addRound(`Раунд ${n}`))
  activeRoundId.value = game.value!.rounds.at(-1)?.id ?? activeRoundId.value
}

function removeRound() {
  if (!round.value || !confirm(`Удалить «${round.value.title}» со всеми темами и вопросами?`)) return
  run(() => store.deleteRound(round.value!.id))
}

const addTheme = () => round.value && run(() => store.addTheme(round.value!.id, 'Новая тема'))

function saveThemeTitle(theme: Theme, e: Event) {
  const input = e.target as HTMLInputElement
  const t = input.value.trim()
  if (!t) {
    input.value = theme.title
    return
  }
  if (t !== theme.title) run(() => store.renameTheme(theme.id, t))
}

function removeTheme(theme: Theme) {
  if (!confirm(`Удалить тему «${theme.title}» со всеми вопросами?`)) return
  run(() => store.deleteTheme(theme.id))
}

function moveTheme(index: number, dir: -1 | 1) {
  if (!round.value) return
  const ids = round.value.themes.map((t) => t.id)
  const j = index + dir
  if (j < 0 || j >= ids.length) return
  ;[ids[index], ids[j]] = [ids[j], ids[index]]
  run(() => store.reorderThemes(round.value!.id, ids))
}

function moveRound(dir: -1 | 1) {
  if (!game.value || !round.value) return
  const ids = game.value.rounds.map((r) => r.id)
  const i = ids.indexOf(round.value.id)
  const j = i + dir
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  run(() => store.reorderRounds(ids))
}

// Тип раунда: обычный или финал (супер-игра)
const finalistsMode = computed(() => (typeof round.value?.settings.finalists === 'number' ? 'top' : 'leader'))

function setRoundType(e: Event) {
  const type = (e.target as HTMLSelectElement).value as RoundType
  const settings = type === 'final' ? { finalists: 'leader', mode: 'single_question' } : {}
  run(() => store.updateRound(round.value!.id, { type, settings }))
}

function patchFinal(patch: Record<string, unknown>) {
  run(() => store.updateRound(round.value!.id, { settings: { ...round.value!.settings, ...patch } }))
}

function setFinalistsMode(e: Event) {
  const mode = (e.target as HTMLSelectElement).value
  patchFinal({ finalists: mode === 'top' ? 2 : 'leader' })
}

function setFinalistsTop(e: Event) {
  const n = Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value) || 1))
  patchFinal({ finalists: n })
}

const nextPrice = (theme: Theme) => (theme.questions.length ? Math.max(...theme.questions.map((q) => q.price)) + 100 : 100)

const openQuestion = (theme: Theme, question: Question | null) => (editing.value = { theme, question })
</script>

<template>
  <div>
    <RouterLink to="/admin/games" class="muted back">← Все игры</RouterLink>

    <p v-if="loading" class="muted">Загрузка…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="game">
      <div class="page-head">
        <input v-model="gameTitle" class="input title-input" aria-label="Название игры" @blur="saveGameTitle" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      </div>

      <!-- Раунды -->
      <div class="tabs">
        <button v-for="r in game.rounds" :key="r.id" class="tab" :class="{ on: r.id === activeRoundId }" @click="activeRoundId = r.id">{{ r.title }}</button>
        <button class="tab add" @click="addRound">+ Раунд</button>
      </div>

      <p v-if="!game.rounds.length" class="empty">В игре пока нет раундов. Добавьте первый.</p>

      <section v-if="round" class="card">
        <div class="row-between round-head">
          <div class="row">
            <input v-model="roundTitle" class="input" style="width: 240px" aria-label="Название раунда" @blur="saveRoundTitle" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <button class="btn btn-sm btn-icon" title="Раунд раньше" @click="moveRound(-1)">←</button>
            <button class="btn btn-sm btn-icon" title="Раунд позже" @click="moveRound(1)">→</button>
          </div>
          <div class="row">
            <select class="select type-select" :value="round.type" aria-label="Тип раунда" @change="setRoundType">
              <option value="standard">Обычный раунд</option>
              <option value="final">Финал (супер-игра)</option>
            </select>
            <button class="btn btn-sm btn-danger" @click="removeRound">Удалить раунд</button>
          </div>
        </div>

        <div v-if="round.type === 'final'" class="final row">
          <label class="muted">Финалисты</label>
          <select class="select small" :value="finalistsMode" @change="setFinalistsMode">
            <option value="leader">Лидер по очкам</option>
            <option value="top">Топ N</option>
          </select>
          <input v-if="finalistsMode === 'top'" class="input small" type="number" min="1" :value="round.settings.finalists" aria-label="Сколько игроков в финале" @change="setFinalistsTop" />
          <label class="muted">Режим</label>
          <select class="select small" :value="round.settings.mode" @change="patchFinal({ mode: ($event.target as HTMLSelectElement).value })">
            <option value="single_question">Один вопрос</option>
            <option value="elimination">Вычёркивание тем</option>
          </select>
        </div>

        <!-- Сетка как на экране эфира: строки — темы, ячейки — цены -->
        <div class="board">
          <div v-for="(theme, i) in round.themes" :key="theme.id" class="theme-row">
            <div class="theme-cell">
              <input class="theme-input" :value="theme.title" aria-label="Название темы" @blur="saveThemeTitle(theme, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
              <div class="theme-tools">
                <button class="btn btn-sm btn-icon" title="Выше" :disabled="i === 0" @click="moveTheme(i, -1)">↑</button>
                <button class="btn btn-sm btn-icon" title="Ниже" :disabled="i === round.themes.length - 1" @click="moveTheme(i, 1)">↓</button>
                <button class="btn btn-sm btn-icon btn-danger" title="Удалить тему" @click="removeTheme(theme)">✕</button>
              </div>
            </div>
            <button v-for="q in theme.questions" :key="q.id" class="price-cell" :title="`${KIND_LABELS[q.kind]}: ${questionSummary(q)}`" @click="openQuestion(theme, q)">
              <span>{{ q.price }}</span>
              <small v-if="KIND_SHORT[q.kind]" class="kind">{{ KIND_SHORT[q.kind] }}</small>
            </button>
            <button class="price-cell add" title="Добавить вопрос" @click="openQuestion(theme, null)">+</button>
          </div>
        </div>

        <p v-if="!round.themes.length" class="empty">В раунде нет тем.</p>
        <button class="btn" style="margin-top: 14px" @click="addTheme">+ Тема</button>
      </section>
    </template>

    <QuestionModal
      v-if="editing"
      :key="editing.question?.id ?? `new-${editing.theme.id}`"
      :theme-id="editing.theme.id"
      :theme-title="editing.theme.title"
      :question="editing.question"
      :default-price="nextPrice(editing.theme)"
      @close="editing = null"
    />
  </div>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 12px;
}

.title-input {
  max-width: 520px;
  border-color: transparent;
  background: transparent;
  font-size: 24px;
  font-weight: 600;
}

.title-input:hover,
.title-input:focus {
  border-color: var(--line);
  background: var(--bg);
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.tab {
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}

.tab.on {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.tab.add {
  border-style: dashed;
}

.round-head {
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.board {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-x: auto;
}

.theme-row {
  display: flex;
  gap: 6px;
}

.theme-cell {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  width: 280px;
  padding: 8px;
  border: 1px solid #3956a8;
  border-radius: 6px;
  background: #1b3a94;
}

.theme-input {
  width: 100%;
  border: 0;
  background: transparent;
  color: #fff;
  font: inherit;
  font-weight: 600;
  text-transform: uppercase;
}

.theme-input:focus {
  outline: 1px solid #fff;
}

.theme-tools {
  display: flex;
  gap: 4px;
}

.price-cell {
  flex: none;
  width: 84px;
  border: 1px solid #3956a8;
  border-radius: 6px;
  background: #2349b8;
  color: var(--gold);
  font: 700 22px/1 system-ui, sans-serif;
  cursor: pointer;
}

.price-cell:hover {
  background: #3461e0;
}

.price-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.kind {
  color: #b9c6ee;
  font: 500 11px/1 system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.type-select {
  width: 190px;
}

.final {
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px dashed var(--gold);
  border-radius: 8px;
}

.small {
  width: auto;
  min-width: 80px;
}

.price-cell.add {
  border-style: dashed;
  background: transparent;
  color: var(--muted);
}

.price-cell.add:hover {
  color: var(--text);
  border-color: var(--accent);
}
</style>
