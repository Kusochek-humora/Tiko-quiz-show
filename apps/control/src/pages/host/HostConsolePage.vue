<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type Game, type GameSummary, type Media, type Participant, type Question } from '@/api'
import { KIND_LABELS, KIND_SHORT } from '@/kinds'
import { useAuthStore } from '@/stores/auth'
import { loadSession, saveSession } from '@/demo/bus'
import {
  EngineError,
  STATUS_LABELS,
  addScore,
  applyCommand,
  createSession,
  effectivePrice,
  findQuestion,
  playerScore,
  roundOf,
  setScore,
  sortedRounds,
  voidScore,
  type Command,
  type ScoreKind,
  type SessionState,
} from '@/demo/engine'

// Пульт ведущего. Пока нет бэка, управляет экраном через демо-движок (src/demo).

const auth = useAuthStore()
const router = useRouter()

const session = ref<SessionState | null>(loadSession())
const game = ref<Game | null>(null)
const media = ref<Media[]>([])
const games = ref<GameSummary[]>([])
const participants = ref<Participant[]>([])
const error = ref('')
const reason = ref('')

// Настройка новой сессии
const selectedGameId = ref('')
const hostName = ref('')
const picked = reactive<Record<string, { on: boolean; score: number }>>({})
const custom = reactive<Record<string, number | null>>({})

onMounted(async () => {
  try {
    const [g, p, m] = await Promise.all([api.listGames(), api.listParticipants(), api.listMedia()])
    games.value = g
    participants.value = p
    media.value = m
    selectedGameId.value = g[0]?.id ?? ''
    p.forEach((x) => (picked[x.id] = { on: true, score: x.defaultStartScore }))
    if (session.value) game.value = await api.getGame(session.value.gameId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить данные'
  }
})

const screenUrl = computed(() => `${location.href.split('#')[0]}#/screen`)

async function startSession() {
  error.value = ''
  const chosen = participants.value.filter((p) => picked[p.id]?.on)
  if (!selectedGameId.value) return (error.value = 'Выберите игру')
  if (!chosen.length) return (error.value = 'Выберите хотя бы одного игрока')
  try {
    game.value = await api.getGame(selectedGameId.value)
    media.value = await api.listMedia()
    const players = chosen.map((p) => ({ id: p.id, name: p.name, color: p.color, photoMediaId: p.photoMediaId, startScore: Math.trunc(Number(picked[p.id].score) || 0) }))
    session.value = createSession(game.value, players, hostName.value.trim())
    saveSession(session.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось начать сессию'
  }
}

function resetSession() {
  if (!confirm('Завершить сессию и сбросить все очки?')) return
  session.value = null
  game.value = null
  saveSession(null)
}

// Применить изменение состояния: сохранить и разослать экрану
function run(fn: (s: SessionState, g: Game) => SessionState) {
  if (!session.value || !game.value) return
  try {
    session.value = fn(session.value, game.value)
    saveSession(session.value)
    error.value = ''
  } catch (e) {
    if (e instanceof EngineError) error.value = e.message
    else throw e
  }
}

const cmd = (c: Command) => run((s, g) => applyCommand(s, c, g))

const round = computed(() => (session.value && game.value ? roundOf(session.value, game.value) : null))
const rounds = computed(() => (game.value ? sortedRounds(game.value) : []))

// Завершение игры показывает на экране итоги, поэтому спрашиваем подтверждение
// (если нажали по ошибке, вернуться можно кнопкой «← Назад»)
function finishGame() {
  if (!confirm('Точно завершить игру? На экране появится победитель.')) return
  cmd({ type: 'finish' })
}

// Переход к раунду. С заставки (первый раунд) подтверждение не нужно, дальше спрашиваем,
// чтобы случайное нажатие не переключило эфир.
function goRound(index: number) {
  const title = rounds.value[index]?.title ?? ''
  if (session.value?.status !== 'intro' && !confirm(`Перейти к раунду «${title}»? На экране появится заставка раунда.`)) return
  cmd({ type: 'goto_round', index })
}
const question = computed<Question | null>(() =>
  session.value?.currentQuestionId && game.value ? findQuestion(game.value, session.value.currentQuestionId) : null,
)
const price = computed(() => (question.value && session.value ? effectivePrice(question.value, session.value) : 0))
const inQuestion = computed(() => !!question.value && ['question_shown', 'timer_running', 'answer_revealed'].includes(session.value?.status ?? ''))
const noPenalty = computed(() => !!question.value?.settings.noPenalty)

const blockText = (b: { type: string; text?: string }) => (b.type === 'text' ? b.text : `[${b.type}]`)
const playerName = (id: string) => session.value?.players.find((p) => p.id === id)?.name ?? '—'

function award(playerId: string, kind: ScoreKind, delta: number) {
  run((s) => addScore(s, { participantId: playerId, kind, delta, reason: reason.value, questionId: question.value?.id ?? null }))
}

function applyCustom(playerId: string) {
  const delta = Math.trunc(Number(custom[playerId]) || 0)
  award(playerId, delta > 0 ? 'bonus' : 'penalty', delta)
  custom[playerId] = null
}

function editTotal(playerId: string) {
  const current = playerScore(session.value!, playerId)
  const raw = window.prompt('Новый счёт игрока', String(current))
  if (raw === null) return
  const total = Number(raw)
  run((s) => setScore(s, playerId, total, reason.value))
}

const toggleActive = (id: string) => cmd({ type: 'set_active', participantId: session.value?.activeId === id ? null : id })

const kindLabel = (k: Question['kind']) => KIND_LABELS[k]
const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="host">
    <header class="top">
      <h1>Пульт ведущего</h1>
      <div class="row">
        <RouterLink v-if="auth.user?.role === 'admin'" class="btn btn-sm" to="/admin/games">В админку</RouterLink>
        <button class="btn btn-sm" @click="logout">Выйти</button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <!-- Настройка новой сессии -->
    <section v-if="!session" class="card setup">
      <h2>Новая сессия</h2>
      <div class="field">
        <label>Игра</label>
        <select v-model="selectedGameId" class="select">
          <option v-for="g in games" :key="g.id" :value="g.id">{{ g.title }} ({{ g.questionsCount }} вопр.)</option>
        </select>
      </div>
      <div class="field">
        <label>Имя ведущего (показывается на экране)</label>
        <input v-model="hostName" class="input" />
      </div>
      <div class="field">
        <label>Игроки и стартовые баллы</label>
        <div v-for="p in participants" :key="p.id" class="row pick">
          <input v-model="picked[p.id].on" type="checkbox" />
          <span class="dot" :style="{ background: p.color }"></span>
          <span class="grow">{{ p.name }}</span>
          <input v-model.number="picked[p.id].score" class="input score" type="number" step="100" :disabled="!picked[p.id].on" />
        </div>
        <p v-if="!participants.length" class="muted">Сначала добавьте игроков в разделе «Игроки».</p>
      </div>
      <button class="btn btn-primary" :disabled="!games.length" @click="startSession">Начать сессию</button>
    </section>

    <!-- Работа с эфиром -->
    <template v-else-if="game">
      <section class="card bar">
        <div>
          <span class="badge">{{ STATUS_LABELS[session.status] }}</span>
          <strong class="gname">{{ game.title }}</strong>
          <span v-if="round" class="muted"> · {{ round.title }}</span>
        </div>
        <div class="row">
          <a class="btn btn-sm btn-primary" :href="screenUrl" target="_blank" rel="noopener">Открыть экран эфира ↗</a>
          <button class="btn btn-sm" :disabled="!session.history.length" @click="cmd({ type: 'back' })">← Назад</button>
          <button class="btn btn-sm btn-danger" @click="resetSession">Сбросить сессию</button>
        </div>
      </section>

      <div class="cols">
        <div class="left">
          <!-- Основные кнопки -->
          <section class="card">
            <div class="row wrap">
              <button v-if="session.status === 'idle'" class="btn btn-primary big" @click="cmd({ type: 'start' })">▶ Начать шоу</button>
              <button v-if="session.status === 'round_intro'" class="btn btn-primary big" @click="cmd({ type: 'show_board' })">Показать поле</button>
              <template v-if="session.status === 'question_shown' || session.status === 'timer_running'">
                <button class="btn" :disabled="!question?.timeLimitSec || session.status === 'timer_running'" @click="cmd({ type: 'start_timer' })">
                  ⏱ Таймер{{ question?.timeLimitSec ? ` (${question.timeLimitSec} с)` : '' }}
                </button>
                <button v-if="question?.kind === 'hints'" class="btn" @click="cmd({ type: 'reveal_hint' })">💡 Подсказка</button>
                <button class="btn btn-primary big" @click="cmd({ type: 'reveal_answer' })">Показать ответ</button>
              </template>
              <button v-if="session.status === 'answer_revealed'" class="btn btn-primary big" @click="cmd({ type: 'show_board' })">Вернуться к полю</button>
              <button v-if="session.status !== 'idle' && session.status !== 'finished'" class="btn btn-danger" @click="finishGame">Завершить игру</button>
              <span v-if="session.status === 'finished'" class="muted">Игра завершена. Можно сбросить сессию и начать новую.</span>
            </div>
          </section>

          <!-- Выбор раунда: можно открыть любой, в том числе предыдущий -->
          <section v-if="['intro', 'round_intro', 'board'].includes(session.status)" class="card">
            <h2>Раунды</h2>
            <div class="row wrap">
              <button
                v-for="(r, i) in rounds"
                :key="r.id"
                class="btn"
                :class="{ 'btn-primary': i === session.roundIndex }"
                :disabled="i === session.roundIndex"
                @click="goRound(i)"
              >
                {{ i + 1 }}. {{ r.title }}<small v-if="r.type === 'final'"> · финал</small>
              </button>
            </div>
            <p class="muted hint">Любой раунд можно открыть повторно, сыгранные вопросы остаются отмеченными. Переключение просит подтверждение.</p>
          </section>

          <!-- Поле для ведущего -->
          <section v-if="session.status === 'board' && round" class="card">
            <h2>{{ round.title }}</h2>
            <div class="hboard">
              <div v-for="t in [...round.themes].sort((a, b) => a.order - b.order)" :key="t.id" class="hrow">
                <div class="htheme">{{ t.title }}</div>
                <button
                  v-for="q in [...t.questions].sort((a, b) => a.price - b.price)"
                  :key="q.id"
                  class="hcell"
                  :disabled="session.played.includes(q.id)"
                  :title="`${kindLabel(q.kind)}`"
                  @click="cmd({ type: 'open_question', questionId: q.id })"
                >
                  <span>{{ q.price }}</span>
                  <small v-if="KIND_SHORT[q.kind]">{{ KIND_SHORT[q.kind] }}</small>
                </button>
              </div>
            </div>
          </section>

          <!-- Текущий вопрос -->
          <section v-if="inQuestion && question" class="card">
            <div class="row-between">
              <h2>Вопрос за {{ price }}</h2>
              <span class="badge">{{ kindLabel(question.kind) }}</span>
            </div>
            <p class="q">{{ question.content.map(blockText).join(' ') }}</p>

            <div v-if="question.kind === 'options'" class="opts">
              <div v-for="o in question.settings.options" :key="o.id" :class="{ ok: o.isCorrect }">{{ o.isCorrect ? '✓' : '·' }} {{ o.text }}</div>
            </div>
            <div v-else-if="question.kind === 'hints'" class="opts">
              <div v-for="(h, i) in question.settings.hints" :key="i" :class="{ ok: Number(i) < session.hintsOpened }">{{ Number(i) + 1 }}. {{ h.text }}{{ Number(i) < session.hintsOpened ? ' (открыта)' : '' }}</div>
            </div>
            <div v-else-if="question.kind === 'true_false'" class="opts"><div class="ok">Верный ответ: {{ question.settings.correct ? 'верю' : 'не верю' }}</div></div>

            <div class="ans">
              <span class="label">Ответ ведущему</span>
              {{ question.answerContent.map(blockText).join(' ') }}
            </div>
            <p v-if="question.comment" class="muted">Заметка: {{ question.comment }}</p>
            <p v-if="noPenalty" class="muted">Без риска: штраф за неверный ответ не снимается.</p>
          </section>
        </div>

        <!-- Игроки и очки -->
        <aside class="right">
          <section class="card">
            <h2>Игроки</h2>
            <div class="field">
              <label>Комментарий к начислению (необязательно)</label>
              <input v-model="reason" class="input" placeholder="например, рассмешил зал" />
            </div>

            <div v-for="p in session.players" :key="p.id" class="player" :class="{ active: p.id === session.activeId }">
              <div class="row-between">
                <button class="pname" :title="'Отметить отвечающего'" @click="toggleActive(p.id)">
                  <span class="dot" :style="{ background: p.color }"></span>{{ p.name }}
                  <small v-if="p.id === session.activeId" class="muted">отвечает</small>
                </button>
                <button class="pscore" title="Изменить счёт вручную" @click="editTotal(p.id)">{{ playerScore(session, p.id) }}</button>
              </div>
              <div class="row wrap">
                <button class="btn btn-sm ok-btn" :disabled="!inQuestion" @click="award(p.id, 'correct', price)">✓ +{{ price }}</button>
                <button class="btn btn-sm bad-btn" :disabled="!inQuestion || noPenalty || price === 0" @click="award(p.id, 'wrong', -price)">✗ −{{ price }}</button>
                <input v-model.number="custom[p.id]" class="input mini" type="number" step="50" placeholder="±баллы" @keydown.enter="applyCustom(p.id)" />
                <button class="btn btn-sm" :disabled="!custom[p.id]" @click="applyCustom(p.id)">OK</button>
              </div>
            </div>
          </section>

          <section class="card">
            <h2>Журнал очков</h2>
            <p v-if="!session.events.length" class="muted">Пока пусто</p>
            <div v-for="e in [...session.events].reverse()" :key="e.id" class="ev" :class="{ voided: e.voided }">
              <span>
                <b>{{ playerName(e.participantId) }}</b> {{ sign(e.delta) }}
                <small class="muted">{{ e.reason || e.kind }}</small>
              </span>
              <button v-if="!e.voided" class="btn btn-sm btn-icon" title="Отменить начисление" @click="run((s) => voidScore(s, e.id))">↶</button>
              <small v-else class="muted">отменено</small>
            </div>
          </section>
        </aside>
      </div>
    </template>

    <p v-else class="muted">Загрузка…</p>
  </div>
</template>

<style scoped>
.host {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 24px 40px;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card {
  margin-bottom: 14px;
}

.card h2 {
  margin-bottom: 12px;
}

.setup {
  max-width: 560px;
}

.pick {
  margin-bottom: 8px;
}

.grow {
  flex: 1;
}

.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  flex: none;
  margin-right: 6px;
  border-radius: 50%;
}

.score {
  width: 110px;
}

.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.badge {
  display: inline-block;
  margin-right: 10px;
  padding: 2px 10px;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  font-size: 13px;
}

.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
}

.wrap {
  flex-wrap: wrap;
}

.hint {
  margin: 10px 0 0;
  font-size: 13px;
}

.big {
  padding: 12px 22px;
  font-size: 16px;
}

.hboard {
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-x: auto;
}

.hrow {
  display: flex;
  gap: 5px;
}

.htheme {
  display: flex;
  flex: none;
  align-items: center;
  width: 190px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #1b3a94;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
}

.hcell {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 70px;
  height: 52px;
  border: 1px solid #3956a8;
  border-radius: 6px;
  background: #2349b8;
  color: var(--gold);
  font: 700 18px/1 system-ui, sans-serif;
  cursor: pointer;
}

.hcell small {
  color: #b9c6ee;
  font: 500 10px/1 system-ui, sans-serif;
  text-transform: uppercase;
}

.hcell:hover:not(:disabled) {
  background: #3461e0;
}

.hcell:disabled {
  border-color: var(--line);
  background: transparent;
  color: transparent;
  cursor: default;
}

.hcell:disabled small {
  color: transparent;
}

.q {
  margin: 0 0 12px;
  font-size: 18px;
}

.opts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  color: var(--muted);
}

.opts .ok,
.ok {
  color: var(--ok);
}

.ans {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(52, 195, 143, 0.12);
  font-size: 17px;
}

.label {
  display: block;
  color: var(--ok);
  font-size: 12px;
  text-transform: uppercase;
}

.player {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.player.active {
  border-color: var(--ok);
  background: rgba(52, 195, 143, 0.08);
}

.pname {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.pscore {
  padding: 2px 10px;
  border: 1px dashed transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--gold);
  font: 700 22px/1.2 system-ui, sans-serif;
  cursor: pointer;
}

.pscore:hover {
  border-color: var(--line);
}

.ok-btn:not(:disabled) {
  border-color: var(--ok);
  color: var(--ok);
}

.bad-btn:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}

.mini {
  width: 90px;
  padding: 4px 8px;
}

.ev {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}

.ev.voided span {
  text-decoration: line-through;
  opacity: 0.5;
}

@media (max-width: 980px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
</style>
