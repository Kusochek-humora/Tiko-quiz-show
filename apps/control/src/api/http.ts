import { ApiError, type Api, type Game, type GameSummary, type Media, type Participant, type Question, type Round, type Theme, type User } from './types'

export const TOKEN_KEY = 'quiz.token'

export const authHooks = {
  onUnauthorized: () => {},
}

const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

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
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Ошибка ${res.status}`)
  }
  return data as T
}

// Бэк отдаёт path файла, фронту нужен абсолютный url
type RawMedia = Omit<Media, 'url'> & { path: string; url?: string }
const mapMedia = (m: RawMedia): Media => ({
  id: m.id,
  type: m.type,
  originalName: m.originalName,
  size: m.size,
  url: m.url ?? `${baseUrl}/uploads/${m.path}`,
})

const list = <T>(r: { items: T[] } | T[]): T[] => (Array.isArray(r) ? r : r.items)

export const httpApi: Api = {
  login: (login, password) => request<{ token: string; user: User }>('POST', '/auth/login', { login, password }),
  me: () => request<User>('GET', '/auth/me'),

  listGames: async () => list(await request<{ items: GameSummary[] }>('GET', '/games?limit=200')),
  getGame: (id) => request<Game>('GET', `/games/${id}`),
  createGame: (input) => request<Game>('POST', '/games', input),
  updateGame: (id, input) => request('PATCH', `/games/${id}`, input),
  deleteGame: (id) => request('DELETE', `/games/${id}`),
  duplicateGame: (id) => request<Game>('POST', `/games/${id}/duplicate`),

  createRound: (gameId, input) => request<Round>('POST', `/games/${gameId}/rounds`, input),
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

  listMedia: async () => list(await request<{ items: RawMedia[] }>('GET', '/media?limit=500')).map(mapMedia),
  uploadMedia: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return mapMedia(await request<RawMedia>('POST', '/media', form))
  },
  deleteMedia: (id) => request('DELETE', `/media/${id}`),

  listParticipants: async () => list(await request<{ items: Participant[] }>('GET', '/participants?limit=200')),
  createParticipant: (input) => request<Participant>('POST', '/participants', input),
  updateParticipant: (id, input) => request('PATCH', `/participants/${id}`, input),
  deleteParticipant: (id) => request('DELETE', `/participants/${id}`),
}
