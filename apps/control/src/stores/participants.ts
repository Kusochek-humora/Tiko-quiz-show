import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type Participant } from '@/api'

export const useParticipantsStore = defineStore('participants', () => {
  const items = ref<Participant[]>([])

  async function load() {
    items.value = await api.listParticipants()
  }

  async function create(name: string, color: string, defaultStartScore = 0, photoMediaId: string | null = null) {
    await api.createParticipant({ name, color, defaultStartScore, photoMediaId })
    await load()
  }

  async function update(id: string, input: Partial<Pick<Participant, 'name' | 'color' | 'photoMediaId' | 'defaultStartScore'>>) {
    await api.updateParticipant(id, input)
    await load()
  }

  async function remove(id: string) {
    await api.deleteParticipant(id)
    await load()
  }

  return { items, load, create, update, remove }
})
