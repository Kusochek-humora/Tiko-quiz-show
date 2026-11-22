import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type Game, type GameSummary, type QuestionInput, type RoundInput } from '@/api'

export const useGamesStore = defineStore('games', () => {
  const list = ref<GameSummary[]>([])
  const game = ref<Game | null>(null)
  const loading = ref(false)

  async function loadList() {
    loading.value = true
    try {
      list.value = await api.listGames()
    } finally {
      loading.value = false
    }
  }

  async function load(id: string) {
    game.value = await api.getGame(id)
  }

  // Выполнить изменение и перечитать игру целиком: так состояние всегда совпадает с бэком
  async function mutate<T>(fn: () => Promise<T>): Promise<T> {
    const result = await fn()
    if (game.value) await load(game.value.id)
    return result
  }

  const createGame = async (title: string) => api.createGame({ title })
  const duplicateGame = async (id: string) => {
    await api.duplicateGame(id)
    await loadList()
  }
  const deleteGame = async (id: string) => {
    await api.deleteGame(id)
    await loadList()
  }

  const renameGame = (title: string) => mutate(() => api.updateGame(game.value!.id, { title }))

  const addRound = (title: string) => mutate(() => api.createRound(game.value!.id, { title }))
  const renameRound = (id: string, title: string) => mutate(() => api.updateRound(id, { title }))
  const updateRound = (id: string, patch: RoundInput) => mutate(() => api.updateRound(id, patch))
  const deleteRound = (id: string) => mutate(() => api.deleteRound(id))
  const reorderRounds = (ids: string[]) => mutate(() => api.reorderRounds(game.value!.id, ids))

  const addTheme = (roundId: string, title: string) => mutate(() => api.createTheme(roundId, { title }))
  const renameTheme = (id: string, title: string) => mutate(() => api.updateTheme(id, { title }))
  const deleteTheme = (id: string) => mutate(() => api.deleteTheme(id))
  const reorderThemes = (roundId: string, ids: string[]) => mutate(() => api.reorderThemes(roundId, ids))

  const createQuestion = (themeId: string, input: QuestionInput) => mutate(() => api.createQuestion(themeId, input))
  const updateQuestion = (id: string, input: Partial<QuestionInput>) => mutate(() => api.updateQuestion(id, input))
  const deleteQuestion = (id: string) => mutate(() => api.deleteQuestion(id))

  return {
    list,
    game,
    loading,
    loadList,
    load,
    createGame,
    duplicateGame,
    deleteGame,
    renameGame,
    addRound,
    renameRound,
    updateRound,
    deleteRound,
    reorderRounds,
    addTheme,
    renameTheme,
    deleteTheme,
    reorderThemes,
    createQuestion,
    updateQuestion,
    deleteQuestion,
  }
})
