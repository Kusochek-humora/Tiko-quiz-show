<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isMock, type QuizSnapshot } from '@/api'
import { openLive, type LiveState } from '@/sessions/live'
import BoardView from './BoardView.vue'
import PlayersBar from './PlayersBar.vue'
import QuestionStage from './QuestionStage.vue'

// Экран эфира. Только показывает состояние: ни кнопок, ни курсора.
// Адрес: #/screen/<id сессии>?token=<токен экрана>. В демо-режиме id и токен не нужны.

const route = useRoute()

const snap = ref<QuizSnapshot | null>(null)
const live = ref<LiveState>('connecting')
const closedReason = ref('')
const now = ref(Date.now())
// Разница между часами сервера и этого компьютера: нужна, чтобы таймер шёл точно
const offset = ref(0)

let close: (() => void) | null = null
let ticker: number | undefined

// По WebSocket и REST снимки могут прийти вперемешку: показываем только не старее текущего
function onSnapshot(s: QuizSnapshot) {
  if (snap.value && snap.value.sessionId === s.sessionId && s.version < snap.value.version) return
  snap.value = s
  offset.value = Date.parse(s.serverTime) - Date.now()
}

// Первый клик по странице разрешает браузеру запускать видео и аудио со звуком
function unlockMedia() {
  document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => {
    el.muted = false
    void el.play().catch(() => {})
  })
}

const sessionId = computed(() => String(route.params.sessionId ?? ''))
const token = computed(() => String(route.query.token ?? ''))
const missingLink = computed(() => !isMock && (!sessionId.value || !token.value))

function connect() {
  close?.()
  closedReason.value = ''
  if (missingLink.value) return
  close = openLive(
    { sessionId: sessionId.value, role: 'screen', token: token.value },
    {
      onSnapshot,
      onState: (s) => (live.value = s),
      onClosed: (reason) => (closedReason.value = reason),
    },
  )
}

onMounted(() => {
  connect()
  ticker = window.setInterval(() => (now.value = Date.now()), 250)
  window.addEventListener('click', unlockMedia)
})
onUnmounted(() => {
  close?.()
  clearInterval(ticker)
  window.removeEventListener('click', unlockMedia)
})
watch([sessionId, token], connect)

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

// Остаток времени с поправкой на часы сервера
const countdown = computed(() => {
  const end = snap.value?.timerEndsAt
  return end ? Math.max(0, Math.ceil((Date.parse(end) - (now.value + offset.value)) / 1000)) : null
})

const leaders = computed(() => [...(snap.value?.players ?? [])].sort((a, b) => b.score - a.score))
</script>

<template>
  <div class="screen">
    <div v-if="missingLink" class="center">
      <h1 class="logo">Своя игра</h1>
      <p class="sub">Откройте ссылку экрана с пульта ведущего: в ней должны быть номер сессии и токен</p>
    </div>

    <div v-else-if="closedReason" class="center">
      <h1 class="logo">Своя игра</h1>
      <p class="sub">{{ closedReason }}</p>
    </div>

    <div v-else-if="!snap || snap.status === 'idle'" class="center">
      <h1 class="logo">Своя игра</h1>
      <p class="sub">{{ snap ? 'Скоро начнём' : 'Ожидание запуска игры' }}</p>
    </div>

    <template v-else>
      <main class="main">
        <div v-if="snap.status === 'intro'" class="center">
          <h1 class="logo">Своя игра</h1>
          <p v-if="snap.hostName" class="sub">Ведущий: {{ snap.hostName }}</p>
        </div>

        <div v-else-if="snap.status === 'round_intro' && snap.round" :key="snap.round.order" class="center">
          <p class="sub">Раунд {{ snap.round.order + 1 }} из {{ snap.round.total }}</p>
          <h1 class="logo">{{ snap.round.title }}</h1>
          <p v-if="snap.round.type === 'final'" class="sub gold">Супер-игра</p>
          <p v-if="snap.round.description" class="sub">{{ snap.round.description }}</p>
        </div>

        <BoardView v-else-if="snap.status === 'board' && snap.board" :board="snap.board" />

        <QuestionStage
          v-else-if="snap.question"
          :key="snap.question.id"
          :style="origin ?? undefined"
          :q="snap.question"
          :media="snap.media"
          :players="snap.players"
          :revealed="snap.status === 'answer_revealed'"
          :countdown="countdown"
        />

        <div v-else-if="snap.status === 'finished'" class="center">
          <p class="sub">Игра окончена</p>
          <h1 class="logo">{{ leaders[0]?.name }}</h1>
          <p class="sub gold">{{ leaders[0]?.score }} баллов</p>
        </div>
      </main>

      <footer class="foot">
        <PlayersBar
          :players="snap.players"
          :active-id="snap.status === 'finished' ? (leaders[0]?.id ?? null) : snap.activeParticipantId"
          :finalists="snap.finalists"
        />
      </footer>
    </template>

    <!-- Если связь пропала, показываем маленькую метку: картинка при этом остаётся на экране -->
    <div v-if="live === 'lost' && !closedReason" class="lost">Нет связи, переподключаемся…</div>
  </div>
</template>

<style scoped>
.screen {
  position: relative;
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

.sub.gold {
  color: #ffd84a;
  font-weight: 700;
}

.lost {
  position: absolute;
  top: 0.8vw;
  right: 1vw;
  padding: 0.3vw 1vw;
  border-radius: 99vw;
  background: rgba(229, 84, 79, 0.85);
  font-size: 1.1vw;
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
</style>
