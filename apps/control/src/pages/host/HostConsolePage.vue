<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, isMock, type ContentBlock, type GameSummary, type Participant, type QuizTheme, type Round } from '@/api'
import { KIND_LABELS, KIND_SHORT } from '@/kinds'
import { STATUS_LABELS } from '@/demo/engine'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import KindControls from './KindControls.vue'

// Пульт ведущего. Все изменения идут через store сессии: на настоящем бэке это REST и WebSocket,
// в демо-режиме работает встроенный движок. Интерфейс в обоих случаях один и тот же.

const auth = useAuthStore()
const router = useRouter()
const store = useSessionStore()

const games = ref<GameSummary[]>([])
const participants = ref<Participant[]>([])
const loadError = ref('')
const reason = ref('')

// Настройка новой сессии
const selectedGameId = ref('')
const hostName = ref('')
const picked = reactive<Record<string, { on: boolean; score: number }>>({})
const custom = reactive<Record<string, number | null>>({})
const addId = ref('')
const finalists = reactive<Record<string, boolean>>({})

onMounted(async () => {
  try {
    const [g, p] = await Promise.all([api.listGames(), api.listParticipants()])
    games.value = g
    participants.value = p
    selectedGameId.value = g[0]?.id ?? ''
    p.forEach((x) => (picked[x.id] = { on: true, score: x.defaultStartScore }))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Не удалось загрузить данные'
  }
  await store.loadSessions()
  if (store.sessionId) await store.open(store.sessionId)
})

onUnmounted(() => store.disconnect())

// Список раундов игры для переключения (в снимке состояния есть только текущий раунд)
const rounds = ref<Round[]>([])
watch(
  () => store.gameId,
  async (id) => {
    rounds.value = []
    if (!id) return
    try {
      const game = await api.getGame(id)
      rounds.value = [...game.rounds].sort((a, b) => a.order - b.order)
    } catch {
      /* без списка остаётся кнопка «Следующий раунд» */
    }
  },
  { immediate: true },
)

const snap = computed(() => store.snap)
const status = computed(() => snap.value?.status)
const question = computed(() => snap.value?.question ?? null)
const round = computed(() => snap.value?.round ?? null)
const players = computed(() => snap.value?.players ?? [])
const activeId = computed(() => snap.value?.activeParticipantId ?? null)
const inQuestion = computed(() => ['question_shown', 'timer_running', 'answer_revealed'].includes(status.value ?? ''))
const playing = computed(() => inQuestion.value && question.value?.phase === 'play')
const pointsOk = computed(() => question.value?.pointsIfCorrect ?? question.value?.price ?? 0)
const pointsBad = computed(() => question.value?.pointsIfWrong ?? 0)
const isFinal = computed(() => round.value?.type === 'final')
const elimination = computed(() => isFinal.value && round.value?.settings?.mode === 'elimination')
const hasTimer = computed(() => !!question.value?.timeLimitSec)
const openSessions = computed(() => store.sessions.filter((s) => s.status !== 'finished'))

// Ссылка на экран эфира для этого же приложения (адрес с токеном сессии)
const screenUrl = computed(() => (store.sessionId ? `${location.href.split('#')[0]}#/screen/${store.sessionId}?token=${store.screenToken ?? ''}` : ''))
const copied = ref(false)
async function copyScreenUrl() {
  try {
    await navigator.clipboard.writeText(screenUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    window.prompt('Скопируйте ссылку экрана', screenUrl.value)
  }
}

const blocksText = (blocks?: ContentBlock[]) => (blocks ?? []).map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join(' ')
const playerName = (id: string) => players.value.find((p) => p.id === id)?.name ?? '—'
const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
const notInSession = computed(() => participants.value.filter((p) => !players.value.some((x) => x.id === p.id)))

// ----- действия -----
async function startSession() {
  const chosen = participants.value.filter((p) => picked[p.id]?.on)
  if (!selectedGameId.value) return (store.error = 'Выберите игру')
  if (!chosen.length) return (store.error = 'Выберите хотя бы одного игрока')
  await store.create(
    selectedGameId.value,
    chosen.map((p) => ({ id: p.id, startScore: Math.trunc(Number(picked[p.id].score) || 0), defaultStartScore: p.defaultStartScore })),
    hostName.value.trim(),
  )
}

function resetSession() {
  if (!confirm('Удалить сессию вместе с очками? Это нельзя отменить.')) return
  void store.remove()
}

function rotate() {
  if (!confirm('Перевыпустить ссылку экрана? Уже открытые экраны отключатся, нужно будет открыть новую ссылку.')) return
  void store.rotateToken()
}

// Завершение игры показывает на экране итоги, поэтому спрашиваем подтверждение
// (если нажали по ошибке, вернуться можно кнопкой «← Назад»)
function finishGame() {
  if (!confirm('Точно завершить игру? На экране появится победитель.')) return
  void store.command('finish')
}

function nextRound() {
  if (status.value !== 'intro' && !confirm('Перейти к следующему раунду? На экране появится заставка раунда.')) return
  void store.command('next_round')
}

// Переход к любому раунду, в том числе назад: сыгранные вопросы остаются сыгранными
function gotoRound(r: Round) {
  if (status.value !== 'intro' && !confirm(`Перейти к раунду «${r.title}»? На экране появится заставка раунда.`)) return
  void store.command('goto_round', { roundId: r.id })
}

function award(playerId: string, kind: 'correct' | 'wrong', delta: number) {
  void store.addScore(playerId, kind, delta, reason.value, question.value?.id ?? null)
}

function applyCustom(playerId: string) {
  const delta = Math.trunc(Number(custom[playerId]) || 0)
  if (!delta) return
  void store.addScore(playerId, delta > 0 ? 'bonus' : 'penalty', delta, reason.value, question.value?.id ?? null)
  custom[playerId] = null
}

function editTotal(playerId: string) {
  const current = players.value.find((p) => p.id === playerId)?.score ?? 0
  const raw = window.prompt('Новый счёт игрока', String(current))
  if (raw === null) return
  const total = Number(raw)
  if (!Number.isInteger(total)) return void (store.error = 'Счёт должен быть целым числом')
  void store.setScore(playerId, total, reason.value)
}

function editStart(playerId: string) {
  const raw = window.prompt('Стартовый балл игрока (прибавляется к начислениям)', '0')
  if (raw === null) return
  const startScore = Number(raw)
  if (!Number.isInteger(startScore)) return void (store.error = 'Стартовый балл должен быть целым числом')
  void store.patchPlayer(playerId, { startScore })
}

function movePlayer(index: number, dir: -1 | 1) {
  const j = index + dir
  if (j < 0 || j >= players.value.length) return
  void store.patchPlayer(players.value[index].id, { order: j })
}

function removePlayer(id: string) {
  if (confirm(`Убрать игрока «${playerName(id)}» из сессии? Его начисления останутся в журнале.`)) void store.removePlayer(id)
}

async function addPlayer() {
  if (!addId.value) return
  await store.addPlayer(addId.value)
  addId.value = ''
}

const toggleActive = (id: string) => store.command('set_active', { participantId: activeId.value === id ? null : id })

function pickFinalists() {
  const ids = Object.keys(finalists).filter((id) => finalists[id])
  if (!ids.length) return void (store.error = 'Отметьте хотя бы одного финалиста')
  void store.command('select_finalists', { participantIds: ids })
}

function eliminate(theme: QuizTheme) {
  if (theme.eliminated || !confirm(`Вычеркнуть тему «${theme.title}»?`)) return
  void store.command('eliminate_theme', { themeId: theme.id })
}

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
        <span v-if="store.sessionId" class="live" :class="store.live" :title="store.live === 'open' ? 'Связь есть' : 'Связь с сервером'">
          {{ store.live === 'open' ? '● на связи' : store.live === 'connecting' ? '○ подключение…' : '● нет связи' }}
        </span>
        <RouterLink v-if="auth.user?.role === 'admin'" class="btn btn-sm" to="/admin/games">В админку</RouterLink>
        <button class="btn btn-sm" @click="logout">Выйти</button>
      </div>
    </header>

    <p v-if="store.error || loadError" class="error">{{ store.error || loadError }}</p>

    <!-- Настройка новой сессии -->
    <template v-if="!snap">
      <section v-if="openSessions.length" class="card setup">
        <h2>Незавершённые сессии</h2>
        <div v-for="s in openSessions" :key="s.id" class="row pick">
          <span class="grow">{{ s.hostName || 'Без ведущего' }} · {{ STATUS_LABELS[s.status] }}</span>
          <button class="btn btn-sm btn-primary" @click="store.open(s.id)">Продолжить</button>
        </div>
      </section>

      <section class="card setup">
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
        <button class="btn btn-primary" :disabled="!games.length || store.busy" @click="startSession">Начать сессию</button>
      </section>
    </template>

    <!-- Работа с эфиром -->
    <template v-else>
      <section class="card bar">
        <div>
          <span class="badge">{{ STATUS_LABELS[snap.status] }}</span>
          <strong v-if="round">{{ round.title }}</strong>
          <span v-if="round" class="muted"> · раунд {{ round.order + 1 }} из {{ round.total }}</span>
        </div>
        <div class="row wrap">
          <a class="btn btn-sm btn-primary" :href="screenUrl" target="_blank" rel="noopener">Открыть экран эфира ↗</a>
          <button class="btn btn-sm" @click="copyScreenUrl">{{ copied ? 'Скопировано' : 'Копировать ссылку' }}</button>
          <button class="btn btn-sm" :disabled="!snap.canBack || store.busy" @click="store.command('back')">← Назад</button>
          <button v-if="!isMock" class="btn btn-sm" title="Старая ссылка экрана перестанет работать" @click="rotate">Новая ссылка</button>
          <button class="btn btn-sm btn-danger" @click="resetSession">Удалить сессию</button>
        </div>
      </section>

      <div class="cols">
        <div class="left">
          <!-- Основные кнопки -->
          <section class="card">
            <div class="row wrap">
              <button v-if="status === 'idle'" class="btn btn-primary big" :disabled="store.busy" @click="store.command('start')">▶ Начать шоу</button>
              <button v-if="status === 'round_intro'" class="btn btn-primary big" :disabled="store.busy" @click="store.command('show_board')">Показать поле</button>
              <template v-if="playing && status !== 'answer_revealed'">
                <button v-if="hasTimer" class="btn" :disabled="status === 'timer_running' || store.busy" @click="store.command('start_timer')">
                  ⏱ Таймер ({{ question?.timeLimitSec }} с)
                </button>
              </template>
              <button v-if="inQuestion && status !== 'answer_revealed' && playing" class="btn btn-primary big" :disabled="store.busy" @click="store.command('reveal_answer')">
                Показать ответ
              </button>
              <button v-if="status === 'answer_revealed'" class="btn btn-primary big" :disabled="store.busy" @click="store.command('show_board')">Вернуться к полю</button>
              <button v-if="status !== 'idle' && status !== 'finished'" class="btn btn-danger" :disabled="store.busy" @click="finishGame">Завершить игру</button>
              <span v-if="status === 'finished'" class="muted">Игра завершена. Удалите сессию и начните новую.</span>
            </div>
          </section>

          <!-- Раунды -->
          <section v-if="['intro', 'round_intro', 'board'].includes(status ?? '')" class="card">
            <h2>Раунды</h2>
            <div class="row wrap">
              <!-- Переход в любой раунд, в том числе назад -->
              <button
                v-for="r in rounds"
                :key="r.id"
                class="btn"
                :class="{ 'btn-primary': r.id === round?.id }"
                :disabled="r.id === round?.id || store.busy"
                @click="gotoRound(r)"
              >
                {{ r.order + 1 }}. {{ r.title }}<small v-if="r.type === 'final'"> · финал</small>
              </button>
              <button class="btn" :disabled="!snap.nextRoundAvailable || store.busy" @click="nextRound">Следующий раунд →</button>
            </div>
            <p class="muted hint">Любой раунд можно открыть повторно: сыгранные вопросы остаются отмеченными. Переключение просит подтверждение.</p>
          </section>

          <!-- Супер-игра: кто выходит в финал -->
          <section v-if="isFinal && ['round_intro', 'board'].includes(status ?? '')" class="card">
            <h2>Финалисты</h2>
            <p class="muted hint">
              Без выбора в финал выходят по правилу раунда.
              <template v-if="snap.suggestedFinalists?.length">Сейчас предлагаются: {{ snap.suggestedFinalists.map(playerName).join(', ') }}.</template>
            </p>
            <div class="row wrap">
              <label v-for="p in players" :key="p.id" class="check"><input v-model="finalists[p.id]" type="checkbox" /> {{ p.name }}</label>
            </div>
            <button class="btn btn-sm" style="margin-top: 8px" @click="pickFinalists">Выбрать финалистов</button>
            <p v-if="snap.finalists?.length" class="muted hint">В финале: {{ snap.finalists.map(playerName).join(', ') }}</p>
          </section>

          <!-- Поле для ведущего -->
          <section v-if="status === 'board' && snap.board && round" class="card">
            <h2>{{ round.title }}</h2>
            <p v-if="elimination" class="muted hint">Нажмите на название темы, чтобы её вычеркнуть. Когда останется одна, откройте её вопрос.</p>
            <div class="hboard">
              <div v-for="t in snap.board.themes" :key="t.id" class="hrow">
                <button class="htheme" :class="{ gone: t.eliminated, clickable: elimination }" :disabled="!elimination || t.eliminated" @click="eliminate(t)">{{ t.title }}</button>
                <button
                  v-for="c in t.cells"
                  :key="c.questionId"
                  class="hcell"
                  :disabled="c.played || t.eliminated || store.busy"
                  :title="c.question ? `${KIND_LABELS[c.question.kind]}: ${blocksText(c.question.content)}` : ''"
                  @click="store.command('open_question', { questionId: c.questionId })"
                >
                  <span>{{ c.price }}</span>
                  <small v-if="c.question && KIND_SHORT[c.question.kind]">{{ KIND_SHORT[c.question.kind] }}</small>
                </button>
              </div>
            </div>
          </section>

          <!-- Текущий вопрос -->
          <section v-if="inQuestion && question" class="card">
            <div class="row-between">
              <h2>{{ question.themeTitle }} · {{ question.price }}</h2>
              <span class="badge">{{ KIND_LABELS[question.kind] }}</span>
            </div>

            <KindControls :q="question" :players="players" />

            <p class="q">{{ blocksText(question.content) }}</p>

            <div v-if="question.kind === 'options'" class="opts">
              <div v-for="o in question.view.options" :key="o.id" :class="{ ok: o.isCorrect }">{{ o.isCorrect ? '✓' : '·' }} {{ o.text }}</div>
            </div>
            <div v-else-if="question.kind === 'true_false'" class="opts"><div class="ok">Верный ответ: {{ question.view.correct ? 'верю' : 'не верю' }}</div></div>

            <div class="ans">
              <span class="label">Ответ ведущему</span>
              {{ blocksText(question.answerContent) }}
            </div>
            <p v-if="question.comment" class="muted">Заметка: {{ question.comment }}</p>
            <p v-if="question.pointsIfWrong === 0" class="muted">Без риска: штраф за неверный ответ не снимается.</p>
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

            <div v-for="(p, i) in players" :key="p.id" class="player" :class="{ active: p.id === activeId }">
              <div class="row-between">
                <button class="pname" title="Отметить отвечающего" @click="toggleActive(p.id)">
                  <span class="dot" :style="{ background: p.color }"></span>{{ p.name }}
                  <small v-if="p.id === activeId" class="muted">отвечает</small>
                </button>
                <button class="pscore" title="Изменить счёт вручную" @click="editTotal(p.id)">{{ p.score }}</button>
              </div>
              <div class="row wrap">
                <button class="btn btn-sm ok-btn" :disabled="!playing || store.busy" @click="award(p.id, 'correct', pointsOk)">✓ +{{ pointsOk }}</button>
                <button class="btn btn-sm bad-btn" :disabled="!playing || pointsBad === 0 || store.busy" @click="award(p.id, 'wrong', pointsBad)">✗ {{ pointsBad }}</button>
                <input v-model.number="custom[p.id]" class="input mini" type="number" step="50" placeholder="±баллы" @keydown.enter="applyCustom(p.id)" />
                <button class="btn btn-sm" :disabled="!custom[p.id] || store.busy" @click="applyCustom(p.id)">OK</button>
              </div>
              <div class="row wrap tools">
                <button class="btn btn-sm btn-icon" :disabled="i === 0" title="Левее" @click="movePlayer(i, -1)">←</button>
                <button class="btn btn-sm btn-icon" :disabled="i === players.length - 1" title="Правее" @click="movePlayer(i, 1)">→</button>
                <button class="btn btn-sm" @click="editStart(p.id)">Стартовый балл</button>
                <button class="btn btn-sm btn-danger" @click="removePlayer(p.id)">Убрать</button>
              </div>
            </div>

            <div v-if="notInSession.length" class="row addp">
              <select v-model="addId" class="select">
                <option value="" disabled>Добавить игрока в игру…</option>
                <option v-for="p in notInSession" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <button class="btn btn-sm" :disabled="!addId || store.busy" @click="addPlayer">Добавить</button>
            </div>
          </section>

          <section class="card">
            <h2>Журнал очков</h2>
            <p v-if="!store.scores.length" class="muted">Пока пусто</p>
            <div v-for="e in store.scores" :key="e.id" class="ev" :class="{ voided: e.voided }">
              <span>
                <b>{{ playerName(e.participantId) }}</b> {{ sign(e.delta) }}
                <small class="muted">{{ e.reason || e.kind }}</small>
              </span>
              <button v-if="!e.voided" class="btn btn-sm btn-icon" title="Отменить начисление" :disabled="store.busy" @click="store.voidScore(e.id)">↶</button>
              <small v-else class="muted">отменено</small>
            </div>
          </section>
        </aside>
      </div>
    </template>
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

.live {
  color: var(--muted);
  font-size: 13px;
}

.live.open {
  color: var(--ok);
}

.live.lost {
  color: var(--danger);
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

.check {
  display: flex;
  align-items: center;
  gap: 6px;
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
  border: 0;
  border-radius: 6px;
  background: #1b3a94;
  color: #fff;
  font: 600 13px/1.2 system-ui, sans-serif;
  text-align: left;
  text-transform: uppercase;
}

.htheme.clickable {
  cursor: pointer;
  outline: 1px dashed var(--gold);
}

.htheme.gone {
  opacity: 0.35;
  text-decoration: line-through;
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

.tools {
  padding-top: 6px;
  border-top: 1px solid var(--line);
}

.addp {
  margin-top: 8px;
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
