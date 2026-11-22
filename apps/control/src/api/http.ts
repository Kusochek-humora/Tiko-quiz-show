import {
  ApiError,
  type Api,
  type Game,
  type GameSummary,
  type Media,
  type Participant,
  type Question,
  type QuizSnapshot,
  type Round,
  type ScoreEventDto,
  type SessionApi,
  type SessionSummary,
  type Theme,
  type User,
} from './types'

export const TOKEN_KEY = 'quiz.token'

export const authHooks = {
  onUnauthorized: () => {},
}

// В разработке ходим на бэк через прокси dev-сервера (vite.config.ts), поэтому адрес пустой;
// в сборке для GitHub Pages используется адрес из VITE_API_URL
export const baseUrl = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Относительные ссылки на файлы превращаем в абсолютные; data:, blob: и http(s) не трогаем */
export function absUrl(url: string): string {
  return /^(https?:|data:|blob:)/.test(url) ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/api${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет связи с сервером')
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') authHooks.onUnauthorized()
    const err = data?.error
    // Ошибки валидации: показываем, какое поле не прошло
    const details = Array.isArray(err?.details) ? err.details.map((d: { path?: string; message?: string }) => `${d.path ?? ''} ${d.message ?? ''}`.trim()).join('; ') : ''
    throw new ApiError(res.status, err?.code ?? 'ERROR', [err?.message ?? `Ошибка ${res.status}`, details].filter(Boolean).join(': '))
  }
  return data as T
}

// Ответ может прийти как { items }, как массив или как { <имя>: объект }
const list = <T>(r: { items: T[] } | T[]): T[] => (Array.isArray(r) ? r : r.items)
const unwrap = <T>(r: unknown, key: string): T => ((r as Record<string, unknown>)?.[key] ?? r) as T
const snap = (r: unknown): QuizSnapshot => unwrap<QuizSnapshot>(r, 'snapshot')

// Бэк отдаёт path и относительный url, фронту нужен абсолютный
type RawMedia = Omit<Media, 'url'> & { path: string; url?: string }
const mapMedia = (m: RawMedia): Media => ({
  id: m.id,
  type: m.type,
  originalName: m.originalName,
  size: m.size,
  url: m.url ? absUrl(m.url) : absUrl(`/uploads/${m.path}`),
})

// Необязательные поля бэк принимает только со значением: null и пустые строки убираем
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '')) as T
}

export const httpApi: Api = {
  login: (login, password) => request<{ token: string; user: User }>('POST', '/auth/login', { login, password }),
  me: () => request<User>('GET', '/auth/me'),

  listGames: async () => list(await request<{ items: GameSummary[] }>('GET', '/games?limit=200')),
  getGame: async (id) => unwrap<Game>(await request('GET', `/games/${id}`), 'game'),
  createGame: async (input) => unwrap<Game>(await request('POST', '/games', compact(input)), 'game'),
  updateGame: (id, input) => request('PATCH', `/games/${id}`, input),
  deleteGame: (id) => request('DELETE', `/games/${id}`),
  duplicateGame: async (id) => unwrap<Game>(await request('POST', `/games/${id}/duplicate`), 'game'),

  createRound: (gameId, input) => request<Round>('POST', `/games/${gameId}/rounds`, compact(input)),
  updateRound: (id, input) => request('PATCH', `/rounds/${id}`, input),
  deleteRound: (id) => request('DELETE', `/rounds/${id}`),
  reorderRounds: (gameId, ids) => request('PUT', `/games/${gameId}/rounds/order`, { ids }),

  createTheme: (roundId, input) => request<Theme>('POST', `/rounds/${roundId}/themes`, input),
  updateTheme: (id, input) => request('PATCH', `/themes/${id}`, input),
  deleteTheme: (id) => request('DELETE', `/themes/${id}`),
  reorderThemes: (roundId, ids) => request('PUT', `/rounds/${roundId}/themes/order`, { ids }),

  createQuestion: (themeId, input) => request<Question>('POST', `/themes/${themeId}/questions`, input),
  updateQuestion: (id, input) => request('PATCH', `/questions/${id}`, input),
  deleteQuestion: (id) => request('DELETE', `/questions/${id}`),

  listMedia: async () => list(await request<{ items: RawMedia[] }>('GET', '/media?limit=1000')).map(mapMedia),
  uploadMedia: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return mapMedia(await request<RawMedia>('POST', '/media', form))
  },
  deleteMedia: (id) => request('DELETE', `/media/${id}`),

  listParticipants: async () => list(await request<{ items: Participant[] }>('GET', '/participants?limit=500')),
  createParticipant: (input) => request<Participant>('POST', '/participants', compact(input)),
  updateParticipant: (id, input) => request('PATCH', `/participants/${id}`, input),
  deleteParticipant: (id) => request('DELETE', `/participants/${id}`),
}

export const httpSessionApi: SessionApi = {
  listSessions: async () => list(await request<{ items: SessionSummary[] }>('GET', '/sessions?limit=100')),
  createSession: async (input) => {
    const r = await request<{ session: SessionSummary; screenToken: string; screenUrl: string | null; snapshot: QuizSnapshot }>('POST', '/sessions', input)
    return r
  },
  getSession: async (id) => snap(await request('GET', `/sessions/${id}`)),
  deleteSession: (id) => request('DELETE', `/sessions/${id}`),
  sendCommand: async (id, cmd) => snap(await request('POST', `/sessions/${id}/commands`, cmd)),
  rotateScreenToken: (id) => request('POST', `/sessions/${id}/screen-token/rotate`),

  listScores: async (id) => list(await request<{ items: ScoreEventDto[] }>('GET', `/sessions/${id}/scores`)),
  addScore: async (id, input) => snap(await request('POST', `/sessions/${id}/scores`, compact(input))),
  setScore: async (id, input) => snap(await request('POST', `/sessions/${id}/scores/set`, compact(input))),
  voidScore: async (id, eventId, expectedVersion) =>
    snap(await request('POST', `/sessions/${id}/scores/${eventId}/void`, expectedVersion === undefined ? {} : { expectedVersion })),

  addSessionPlayer: async (id, input) => snap(await request('POST', `/sessions/${id}/participants`, compact(input))),
  patchSessionPlayer: async (id, participantId, input) => snap(await request('PATCH', `/sessions/${id}/participants/${participantId}`, input)),
  removeSessionPlayer: async (id, participantId, expectedVersion) =>
    snap(await request('DELETE', `/sessions/${id}/participants/${participantId}${expectedVersion === undefined ? '' : `?expectedVersion=${expectedVersion}`}`)),
}
