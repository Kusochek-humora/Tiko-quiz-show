import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type Media } from '@/api'

export const useMediaStore = defineStore('media', () => {
  const items = ref<Media[]>([])
  const loaded = ref(false)
  const byId = computed(() => new Map(items.value.map((m) => [m.id, m])))

  // Несколько компонентов могут вызвать load одновременно: запрос делаем один раз
  let pending: Promise<void> | null = null

  function load(force = false): Promise<void> {
    if (loaded.value && !force) return Promise.resolve()
    if (pending && !force) return pending
    pending = (async () => {
      items.value = await api.listMedia()
      loaded.value = true
    })().finally(() => {
      pending = null
    })
    return pending
  }

  async function upload(file: File) {
    const media = await api.uploadMedia(file)
    items.value.unshift(media)
    return media
  }

  async function remove(id: string) {
    await api.deleteMedia(id)
    items.value = items.value.filter((m) => m.id !== id)
  }

  return { items, loaded, byId, load, upload, remove }
})
