import type {
  ContentBlock,
  Game,
  Media,
  Question,
  QuizCell,
  QuizSnapshot,
  Round,
  ScoreKind,
  SessionRole,
  SessionStatus,
} from '@/api'

// Демо-движок: повторяет автомат состояний из QUIZ_API.md на клиенте и отдаёт снимки
// в том же формате, что и настоящий бэк. Нужен для работы без сервера и для проверки интерфейса.
// Чистые функции, без обращений к сети. Механики с фазой prepare (кот, аукцион, ставка, финал)
// здесь не реализованы: они работают только на настоящем бэке.

export type Status = SessionStatus

export const STATUS_LABELS: Record<Status, string> = {
  idle: 'Ожидание',
  intro: 'Заставка',
  round_intro: 'Заставка раунда',
  board: 'Игровое поле',
  question_shown: 'Вопрос',
  timer_running: 'Идёт таймер',
  answer_revealed: 'Ответ показан',
  finished: 'Игра окончена',
}

export interface SessionPlayer {
  id: string
  name: string
  color: string
  photoMediaId: string | null
  startScore: number
}

export interface ScoreEvent {
  id: string
  participantId: string
  kind: ScoreKind
  delta: number
  reason: string
  questionId: string | null
  voided: boolean
  at: string
}

export interface SessionState {
  id: string
  gameId: string
  version: number
  status: Status
  hostName: string
  roundIndex: number
  played: string[]
  currentQuestionId: string | null
  activeId: string | null
  timerEndsAt: number | null
  hintsOpened: number
  players: SessionPlayer[]
  events: ScoreEvent[]
  /** Снимки предыдущих состояний (JSON) для команды back */
  history: string[]
}

export type Command =
  | { type: 'start' }
  | { type: 'next_round' }
  | { type: 'goto_round'; roundId: string }
  | { type: 'show_board' }
  | { type: 'open_question'; questionId: string }
  | { type: 'start_timer' }
  | { type: 'reveal_answer' }
  | { type: 'reveal_hint' }
  | { type: 'set_active'; participantId: string | null }
  | { type: 'finish' }
  | { type: 'back' }

export class EngineError extends Error {
  constructor(
    message: string,
    public code = 'INVALID_TRANSITION',
  ) {
    super(message)
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const fail = (message: string, code?: string): never => {
  throw new EngineError(message, code)
}

export const sortedRounds = (game: Game): Round[] => [...game.rounds].sort((a, b) => a.order - b.order)
export const roundQuestions = (round: Round): Question[] => round.themes.flatMap((t) => t.questions)

export function findQuestion(game: Game, id: string): Question | null {
  for (const r of game.rounds) for (const t of r.themes) for (const q of t.questions) if (q.id === id) return q
  return null
}

export const roundOf = (state: SessionState, game: Game): Round | null => sortedRounds(game)[state.roundIndex] ?? null

export function createSession(game: Game, players: SessionPlayer[], hostName: string): SessionState {
  return {
    id: crypto.randomUUID(),
    gameId: game.id,
    version: 1,
    status: 'idle',
    hostName,
    roundIndex: -1,
    played: [],
    currentQuestionId: null,
    activeId: null,
    timerEndsAt: null,
    hintsOpened: 0,
    players,
    events: [],
    history: [],
  }
}

// Каждое изменение увеличивает version и кладёт предыдущее состояние в history
function commit(prev: SessionState, mutate: (next: SessionState) => void): SessionState {
  const next = clone(prev)
  mutate(next)
  next.history = [...prev.history, JSON.stringify({ ...prev, history: [] })].slice(-200)
  next.version = prev.version + 1
  return next
}

const ACTIVE: Status[] = ['intro', 'round_intro', 'board', 'question_shown', 'timer_running', 'answer_revealed']

const ALLOWED: Record<Exclude<Command['type'], 'back'>, Status[]> = {
  start: ['idle'],
  next_round: ['intro', 'board'],
  goto_round: ['intro', 'round_intro', 'board'],
  show_board: ['round_intro', 'answer_revealed'],
  open_question: ['board'],
  start_timer: ['question_shown'],
  reveal_answer: ['question_shown', 'timer_running'],
  reveal_hint: ['question_shown', 'timer_running'],
  set_active: ['board', 'question_shown', 'timer_running', 'answer_revealed'],
  finish: ACTIVE,
}

export function applyCommand(state: SessionState, cmd: Command, game: Game): SessionState {
  if (cmd.type === 'back') {
    const last = state.history.at(-1)
    if (!last) return fail('Откатывать нечего', 'NOTHING_TO_UNDO')
    const prev = JSON.parse(last) as SessionState
    return { ...prev, history: state.history.slice(0, -1), version: state.version + 1 }
  }

  if (!ALLOWED[cmd.type].includes(state.status)) {
    return fail(`Команда недоступна в состоянии «${STATUS_LABELS[state.status]}»`)
  }

  const rounds = sortedRounds(game)

  switch (cmd.type) {
    case 'start':
      return commit(state, (n) => {
        n.status = 'intro'
      })

    case 'next_round': {
      const next = state.roundIndex + 1
      if (next >= rounds.length) return fail('Раундов больше нет', 'NO_MORE_ROUNDS')
      return commit(state, (n) => {
        n.roundIndex = next
        n.status = 'round_intro'
        n.currentQuestionId = null
        n.timerEndsAt = null
      })
    }

    // Переход к любому раунду по id, в том числе назад (как goto_round { roundId } на бэке)
    case 'goto_round': {
      const index = rounds.findIndex((r) => r.id === cmd.roundId)
      if (index < 0) return fail('Такого раунда нет', 'NOT_FOUND')
      if (index === state.roundIndex) return fail('Этот раунд уже открыт')
      return commit(state, (n) => {
        n.roundIndex = index
        n.status = 'round_intro'
        n.currentQuestionId = null
        n.timerEndsAt = null
        n.hintsOpened = 0
      })
    }

    case 'show_board':
      return commit(state, (n) => {
        n.status = 'board'
        n.currentQuestionId = null
        n.timerEndsAt = null
        n.hintsOpened = 0
      })

    case 'open_question': {
      const round = rounds[state.roundIndex]
      const q = round ? roundQuestions(round).find((x) => x.id === cmd.questionId) : undefined
      if (!q) return fail('Этого вопроса нет в текущем раунде')
      if (state.played.includes(q.id)) return fail('Вопрос уже сыгран', 'ALREADY_PLAYED')
      return commit(state, (n) => {
        n.status = 'question_shown'
        n.played.push(q.id)
        n.currentQuestionId = q.id
        n.hintsOpened = 0
        n.timerEndsAt = null
      })
    }

    case 'start_timer': {
      const q = state.currentQuestionId ? findQuestion(game, state.currentQuestionId) : null
      if (!q?.timeLimitSec) return fail('У этого вопроса нет таймера', 'NO_TIMER')
      return commit(state, (n) => {
        n.status = 'timer_running'
        n.timerEndsAt = Date.now() + q.timeLimitSec! * 1000
      })
    }

    case 'reveal_answer':
      return commit(state, (n) => {
        n.status = 'answer_revealed'
      })

    case 'reveal_hint': {
      const q = state.currentQuestionId ? findQuestion(game, state.currentQuestionId) : null
      if (q?.kind !== 'hints') return fail('У этого вопроса нет подсказок')
      if (state.hintsOpened >= (q.settings.hints?.length ?? 0)) return fail('Все подсказки уже открыты')
      return commit(state, (n) => {
        n.hintsOpened += 1
      })
    }

    case 'set_active':
      return commit(state, (n) => {
        n.activeId = cmd.participantId
      })

    case 'finish':
      return commit(state, (n) => {
        n.status = 'finished'
        n.currentQuestionId = null
        n.timerEndsAt = null
      })
  }
}

// ---------- очки ----------

export const playerScore = (state: SessionState, id: string): number => {
  const p = state.players.find((x) => x.id === id)
  const sum = state.events.filter((e) => e.participantId === id && !e.voided).reduce((s, e) => s + e.delta, 0)
  return (p?.startScore ?? 0) + sum
}

export function effectivePrice(q: Question, state: SessionState): number {
  if (q.kind === 'hints') return Math.max(0, q.price - state.hintsOpened * (q.settings.penaltyPerHint ?? 0))
  return q.price
}

export function addScore(
  state: SessionState,
  input: { participantId: string; kind: ScoreKind; delta: number; reason?: string; questionId?: string | null },
): SessionState {
  if (!Number.isInteger(input.delta) || input.delta === 0) return fail('Сумма должна быть целым числом, не равным нулю', 'VALIDATION_ERROR')
  if (!state.players.some((p) => p.id === input.participantId)) return fail('Игрока нет в сессии', 'PARTICIPANT_NOT_FOUND')
  return commit(state, (n) => {
    n.events.push({
      id: crypto.randomUUID(),
      participantId: input.participantId,
      kind: input.kind,
      delta: input.delta,
      reason: input.reason?.trim() ?? '',
      questionId: input.questionId ?? null,
      voided: false,
      at: new Date().toISOString(),
    })
  })
}

export function voidScore(state: SessionState, eventId: string): SessionState {
  const e = state.events.find((x) => x.id === eventId)
  if (!e) return fail('Начисление не найдено', 'NOT_FOUND')
  if (e.voided) return fail('Начисление уже отменено', 'ALREADY_VOIDED')
  return commit(state, (n) => {
    n.events.find((x) => x.id === eventId)!.voided = true
  })
}

/** Ручная правка итога: создаётся событие manual с разницей */
export function setScore(state: SessionState, participantId: string, total: number, reason = ''): SessionState {
  if (!Number.isInteger(total)) return fail('Счёт должен быть целым числом', 'VALIDATION_ERROR')
  const delta = total - playerScore(state, participantId)
  if (delta === 0) return fail('Счёт уже такой', 'NO_CHANGE')
  return addScore(state, { participantId, kind: 'manual', delta, reason: reason || 'Ручная правка счёта' })
}

// ---------- игроки в сессии ----------

export function addPlayer(state: SessionState, player: SessionPlayer): SessionState {
  if (state.players.some((p) => p.id === player.id)) return fail('Игрок уже в сессии', 'ALREADY_IN_SESSION')
  return commit(state, (n) => {
    n.players.push(player)
  })
}

export function removePlayer(state: SessionState, id: string): SessionState {
  return commit(state, (n) => {
    n.players = n.players.filter((p) => p.id !== id)
    if (n.activeId === id) n.activeId = null
  })
}

export function patchPlayer(state: SessionState, id: string, patch: { startScore?: number; order?: number }): SessionState {
  if (!state.players.some((p) => p.id === id)) return fail('Игрока нет в сессии', 'NOT_FOUND')
  return commit(state, (n) => {
    const idx = n.players.findIndex((p) => p.id === id)
    if (patch.startScore !== undefined) n.players[idx].startScore = Math.trunc(patch.startScore)
    if (patch.order !== undefined) {
      const [p] = n.players.splice(idx, 1)
      n.players.splice(Math.max(0, Math.min(n.players.length, patch.order)), 0, p)
    }
  })
}

// ---------- снимок состояния (формат QuizSnapshot) ----------

function seeded(seed: string) {
  let h = 2166136261
  for (const ch of seed) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(arr: T[], seed: string): T[] {
  const rnd = seeded(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Что рисовать для конкретной механики. Ответы показываем пульту сразу, экрану только после reveal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildView(q: Question, state: SessionState, showAnswer: boolean, role: SessionRole): Record<string, any> {
  const s = q.settings
  switch (q.kind) {
    case 'options':
      return {
        variant: s.variant ?? 'choice',
        multiple: !!s.multiple,
        options: (s.options ?? []).map((o: { id: string; text?: string; mediaId?: string; isCorrect: boolean }) => ({
          id: o.id,
          text: o.text,
          mediaId: o.mediaId,
          ...(showAnswer ? { isCorrect: o.isCorrect } : {}),
        })),
      }
    case 'true_false':
      return showAnswer ? { correct: s.correct, explanation: s.explanation } : {}
    case 'hints': {
      const hints: { text?: string; mediaId?: string }[] = s.hints ?? []
      const base = { hintsShown: state.hintsOpened, hintsTotal: hints.length, penaltyPerHint: s.penaltyPerHint ?? 0 }
      return role === 'host'
        ? { ...base, hints: hints.map((h, i) => ({ ...h, shown: i < state.hintsOpened })) }
        : { ...base, hints: hints.slice(0, state.hintsOpened) }
    }
    case 'cat_in_bag':
      return { teaser: s.teaser, allowSelf: !!s.allowSelf, recipientId: null, price: s.priceOverride ?? q.price }
    case 'auction':
      return { startBid: s.startBid, step: s.step, bids: [], closed: false, winnerId: null, winningBid: null, minNextBid: s.startBid }
    case 'stake':
      return { stake: null, participantId: null, maxStake: s.maxStake ?? 'score' }
    case 'blitz': {
      const items: { content: ContentBlock[]; answerContent: ContentBlock[] }[] = s.items ?? []
      return {
        index: 0,
        total: items.length,
        perItemSec: s.perItemSec,
        totalSec: s.totalSec,
        pointsPerItem: s.pointsPerItem,
        item: { content: items[0]?.content ?? [], ...(role === 'host' ? { answerContent: items[0]?.answerContent ?? [] } : {}) },
        ...(showAnswer ? { answers: items.map((i) => i.answerContent) } : {}),
      }
    }
    case 'reveal_image':
      return { mediaId: s.mediaId, mode: s.mode, steps: s.steps, step: showAnswer ? s.steps : 0 }
    case 'ordering': {
      const items: { id: string; text?: string; mediaId?: string }[] = s.items ?? []
      return { items: shuffled(items, q.id), ...(showAnswer ? { correctOrder: items.map((i) => i.id) } : {}) }
    }
    case 'matching': {
      const pairs: { left: { text?: string; mediaId?: string }; right: { text?: string; mediaId?: string } }[] = s.pairs ?? []
      const left = pairs.map((p, i) => ({ id: `l${i}`, ...p.left }))
      const right = pairs.map((p, i) => ({ id: `r${i}`, ...p.right }))
      return {
        left,
        right: shuffled(right, q.id),
        ...(showAnswer ? { pairs: pairs.map((_, i) => ({ leftId: `l${i}`, rightId: `r${i}` })) } : {}),
      }
    }
    case 'fill_blank':
      return { template: s.template, blanksCount: (s.blanks ?? []).length, ...(showAnswer ? { blanks: s.blanks } : {}) }
    case 'word_guess': {
      const word = String(s.word ?? '')
      return {
        hint: s.hint,
        letters: [],
        mask: [...word].map((ch) => ({ char: showAnswer ? ch : null })),
        ...(showAnswer ? { word } : {}),
      }
    }
    default:
      return {}
  }
}

// Собираем в карту все файлы, на которые снимок ссылается по mediaId
function collectMedia(value: unknown, byId: Map<string, Media>, out: QuizSnapshot['media']) {
  if (Array.isArray(value)) {
    value.forEach((v) => collectMedia(v, byId, out))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'mediaId' && typeof v === 'string') {
        const m = byId.get(v)
        if (m) out[v] = { type: m.type, url: m.url }
      } else {
        collectMedia(v, byId, out)
      }
    }
  }
}

const VISIBLE_BOARD: Status[] = ['round_intro', 'board', 'question_shown', 'timer_running', 'answer_revealed']
const QUESTION_STATES: Status[] = ['question_shown', 'timer_running', 'answer_revealed']

export function toQuizSnapshot(state: SessionState, game: Game, mediaList: Media[], role: SessionRole): QuizSnapshot {
  const rounds = sortedRounds(game)
  const round = rounds[state.roundIndex] ?? null
  const byId = new Map(mediaList.map((m) => [m.id, m]))
  const host = role === 'host'

  const q = state.currentQuestionId ? findQuestion(game, state.currentQuestionId) : null
  const showQuestion = !!q && QUESTION_STATES.includes(state.status)
  const revealed = state.status === 'answer_revealed'
  const showAnswer = host || revealed

  const board =
    round && VISIBLE_BOARD.includes(state.status)
      ? {
          themes: [...round.themes]
            .sort((a, b) => a.order - b.order)
            .map((t) => ({
              id: t.id,
              title: t.title,
              eliminated: false,
              cells: [...t.questions]
                .sort((a, b) => a.price - b.price)
                .map(
                  (x): QuizCell => ({
                    questionId: x.id,
                    price: x.price,
                    played: state.played.includes(x.id),
                    ...(host ? { question: { kind: x.kind, content: x.content, answerContent: x.answerContent, comment: x.comment } } : {}),
                  }),
                ),
            })),
        }
      : null

  const price = q ? effectivePrice(q, state) : 0
  const question =
    showQuestion && q
      ? {
          id: q.id,
          kind: q.kind,
          price,
          timeLimitSec: q.timeLimitSec,
          themeId: q.themeId,
          themeTitle: round?.themes.find((t) => t.id === q.themeId)?.title ?? '',
          phase: 'play' as const,
          content: q.content,
          view: buildView(q, state, showAnswer, role),
          ...(showAnswer ? { answerContent: q.answerContent } : {}),
          ...(host ? { pointsIfCorrect: price, pointsIfWrong: q.settings.noPenalty ? 0 : -price, comment: q.comment } : {}),
        }
      : null

  const media: QuizSnapshot['media'] = {}
  collectMedia(question, byId, media)
  collectMedia(board, byId, media)

  const photoUrl = (id: string | null) => (id ? (byId.get(id)?.url ?? null) : null)

  return {
    sessionId: state.id,
    version: state.version,
    status: state.status,
    serverTime: new Date().toISOString(),
    timerEndsAt: state.timerEndsAt ? new Date(state.timerEndsAt).toISOString() : null,
    hostName: state.hostName || null,
    round: round
      ? { id: round.id, title: round.title, description: round.description, order: round.order, total: rounds.length, type: round.type, settings: round.settings }
      : null,
    board,
    question,
    finalists: null,
    activeParticipantId: state.activeId,
    players: state.players.map((p, i) => ({ id: p.id, name: p.name, color: p.color, photo: photoUrl(p.photoMediaId), score: playerScore(state, p.id), order: i })),
    media,
    ...(host ? { canBack: state.history.length > 0, nextRoundAvailable: state.roundIndex + 1 < rounds.length } : {}),
  }
}
