import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, ApiError, type QuizSnapshot, type ScoreEventDto, type ScoreKind, type SessionSummary } from '@/api'
import { openLive, type LiveState } from '@/sessions/live'

const ID_KEY = 'quiz.sessionId'
const TOKENS_KEY = 'quiz.screenTokens'

// Токен экрана показывается только при создании сессии, поэтому запоминаем его в браузере
function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const GAMES_KEY = 'quiz.sessionGames'

function readGameIds(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(GAMES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Состояние пульта ведущего: текущая сессия, её снимок и все действия оператора */
export const useSessionStore = defineStore('session', () => {
  const sessionId = ref<string | null>(localStorage.getItem(ID_KEY))
  const snap = ref<QuizSnapshot | null>(null)
  const scores = ref<ScoreEventDto[]>([])
  const sessions = ref<SessionSummary[]>([])
  const live = ref<LiveState>('connecting')
  const error = ref('')
  const busy = ref(false)
  const screenTokens = ref<Record<string, string>>(readTokens())
  // id игры нужен пульту, чтобы показать список раундов (в снимке состояния его нет)
  const gameIds = ref<Record<string, string>>(readGameIds())

  let closeLive: (() => void) | null = null

  const screenToken = computed(() => (sessionId.value ? (screenTokens.value[sessionId.value] ?? null) : null))
  const gameId = computed(() => (sessionId.value ? (gameIds.value[sessionId.value] ?? null) : null))

  function rememberGame(id: string, game: string) {
    gameIds.value = { ...gameIds.value, [id]: game }
    try {
      localStorage.setItem(GAMES_KEY, JSON.stringify(gameIds.value))
    } catch {
      /* хранилище недоступно */
    }
  }

  // Принимаем снимок, только если он не старее показанного: по WebSocket и REST они могут прийти вперемешку
  function apply(s: QuizSnapshot) {
    if (snap.value && snap.value.sessionId === s.sessionId && s.version < snap.value.version) return
    snap.value = s
  }

  function rememberToken(id: string, token: string) {
    screenTokens.value = { ...screenTokens.value, [id]: token }
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(screenTokens.value))
    } catch {
      /* хранилище недоступно */
    }
  }

  function disconnect() {
    closeLive?.()
    closeLive = null
  }

  function connect(id: string) {
    disconnect()
    closeLive = openLive(
      { sessionId: id, role: 'host' },
      {
        onSnapshot: apply,
        onState: (s) => (live.value = s),
        onClosed: (reason) => {
          error.value = reason
          live.value = 'lost'
        },
      },
    )
  }

  async function loadScores() {
    if (!sessionId.value) return
    try {
      scores.value = await api.listScores(sessionId.value)
    } catch {
      /* журнал вспомогательный, ошибку не показываем */
    }
  }

  // Журнал очков обновляем при каждом новом состоянии
  watch(() => snap.value?.version, loadScores)

  async function loadSessions() {
    try {
      sessions.value = await api.listSessions()
    } catch (e) {
      error.value = message(e)
    }
  }

  function message(e: unknown) {
    return e instanceof Error ? e.message : 'Неизвестная ошибка'
  }

  // Обёртка для действий оператора: блокирует двойной клик, показывает ошибки, при расхождении версий обновляет снимок
  async function run(fn: () => Promise<QuizSnapshot>) {
    if (busy.value) return
    busy.value = true
    try {
      apply(await fn())
      error.value = ''
    } catch (e) {
      error.value = message(e)
      if (e instanceof ApiError && e.code === 'VERSION_MISMATCH' && sessionId.value) {
        try {
          apply(await api.getSession(sessionId.value))
        } catch {
          /* оставляем показанную ошибку */
        }
      }
    } finally {
      busy.value = false
    }
  }

  async function open(id: string) {
    error.value = ''
    try {
      const s = await api.getSession(id)
      sessionId.value = id
      localStorage.setItem(ID_KEY, id)
      snap.value = s
      // Если игру этой сессии не запомнили (открыли с другого браузера), берём из списка сессий
      if (!gameIds.value[id]) {
        if (!sessions.value.length) await loadSessions()
        const found = sessions.value.find((x) => x.id === id)
        if (found?.gameId) rememberGame(id, found.gameId)
      }
      await loadScores()
      connect(id)
    } catch (e) {
      // Сессии больше нет (например, удалили): забываем её
      if (e instanceof ApiError && e.status === 404) forget()
      error.value = message(e)
    }
  }

  function forget() {
    disconnect()
    sessionId.value = null
    snap.value = null
    scores.value = []
    localStorage.removeItem(ID_KEY)
  }

  async function create(gameId: string, players: { id: string; startScore: number; defaultStartScore: number }[], hostName: string) {
    error.value = ''
    busy.value = true
    try {
      const res = await api.createSession({ gameId, participantIds: players.map((p) => p.id), hostName: hostName || undefined })
      rememberToken(res.session.id, res.screenToken)
      rememberGame(res.session.id, gameId)
      sessionId.value = res.session.id
      localStorage.setItem(ID_KEY, res.session.id)
      snap.value = res.snapshot
      // Стартовые баллы, отличающиеся от значений по умолчанию
      for (const p of players) {
        if (p.startScore !== p.defaultStartScore) apply(await api.patchSessionPlayer(res.session.id, p.id, { startScore: p.startScore }))
      }
      await loadScores()
      connect(res.session.id)
    } catch (e) {
      error.value = message(e)
    } finally {
      busy.value = false
    }
  }

  async function remove() {
    if (!sessionId.value) return
    try {
      await api.deleteSession(sessionId.value)
      forget()
      await loadSessions()
    } catch (e) {
      error.value = message(e)
    }
  }

  async function rotateToken() {
    if (!sessionId.value) return
    try {
      const r = await api.rotateScreenToken(sessionId.value)
      rememberToken(sessionId.value, r.screenToken)
    } catch (e) {
      error.value = message(e)
    }
  }

  // ----- действия оператора -----
  const version = () => snap.value?.version
  const id = () => sessionId.value!

  const command = (type: string, payload?: Record<string, unknown>) => run(() => api.sendCommand(id(), { type, payload, expectedVersion: version() }))

  const addScore = (participantId: string, kind: ScoreKind, delta: number, reason?: string, questionId?: string | null) =>
    run(() => api.addScore(id(), { participantId, kind, delta, reason, questionId, expectedVersion: version() }))

  const setScore = (participantId: string, total: number, reason?: string) =>
    run(() => api.setScore(id(), { participantId, total, reason, expectedVersion: version() }))

  const voidScore = (eventId: string) => run(() => api.voidScore(id(), eventId, version()))

  const addPlayer = (participantId: string, startScore?: number) =>
    run(() => api.addSessionPlayer(id(), { participantId, startScore, expectedVersion: version() }))

  const patchPlayer = (participantId: string, patch: { startScore?: number; order?: number }) =>
    run(() => api.patchSessionPlayer(id(), participantId, { ...patch, expectedVersion: version() }))

  const removePlayer = (participantId: string) => run(() => api.removeSessionPlayer(id(), participantId, version()))

  return {
    sessionId,
    snap,
    scores,
    sessions,
    live,
    error,
    busy,
    screenToken,
    gameId,
    loadSessions,
    open,
    create,
    remove,
    forget,
    disconnect,
    rotateToken,
    command,
    addScore,
    setScore,
    voidScore,
    addPlayer,
    patchPlayer,
    removePlayer,
  }
})
