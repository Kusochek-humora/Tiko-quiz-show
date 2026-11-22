import { KIND_LABELS } from '@/kinds'
import type { BlockType, ContentBlock, Game, Media, Question, QuestionKind, Round, RoundType } from '@/api'

// Демо-движок: повторяет автомат состояний из docs/backend.md на клиенте,
// пока нет настоящего бэка. Чистые функции, без обращений к сети.

export type Status = 'idle' | 'intro' | 'round_intro' | 'board' | 'question_shown' | 'timer_running' | 'answer_revealed' | 'finished'

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

export type ScoreKind = 'correct' | 'wrong' | 'bonus' | 'penalty' | 'manual'

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
  | { type: 'goto_round'; index: number }
  | { type: 'show_board' }
  | { type: 'open_question'; questionId: string }
  | { type: 'start_timer' }
  | { type: 'reveal_answer' }
  | { type: 'reveal_hint' }
  | { type: 'set_active'; participantId: string | null }
  | { type: 'finish' }
  | { type: 'back' }

export class EngineError extends Error {}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const fail = (message: string): never => {
  throw new EngineError(message)
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
    if (!last) return fail('Назад возвращаться некуда')
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
      if (next >= rounds.length) return fail('Раундов больше нет')
      return commit(state, (n) => {
        n.roundIndex = next
        n.status = 'round_intro'
        n.currentQuestionId = null
        n.timerEndsAt = null
      })
    }

    // Переход к любому раунду, в том числе назад. Сыгранные вопросы остаются отмеченными.
    case 'goto_round': {
      if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index >= rounds.length) return fail('Такого раунда нет')
      if (cmd.index === state.roundIndex) return fail('Этот раунд уже открыт')
      return commit(state, (n) => {
        n.roundIndex = cmd.index
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
      if (state.played.includes(q.id)) return fail('Вопрос уже сыгран')
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
      if (!q?.timeLimitSec) return fail('У этого вопроса нет таймера')
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
  if (!Number.isInteger(input.delta) || input.delta === 0) return fail('Сумма должна быть целым числом, не равным нулю')
  if (!state.players.some((p) => p.id === input.participantId)) return fail('Игрока нет в сессии')
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
  if (!state.events.some((e) => e.id === eventId)) return fail('Начисление не найдено')
  return commit(state, (n) => {
    const e = n.events.find((x) => x.id === eventId)!
    e.voided = true
  })
}

/** Ручная правка итога: создаётся событие manual с разницей */
export function setScore(state: SessionState, participantId: string, total: number, reason = ''): SessionState {
  if (!Number.isInteger(total)) return fail('Счёт должен быть целым числом')
  const delta = total - playerScore(state, participantId)
  if (delta === 0) return state
  return addScore(state, { participantId, kind: 'manual', delta, reason: reason || 'Ручная правка счёта' })
}

export function setStartScore(state: SessionState, participantId: string, startScore: number): SessionState {
  if (!Number.isInteger(startScore)) return fail('Стартовый балл должен быть целым числом')
  return commit(state, (n) => {
    const p = n.players.find((x) => x.id === participantId)
    if (p) p.startScore = startScore
  })
}

// ---------- снимок для экрана эфира ----------

export interface RBlock {
  type: BlockType
  text?: string
  url?: string
}

export interface ScreenSnapshot {
  version: number
  status: Status
  timerEndsAt: number | null
  serverTime: number
  hostName: string
  round: { title: string; description: string; index: number; total: number; type: RoundType } | null
  board: { themes: { id: string; title: string; cells: { id: string; price: number; played: boolean }[] }[] } | null
  question: {
    id: string
    kind: QuestionKind
    kindLabel: string
    price: number
    timeLimitSec: number | null
    content: RBlock[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    view: Record<string, any>
    answerContent: RBlock[] | null
  } | null
  activeId: string | null
  players: { id: string; name: string; color: string; photoUrl: string | null; score: number }[]
}

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

// Что показывать зрителям для конкретной механики. Верные ответы только после reveal.
function buildView(q: Question, state: SessionState, revealed: boolean, urlOf: (id?: string | null) => string | null): Record<string, unknown> {
  const s = q.settings
  switch (q.kind) {
    case 'options':
      return {
        variant: s.variant,
        options: (s.options ?? []).map((o: { id: string; text: string; isCorrect: boolean }) => ({
          id: o.id,
          text: o.text,
          ...(revealed ? { isCorrect: o.isCorrect } : {}),
        })),
      }
    case 'true_false':
      return revealed ? { correct: s.correct, explanation: s.explanation } : {}
    case 'hints':
      return { opened: (s.hints ?? []).slice(0, state.hintsOpened).map((h: { text: string }) => h.text), total: (s.hints ?? []).length, penalty: s.penaltyPerHint }
    case 'ordering': {
      const items: { id: string; text: string }[] = s.items ?? []
      return { items: revealed ? items : shuffled(items, q.id), correctOrder: revealed }
    }
    case 'matching': {
      const pairs: { left: { text: string }; right: { text: string } }[] = s.pairs ?? []
      return {
        left: pairs.map((p) => p.left.text),
        right: revealed ? pairs.map((p) => p.right.text) : shuffled(pairs.map((p) => p.right.text), q.id),
        matched: revealed,
      }
    }
    case 'fill_blank':
      return { template: s.template, blanks: revealed ? s.blanks : null }
    case 'word_guess': {
      const word = String(s.word ?? '')
      return { mask: revealed ? word : word.replace(/./g, '•'), hint: s.hint }
    }
    case 'blitz':
      return { count: (s.items ?? []).length, points: s.pointsPerItem }
    case 'reveal_image':
      return { url: urlOf(s.mediaId), mode: s.mode }
    case 'cat_in_bag':
      return { teaser: s.teaser }
    case 'auction':
      return { startBid: s.startBid, step: s.step }
    case 'stake':
      return {}
    default:
      return {}
  }
}

export function toScreenSnapshot(state: SessionState, game: Game, media: Media[]): ScreenSnapshot {
  const rounds = sortedRounds(game)
  const round = rounds[state.roundIndex] ?? null
  const urlOf = (id?: string | null) => (id ? (media.find((m) => m.id === id)?.url ?? null) : null)
  const resolve = (blocks: ContentBlock[]): RBlock[] => blocks.map((b) => ({ type: b.type, text: b.text, url: urlOf(b.mediaId) ?? undefined }))

  const q = state.currentQuestionId ? findQuestion(game, state.currentQuestionId) : null
  const showQuestion = !!q && (['question_shown', 'timer_running', 'answer_revealed'] as Status[]).includes(state.status)
  const revealed = state.status === 'answer_revealed'

  return {
    version: state.version,
    status: state.status,
    timerEndsAt: state.timerEndsAt,
    serverTime: Date.now(),
    hostName: state.hostName,
    round: round ? { title: round.title, description: round.description, index: state.roundIndex, total: rounds.length, type: round.type } : null,
    board: round
      ? {
          themes: [...round.themes]
            .sort((a, b) => a.order - b.order)
            .map((t) => ({
              id: t.id,
              title: t.title,
              cells: [...t.questions].sort((a, b) => a.price - b.price).map((x) => ({ id: x.id, price: x.price, played: state.played.includes(x.id) })),
            })),
        }
      : null,
    question:
      showQuestion && q
        ? {
            id: q.id,
            kind: q.kind,
            kindLabel: KIND_LABELS[q.kind],
            price: effectivePrice(q, state),
            timeLimitSec: q.timeLimitSec,
            content: resolve(q.content),
            view: buildView(q, state, revealed, urlOf),
            answerContent: revealed ? resolve(q.answerContent) : null,
          }
        : null,
    activeId: state.activeId,
    players: state.players.map((p) => ({ id: p.id, name: p.name, color: p.color, photoUrl: urlOf(p.photoMediaId), score: playerScore(state, p.id) })),
  }
}
