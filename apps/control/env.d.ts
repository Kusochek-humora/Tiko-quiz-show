/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес бэка, например https://api.example.com. Если пусто, работает демо-режим на моках. */
  readonly VITE_API_URL?: string
  /** "true" принудительно включает моки, даже если VITE_API_URL задан */
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
