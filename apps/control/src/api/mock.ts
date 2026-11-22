import {
  ApiError,
  type Api,
  type ContentBlock,
  type Game,
  type Media,
  type MediaType,
  type Participant,
  type Question,
  type QuestionKind,
  type QuestionSettings,
  type Round,
  type Theme,
} from './types'

// Мок-бэкенд: данные лежат в localStorage, чтобы можно было разрабатывать админку без сервера.

const KEY = 'quiz.mock.db.v2'

interface Db {
  games: Game[]
  media: Media[]
  participants: Participant[]
}

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const delay = () => new Promise((r) => setTimeout(r, 60))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const t = (text: string): ContentBlock[] => [{ type: 'text', text }]

function makeQuestion(
  themeId: string,
  order: number,
  price: number,
  text: string,
  kind: QuestionKind = 'standard',
  settings: QuestionSettings = {},
): Question {
  return { id: uid(), themeId, order, price, kind, settings, content: t(text), answerContent: t('Ответ'), comment: '', timeLimitSec: null }
}

const opt = (text: string, isCorrect = false) => ({ id: uid(), text, isCorrect })

// Примеры разных механик в первом раунде: ключ "индекс темы-цена"
function demoSettings(): Record<string, [QuestionKind, QuestionSettings]> {
  return {
    '0-200': ['options', { variant: 'choice', multiple: false, options: [opt('Вариант А', true), opt('Вариант Б'), opt('Вариант В'), opt('Вариант Г')] }],
    '0-300': ['hints', { penaltyPerHint: 100, hints: [{ text: 'Подсказка 1' }, { text: 'Подсказка 2' }] }],
    '1-200': ['matching', { pairs: [{ left: { text: 'Автор 1' }, right: { text: 'Книга 1' } }, { left: { text: 'Автор 2' }, right: { text: 'Книга 2' } }] }],
    '1-300': ['fill_blank', { template: 'Москва — столица ___', blanks: ['России'] }],
    '1-400': ['word_guess', { word: 'ХОККЕЙ', hint: 'Игра на льду' }],
    '2-300': ['cat_in_bag', { priceOverride: null, allowSelf: false, teaser: 'Кому достанется?' }],
    '2-400': ['auction', { startBid: 100, step: 100 }],
    '3-200': ['true_false', { correct: true, explanation: '' }],
    '3-500': ['stake', { maxStake: 'score' }],
    '4-300': [
      'blitz',
      { items: [{ content: t('Пункт 1'), answerContent: t('Ответ 1') }, { content: t('Пункт 2'), answerContent: t('Ответ 2') }], perItemSec: 10, totalSec: null, pointsPerItem: 100 },
    ],
    '4-400': ['ordering', { items: [{ id: uid(), text: 'Первый' }, { id: uid(), text: 'Второй' }, { id: uid(), text: 'Третий' }] }],
  }
}

function seed(): Db {
  const gameId = uid()
  const demo = demoSettings()

  const r1 = uid()
  const titles = ['Сны', 'Вся наша жизнь есть борьба', 'Зелёный', 'Хоккей', 'Братья наши меньшие']
  const themes1: Theme[] = titles.map((title, i) => {
    const themeId = uid()
    return {
      id: themeId,
      roundId: r1,
      order: i,
      title,
      questions: [100, 200, 300, 400, 500].map((p, j) => {
        const [kind, settings] = demo[`${i}-${p}`] ?? ['standard', {}]
        return makeQuestion(themeId, j, p, `Вопрос «${title}» за ${p}`, kind, settings)
      }),
    }
  })

  const r2 = uid()
  const th2 = uid()
  const round2: Round = {
    id: r2,
    gameId,
    order: 1,
    title: 'Командный раунд',
    description: '',
    type: 'standard',
    settings: {},
    themes: [{ id: th2, roundId: r2, order: 0, title: 'Общий вопрос', questions: [makeQuestion(th2, 0, 500, 'Командный вопрос')] }],
  }

  const r3 = uid()
  const th3 = uid()
  const round3: Round = {
    id: r3,
    gameId,
    order: 2,
    title: 'Супер-игра',
    description: '',
    type: 'final',
    settings: { finalists: 'leader', mode: 'single_question' },
    themes: [{ id: th3, roundId: r3, order: 0, title: 'Финал', questions: [makeQuestion(th3, 0, 1000, 'Супер-вопрос', 'stake', { maxStake: 'score' })] }],
  }

  const round1: Round = { id: r1, gameId, order: 0, title: 'Раунд 1', description: '', type: 'standard', settings: {}, themes: themes1 }

  return {
    games: [{ id: gameId, title: 'Тестовая игра', description: 'Демо-данные', rounds: [round1, round2, round3], updatedAt: now() }],
    media: [],
    participants: ['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4'].map((name, i) => ({
      id: uid(),
      name,
      color: ['#4f8cff', '#f5b301', '#34c38f', '#ef5a5a'][i],
      photoMediaId: null,
      defaultStartScore: 0,
    })),
  }
}

let db: Db = load()

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    /* повреждённые данные: начинаем с демо */
  }
  const fresh = seed()
  persist(fresh)
  return fresh
}

function persist(data: Db = db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    throw new ApiError(507, 'STORAGE_FULL', 'Хранилище браузера переполнено (демо-режим)')
  }
}

function touch(game: Game) {
  game.updatedAt = now()
  persist()
}

const findGame = (id: string) => {
  const g = db.games.find((x) => x.id === id)
  if (!g) throw new ApiError(404, 'NOT_FOUND', 'Игра не найдена')
  return g
}
const findRound = (id: string) => {
  for (const game of db.games) {
    const round = game.rounds.find((r) => r.id === id)
    if (round) return { game, round }
  }
  throw new ApiError(404, 'NOT_FOUND', 'Раунд не найден')
}
const findTheme = (id: string) => {
  for (const game of db.games) {
    for (const round of game.rounds) {
      const theme = round.themes.find((x) => x.id === id)
      if (theme) return { game, round, theme }
    }
  }
  throw new ApiError(404, 'NOT_FOUND', 'Тема не найдена')
}
const findQuestion = (id: string) => {
  for (const game of db.games) {
    for (const round of game.rounds) {
      for (const theme of round.themes) {
        const question = theme.questions.find((q) => q.id === id)
        if (question) return { game, theme, question }
      }
    }
  }
  throw new ApiError(404, 'NOT_FOUND', 'Вопрос не найден')
}

function reorder<T extends { id: string; order: number }>(items: T[], ids: string[]) {
  ids.forEach((id, i) => {
    const item = items.find((x) => x.id === id)
    if (item) item.order = i
  })
  items.sort((a, b) => a.order - b.order)
}

const countQuestions = (g: Game) => g.rounds.reduce((s, r) => s + r.themes.reduce((c, th) => c + th.questions.length, 0), 0)

// Ищет все mediaId внутри содержимого и настроек вопроса
function collectMediaIds(value: unknown, out: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((v) => collectMediaIds(v, out))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'mediaId' && typeof v === 'string') out.add(v)
      else collectMediaIds(v, out)
    }
  }
}

function usedMediaIds(): Set<string> {
  const used = new Set<string>()
  db.games.forEach((g) =>
    g.rounds.forEach((r) =>
      r.themes.forEach((th) =>
        th.questions.forEach((q) => {
          collectMediaIds(q.content, used)
          collectMediaIds(q.answerContent, used)
          collectMediaIds(q.settings, used)
        }),
      ),
    ),
  )
  db.participants.forEach((p) => p.photoMediaId && used.add(p.photoMediaId))
  return used
}

function mediaType(mime: string): MediaType {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  throw new ApiError(422, 'VALIDATION_ERROR', 'Неподдерживаемый тип файла')
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new ApiError(500, 'READ_ERROR', 'Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })

function cloneGameWithNewIds(src: Game): Game {
  const gameId = uid()
  return {
    ...clone(src),
    id: gameId,
    title: `${src.title} (копия)`,
    updatedAt: now(),
    rounds: src.rounds.map((r) => {
      const roundId = uid()
      return {
        ...clone(r),
        id: roundId,
        gameId,
        themes: r.themes.map((th) => {
          const themeId = uid()
          return {
            ...clone(th),
            id: themeId,
            roundId,
            questions: th.questions.map((q) => ({ ...clone(q), id: uid(), themeId })),
          }
        }),
      }
    }),
  }
}

export const mockApi: Api = {
  async login(login, password) {
    await delay()
    if (login === 'admin' && password === 'admin') {
      return { token: 'mock-token', user: { id: 'u1', login: 'admin', role: 'admin' } }
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль')
  },
  async me() {
    await delay()
    if (localStorage.getItem('quiz.token') !== 'mock-token') throw new ApiError(401, 'UNAUTHORIZED', 'Требуется вход')
    return { id: 'u1', login: 'admin', role: 'admin' }
  },

  async listGames() {
    await delay()
    return db.games
      .map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        roundsCount: g.rounds.length,
        questionsCount: countQuestions(g),
        updatedAt: g.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  async getGame(id) {
    await delay()
    return clone(findGame(id))
  },
  async createGame(input) {
    await delay()
    const game: Game = { id: uid(), title: input.title, description: input.description ?? '', rounds: [], updatedAt: now() }
    db.games.push(game)
    persist()
    return clone(game)
  },
  async updateGame(id, input) {
    await delay()
    const g = findGame(id)
    if (input.title !== undefined) g.title = input.title
    if (input.description !== undefined) g.description = input.description
    touch(g)
  },
  async deleteGame(id) {
    await delay()
    findGame(id)
    db.games = db.games.filter((g) => g.id !== id)
    persist()
  },
  async duplicateGame(id) {
    await delay()
    const copy = cloneGameWithNewIds(findGame(id))
    db.games.push(copy)
    persist()
    return clone(copy)
  },

  async createRound(gameId, input) {
    await delay()
    const g = findGame(gameId)
    const round: Round = {
      id: uid(),
      gameId,
      order: g.rounds.length,
      title: input.title,
      description: input.description ?? '',
      type: input.type ?? 'standard',
      settings: input.settings ?? {},
      themes: [],
    }
    g.rounds.push(round)
    touch(g)
    return clone(round)
  },
  async updateRound(id, input) {
    await delay()
    const { game, round } = findRound(id)
    if (input.title !== undefined) round.title = input.title
    if (input.description !== undefined) round.description = input.description
    if (input.type !== undefined) round.type = input.type
    if (input.settings !== undefined) round.settings = input.settings
    touch(game)
  },
  async deleteRound(id) {
    await delay()
    const { game } = findRound(id)
    game.rounds = game.rounds.filter((r) => r.id !== id)
    game.rounds.forEach((r, i) => (r.order = i))
    touch(game)
  },
  async reorderRounds(gameId, ids) {
    await delay()
    const g = findGame(gameId)
    reorder(g.rounds, ids)
    touch(g)
  },

  async createTheme(roundId, input) {
    await delay()
    const { game, round } = findRound(roundId)
    const theme: Theme = { id: uid(), roundId, order: round.themes.length, title: input.title, questions: [] }
    round.themes.push(theme)
    touch(game)
    return clone(theme)
  },
  async updateTheme(id, input) {
    await delay()
    const { game, theme } = findTheme(id)
    theme.title = input.title
    touch(game)
  },
  async deleteTheme(id) {
    await delay()
    const { game, round } = findTheme(id)
    round.themes = round.themes.filter((x) => x.id !== id)
    round.themes.forEach((x, i) => (x.order = i))
    touch(game)
  },
  async reorderThemes(roundId, ids) {
    await delay()
    const { game, round } = findRound(roundId)
    reorder(round.themes, ids)
    touch(game)
  },

  async createQuestion(themeId, input) {
    await delay()
    const { game, theme } = findTheme(themeId)
    const q: Question = { ...clone(input), id: uid(), themeId, order: theme.questions.length }
    theme.questions.push(q)
    theme.questions.sort((a, b) => a.price - b.price)
    touch(game)
    return clone(q)
  },
  async updateQuestion(id, input) {
    await delay()
    const { game, theme, question } = findQuestion(id)
    Object.assign(question, clone(input))
    theme.questions.sort((a, b) => a.price - b.price)
    touch(game)
  },
  async deleteQuestion(id) {
    await delay()
    const { game, theme } = findQuestion(id)
    theme.questions = theme.questions.filter((q) => q.id !== id)
    touch(game)
  },

  async listMedia() {
    await delay()
    return clone(db.media)
  },
  async uploadMedia(file) {
    await delay()
    const type = mediaType(file.type)
    // В демо-режиме файл хранится как data URL в localStorage (лимит ~5 МБ)
    const url = await readAsDataUrl(file)
    const media: Media = { id: uid(), type, url, originalName: file.name, size: file.size }
    db.media.push(media)
    try {
      persist()
    } catch (e) {
      db.media.pop()
      throw e
    }
    return clone(media)
  },
  async deleteMedia(id) {
    await delay()
    if (usedMediaIds().has(id)) throw new ApiError(409, 'MEDIA_IN_USE', 'Файл используется в вопросах или у участников')
    db.media = db.media.filter((m) => m.id !== id)
    persist()
  },

  async listParticipants() {
    await delay()
    return clone(db.participants)
  },
  async createParticipant(input) {
    await delay()
    const p: Participant = {
      id: uid(),
      name: input.name,
      color: input.color,
      photoMediaId: input.photoMediaId ?? null,
      defaultStartScore: input.defaultStartScore ?? 0,
    }
    db.participants.push(p)
    persist()
    return clone(p)
  },
  async updateParticipant(id, input) {
    await delay()
    const p = db.participants.find((x) => x.id === id)
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'Участник не найден')
    Object.assign(p, input)
    persist()
  },
  async deleteParticipant(id) {
    await delay()
    db.participants = db.participants.filter((p) => p.id !== id)
    persist()
  },
}
