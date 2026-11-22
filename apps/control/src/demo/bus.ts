import type { SessionState } from './engine'

// Канал между пультом и экраном в демо-режиме: состояние лежит в localStorage,
// об изменениях сообщаем через BroadcastChannel (работает между вкладками одного браузера).
// Когда появится бэк, это заменится на REST и WebSocket.

const KEY = 'quiz.demo.session'

let channel: BroadcastChannel | null = null
try {
  channel = new BroadcastChannel('quiz-demo')
} catch {
  /* нет поддержки: останется событие storage */
}

export function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SessionState) : null
  } catch {
    return null
  }
}

export function saveSession(state: SessionState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state))
    else localStorage.removeItem(KEY)
  } catch {
    /* хранилище недоступно */
  }
  channel?.postMessage('changed')
}

export function subscribe(cb: (state: SessionState | null) => void): () => void {
  const onMessage = () => cb(loadSession())
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb(loadSession())
  }
  channel?.addEventListener('message', onMessage)
  window.addEventListener('storage', onStorage)
  return () => {
    channel?.removeEventListener('message', onMessage)
    window.removeEventListener('storage', onStorage)
  }
}
