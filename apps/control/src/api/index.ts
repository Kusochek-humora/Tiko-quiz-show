import { mockSessionApi } from '@/demo/mockSessions'
import { httpApi, httpSessionApi } from './http'
import { mockApi } from './mock'
import type { Api, SessionApi } from './types'

// Моки включаются, если VITE_API_URL не задан или VITE_USE_MOCK=true
export const isMock = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_API_URL

export const api: Api & SessionApi = isMock ? { ...mockApi, ...mockSessionApi } : { ...httpApi, ...httpSessionApi }

export * from './types'
export { TOKEN_KEY, authHooks, absUrl, baseUrl } from './http'
