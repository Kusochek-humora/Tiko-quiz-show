<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type Game, type Media } from '@/api'
import { loadSession, subscribe } from '@/demo/bus'
import { toScreenSnapshot, type SessionState } from '@/demo/engine'
import BoardView from './BoardView.vue'
import PlayersBar from './PlayersBar.vue'
import QuestionStage from './QuestionStage.vue'

// Экран эфира. Только показывает состояние: ни кнопок, ни курсора.
// В демо состояние приходит от пульта через localStorage и BroadcastChannel.

const session = ref<SessionState | null>(loadSession())
const game = ref<Game | null>(null)
const media = ref<Media[]>([])
const now = ref(Date.now())

let unsubscribe: (() => void) | null = null
let ticker: number | undefined

async function loadStatic() {
  const s = session.value
  if (!s) {
    game.value = null
    return
  }
  if (game.value?.id !== s.gameId) game.value = await api.getGame(s.gameId)
  media.value = await api.listMedia()
}

let lastSessionId: string | null = null
function onChange(s: SessionState | null) {
  session.value = s
  if (s?.id !== lastSessionId) {
    lastSessionId = s?.id ?? null
    game.value = null
    loadStatic()
  }
}

onMounted(() => {
  onChange(session.value)
  unsubscribe = subscribe(onChange)
  ticker = window.setInterval(() => (now.value = Date.now()), 250)
})
onUnmounted(() => {
  unsubscribe?.()
  clearInterval(ticker)
})

const snap = computed(() => (session.value && game.value ? toScreenSnapshot(session.value, game.value, media.value) : null))

// Откуда разворачивать вопрос: смотрим, где на поле стояла нажатая ячейка.
// flush: 'pre' — колбэк срабатывает до обновления DOM, поле ещё на экране.
const origin = ref<Record<string, string> | null>(null)
watch(
  () => snap.value?.question?.id ?? null,
  (id) => {
    origin.value = null
    if (!id) return
    const cell = document.querySelector<HTMLElement>(`[data-cell="${id}"]`)
    const board = document.querySelector<HTMLElement>('[data-board]')
    if (!cell || !board) return
    const c = cell.getBoundingClientRect()
    const b = board.getBoundingClientRect()
    origin.value = {
      '--dx': `${c.left + c.width / 2 - (b.left + b.width / 2)}px`,
      '--dy': `${c.top + c.height / 2 - (b.top + b.height / 2)}px`,
      '--sx': String(c.width / b.width),
      '--sy': String(c.height / b.height),
    }
  },
  { flush: 'pre' },
)

const countdown = computed(() => {
  const end = snap.value?.timerEndsAt
  return end ? Math.max(0, Math.ceil((end - now.value) / 1000)) : null
})

const leaders = computed(() => {
  const list = [...(snap.value?.players ?? [])].sort((a, b) => b.score - a.score)
  return list
})
</script>

<template>
  <div class="screen">
    <div v-if="!snap || snap.status === 'idle'" class="center">
      <h1 class="logo">Своя игра</h1>
      <p class="sub">{{ snap ? 'Скоро начнём' : 'Ожидание запуска игры' }}</p>
    </div>

    <template v-else>
      <main class="main">
        <div v-if="snap.status === 'intro'" class="center">
          <h1 class="logo">Своя игра</h1>
          <p v-if="snap.hostName" class="sub">Ведущий: {{ snap.hostName }}</p>
        </div>

        <div v-else-if="snap.status === 'round_intro' && snap.round" :key="snap.round.index" class="center">
          <p class="sub">Раунд {{ snap.round.index + 1 }} из {{ snap.round.total }}</p>
          <h1 class="logo">{{ snap.round.title }}</h1>
          <p v-if="snap.round.type === 'final'" class="sub gold">Супер-игра</p>
          <p v-if="snap.round.description" class="sub">{{ snap.round.description }}</p>
        </div>

        <BoardView v-else-if="snap.status === 'board' && snap.board" :board="snap.board" />

        <QuestionStage v-else-if="snap.question" :key="snap.question.id" :style="origin ?? undefined" :q="snap.question" :revealed="snap.status === 'answer_revealed'" :countdown="countdown" />

        <div v-else-if="snap.status === 'finished'" class="center">
          <p class="sub">Игра окончена</p>
          <h1 class="logo">{{ leaders[0]?.name }}</h1>
          <p class="sub gold">{{ leaders[0]?.score }} баллов</p>
        </div>
      </main>

      <footer class="foot">
        <PlayersBar :players="snap.players" :active-id="snap.status === 'finished' ? leaders[0]?.id ?? null : snap.activeId" />
      </footer>
    </template>
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  padding: 1.6vw 2vw;
  gap: 1.6vw;
  overflow: hidden;
  background: radial-gradient(circle at 50% 0%, #1b3a9c 0%, #0b1434 65%, #060b20 100%);
  color: #fff;
  cursor: none;
  user-select: none;
}

.main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.foot {
  flex: none;
  padding-top: 0.8vw;
}

.center {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1vw;
  text-align: center;
}

.logo {
  margin: 0;
  color: #ffd84a;
  font-size: 8vw;
  font-weight: 900;
  letter-spacing: 0.1vw;
  line-height: 1;
  text-shadow: 0.3vw 0.3vw 0 rgba(0, 0, 0, 0.4);
  text-transform: uppercase;
}

.sub {
  margin: 0;
  color: #cfd8ff;
  font-size: 2.6vw;
  animation: fade-up 0.6s 0.35s both;
}

/* Заставки: заголовок «влетает» с лёгким перелётом */
.logo {
  animation: logo-in 0.9s cubic-bezier(0.2, 1.3, 0.3, 1) both;
}

@keyframes logo-in {
  from {
    opacity: 0;
    transform: scale(0.4) rotate(-3deg);
    filter: blur(1vw);
  }
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(1.5vw);
  }
}

.sub.gold {
  color: #ffd84a;
  font-weight: 700;
}
</style>
