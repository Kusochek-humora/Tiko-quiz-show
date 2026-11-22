import { baseUrl, isMock, TOKEN_KEY, type QuizSnapshot, type SessionRole } from '@/api'
import { subscribe } from '@/demo/bus'
import { mockSnapshot } from '@/demo/mockSessions'

// «Живой» канал состояния игры. На настоящем бэке это WebSocket (QUIZ_API.md, раздел 11),
// в демо-режиме подписка на изменения в соседних вкладках браузера.

export type LiveState = 'connecting' | 'open' | 'lost'

export interface LiveHandlers {
  onSnapshot: (snapshot: QuizSnapshot) => void
  onState?: (state: LiveState) => void
  /** Соединение закрыто окончательно (неверный токен, сессия удалена и т. п.), переподключаться не нужно */
  onClosed?: (reason: string) => void
}

export interface LiveOptions {
  sessionId: string
  role: SessionRole
  /** Для экрана: токен сессии. Для пульта: берётся JWT из localStorage. */
  token?: string
}

const CLOSE_REASONS: Record<number, string> = {
  4401: 'Неверный токен доступа',
  4404: 'Сессия не найдена',
  4410: 'Сессия закрыта',
}

/** Возвращает функцию, которая закрывает канал */
export function openLive(opts: LiveOptions, handlers: LiveHandlers): () => void {
  return isMock ? openMock(opts.role, handlers) : openSocket(opts, handlers)
}

function openMock(role: SessionRole, h: LiveHandlers): () => void {
  let alive = true
  const push = async () => {
    const snapshot = await mockSnapshot(role)
    if (alive && snapshot) h.onSnapshot(snapshot)
  }
  h.onState?.('open')
  void push()
  const off = subscribe(() => void push())
  return () => {
    alive = false
    off()
  }
}

function openSocket(opts: LiveOptions, h: LiveHandlers): () => void {
  const token = opts.role === 'host' ? (localStorage.getItem(TOKEN_KEY) ?? '') : (opts.token ?? '')
  // Без baseUrl (разработка через прокси) подключаемся к адресу самой страницы
  const wsBase = (baseUrl || location.origin).replace(/^http/, 'ws')
  const url = `${wsBase}/ws/sessions/${opts.sessionId}?role=${opts.role}&token=${encodeURIComponent(token)}`

  let ws: WebSocket | null = null
  let stopped = false
  let attempt = 0
  let pingTimer: number | undefined
  let retryTimer: number | undefined

  const connect = () => {
    h.onState?.('connecting')
    ws = new WebSocket(url)

    ws.onopen = () => {
      attempt = 0
      h.onState?.('open')
      // Сервер закрывает «мёртвые» соединения, поэтому раз в 20 секунд шлём ping
      pingTimer = window.setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, 20_000)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as { type: string; payload?: { snapshot?: QuizSnapshot; reason?: string } & QuizSnapshot }
        if (msg.type === 'snapshot' || msg.type === 'update') {
          h.onSnapshot((msg.payload?.snapshot ?? msg.payload) as QuizSnapshot)
        } else if (msg.type === 'session_closed') {
          stopped = true
          h.onClosed?.(msg.payload?.reason === 'token_rotated' ? 'Ссылка экрана перевыпущена, откройте новую' : 'Сессия удалена')
        }
      } catch {
        /* битое сообщение пропускаем */
      }
    }

    ws.onclose = (event) => {
      clearInterval(pingTimer)
      if (stopped) return
      if (CLOSE_REASONS[event.code]) {
        stopped = true
        h.onClosed?.(CLOSE_REASONS[event.code])
        return
      }
      // Обрыв связи: переподключаемся с нарастающей паузой, новый snapshot придёт сам
      h.onState?.('lost')
      attempt += 1
      retryTimer = window.setTimeout(connect, Math.min(5000, 1000 * attempt))
    }
  }

  connect()

  return () => {
    stopped = true
    clearInterval(pingTimer)
    clearTimeout(retryTimer)
    ws?.close()
  }
}
