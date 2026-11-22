import { mockApi } from '@/api/mock'
import { ApiError, type Game, type Media, type QuizSnapshot, type ScoreEventDto, type SessionApi, type SessionRole } from '@/api/types'
import { loadSession, saveSession } from './bus'
import {
  EngineError,
  addPlayer,
  addScore,
  applyCommand,
  createSession,
  patchPlayer,
  removePlayer,
  setScore,
  toQuizSnapshot,
  voidScore,
  type Command,
  type SessionState,
} from './engine'

// Моковая реализация API сессий для работы без бэка: одна активная сессия на браузер,
// состояние лежит в localStorage (см. bus.ts), снимки отдаются в формате настоящего API.

let cache: { gameId: string; game: Game; media: Media[] } | null = null

async function statics(state: SessionState) {
  if (!cache || cache.gameId !== state.gameId) {
    cache = { gameId: state.gameId, game: await mockApi.getGame(state.gameId), media: await mockApi.listMedia() }
  }
  return cache
}

/** Снимок для нужной роли. Используется и REST-слоем, и «живым» каналом для экрана. */
export async function mockSnapshot(role: SessionRole): Promise<QuizSnapshot | null> {
  const state = loadSession()
  if (!state) return null
  const { game, media } = await statics(state)
  return toQuizSnapshot(state, game, media, role)
}

function current(id: string, expectedVersion?: number): SessionState {
  const state = loadSession()
  if (!state || state.id !== id) throw new ApiError(404, 'NOT_FOUND', 'Сессия не найдена')
  if (expectedVersion !== undefined && expectedVersion !== state.version) {
    throw new ApiError(409, 'VERSION_MISMATCH', 'Состояние уже изменилось, обновите данные')
  }
  return state
}

// Применить изменение, сохранить и вернуть снимок для пульта
async function commit(id: string, expectedVersion: number | undefined, fn: (s: SessionState, game: Game) => SessionState): Promise<QuizSnapshot> {
  const state = current(id, expectedVersion)
  const { game, media } = await statics(state)
  try {
    const next = fn(state, game)
    saveSession(next)
    return toQuizSnapshot(next, game, media, 'host')
  } catch (e) {
    if (e instanceof EngineError) throw new ApiError(409, e.code, e.message)
    throw e
  }
}

const unsupported = (type: string): never => {
  throw new ApiError(409, 'INVALID_TRANSITION', `Команда «${type}» работает только на настоящем бэке (демо-режим её не поддерживает)`)
}

function toEngineCommand(type: string, payload: Record<string, unknown> = {}): Command {
  switch (type) {
    case 'start':
    case 'next_round':
    case 'show_board':
    case 'start_timer':
    case 'reveal_answer':
    case 'reveal_hint':
    case 'finish':
    case 'back':
      return { type }
    case 'goto_round':
      return { type, roundId: String(payload.roundId) }
    case 'open_question':
      return { type, questionId: String(payload.questionId) }
    case 'set_active':
      return { type, participantId: (payload.participantId as string | null) ?? null }
    default:
      return unsupported(type)
  }
}

export const mockSessionApi: SessionApi = {
  async listSessions() {
    const s = loadSession()
    return s ? [{ id: s.id, gameId: s.gameId, status: s.status, hostName: s.hostName || null }] : []
  },

  async createSession({ gameId, participantIds, hostName }) {
    const game = await mockApi.getGame(gameId)
    const all = await mockApi.listParticipants()
    const players = participantIds
      .map((id) => all.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, photoMediaId: p.photoMediaId, startScore: p.defaultStartScore }))
    const state = createSession(game, players, hostName ?? '')
    saveSession(state)
    cache = null
    return {
      session: { id: state.id, gameId, status: state.status, hostName: hostName ?? null },
      screenToken: 'demo',
      screenUrl: null,
      snapshot: (await mockSnapshot('host'))!,
    }
  },

  async getSession(id) {
    current(id)
    return (await mockSnapshot('host'))!
  },

  async deleteSession(id) {
    current(id)
    saveSession(null)
  },

  sendCommand: (id, cmd) => commit(id, cmd.expectedVersion, (s, g) => applyCommand(s, toEngineCommand(cmd.type, cmd.payload), g)),

  async rotateScreenToken() {
    return { screenToken: 'demo', screenUrl: null }
  },

  async listScores(id) {
    const s = current(id)
    return [...s.events].reverse().map(
      (e): ScoreEventDto => ({
        id: e.id,
        participantId: e.participantId,
        kind: e.kind,
        delta: e.delta,
        reason: e.reason || null,
        questionId: e.questionId,
        voided: e.voided,
        createdAt: e.at,
      }),
    )
  },

  addScore: (id, input) => commit(id, input.expectedVersion, (s) => addScore(s, input)),
  setScore: (id, input) => commit(id, input.expectedVersion, (s) => setScore(s, input.participantId, input.total, input.reason)),
  voidScore: (id, eventId, expectedVersion) => commit(id, expectedVersion, (s) => voidScore(s, eventId)),

  async addSessionPlayer(id, input) {
    const all = await mockApi.listParticipants()
    const p = all.find((x) => x.id === input.participantId)
    if (!p) throw new ApiError(422, 'PARTICIPANT_NOT_FOUND', 'Игрок не найден')
    return commit(id, input.expectedVersion, (s) =>
      addPlayer(s, { id: p.id, name: p.name, color: p.color, photoMediaId: p.photoMediaId, startScore: input.startScore ?? p.defaultStartScore }),
    )
  },

  patchSessionPlayer: (id, participantId, input) => commit(id, input.expectedVersion, (s) => patchPlayer(s, participantId, input)),
  removeSessionPlayer: (id, participantId, expectedVersion) => commit(id, expectedVersion, (s) => removePlayer(s, participantId)),
}
