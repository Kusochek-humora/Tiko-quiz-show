<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { ContentBlock, Question, QuestionInput, QuestionKind, QuestionSettings } from '@/api'
import { useGamesStore } from '@/stores/games'
import { KIND_HINTS, KIND_LABELS, KIND_LIST, defaultSettings, textBlock, validateQuestion } from '@/kinds'
import BaseModal from './BaseModal.vue'
import ContentEditor from './ContentEditor.vue'
import KindSettings from './KindSettings.vue'

const props = defineProps<{
  themeId: string
  themeTitle: string
  question: Question | null
  defaultPrice: number
}>()
const emit = defineEmits<{ close: [] }>()

const games = useGamesStore()
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const q = props.question
const form = reactive({
  kind: (q?.kind ?? 'standard') as QuestionKind,
  price: q?.price ?? props.defaultPrice,
  timeLimitSec: (q?.timeLimitSec ?? null) as number | null,
  noPenalty: !!q?.settings?.noPenalty,
  settings: (q ? clone(q.settings) : defaultSettings('standard')) as QuestionSettings,
  content: (q ? clone(q.content) : [textBlock()]) as ContentBlock[],
  answerContent: (q ? clone(q.answerContent) : [textBlock()]) as ContentBlock[],
  comment: q?.comment ?? '',
})

// Смена механики сбрасывает её настройки на значения по умолчанию
watch(
  () => form.kind,
  (kind) => {
    form.settings = defaultSettings(kind)
  },
)

const error = ref('')
const saving = ref(false)

async function run(fn: () => Promise<unknown>) {
  saving.value = true
  error.value = ''
  try {
    await fn()
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка сохранения'
  } finally {
    saving.value = false
  }
}

function buildInput(): QuestionInput {
  const settings: QuestionSettings = clone(form.settings)
  if (form.noPenalty) settings.noPenalty = true
  else delete settings.noPenalty
  return {
    kind: form.kind,
    price: form.price,
    settings,
    content: clone(form.content),
    answerContent: clone(form.answerContent),
    comment: form.comment.trim(),
    timeLimitSec: form.timeLimitSec || null,
  }
}

function save() {
  error.value = validateQuestion({
    price: form.price,
    kind: form.kind,
    settings: form.settings,
    content: form.content,
    answerContent: form.answerContent,
    timeLimitSec: form.timeLimitSec || null,
  })
  if (error.value) return
  const input = buildInput()
  run(() => (props.question ? games.updateQuestion(props.question.id, input) : games.createQuestion(props.themeId, input)))
}

function remove() {
  if (!props.question || !confirm('Удалить вопрос?')) return
  run(() => games.deleteQuestion(props.question!.id))
}
</script>

<template>
  <BaseModal :title="question ? 'Вопрос' : 'Новый вопрос'" wide @close="emit('close')">
    <p class="muted theme">Тема: {{ themeTitle }}</p>

    <div class="field">
      <label>Механика</label>
      <select v-model="form.kind" class="select">
        <option v-for="k in KIND_LIST" :key="k" :value="k">{{ KIND_LABELS[k] }}</option>
      </select>
      <span class="muted hint">{{ KIND_HINTS[form.kind] }}</span>
    </div>

    <div class="two">
      <div class="field">
        <label>Цена</label>
        <input v-model.number="form.price" class="input" type="number" min="1" step="100" />
      </div>
      <div class="field">
        <label>Время на ответ, сек (необязательно)</label>
        <input v-model.number="form.timeLimitSec" class="input" type="number" min="1" placeholder="без таймера" />
      </div>
    </div>

    <label class="check"><input v-model="form.noPenalty" type="checkbox" /> Без риска: за неверный ответ баллы не снимаются</label>

    <div class="field">
      <label>Вопрос</label>
      <ContentEditor v-model="form.content" />
    </div>

    <KindSettings :key="form.kind" v-model="form.settings" :kind="form.kind" />

    <div class="field">
      <label>Ответ</label>
      <ContentEditor v-model="form.answerContent" />
    </div>

    <div class="field">
      <label>Заметка ведущему (на экран не попадает)</label>
      <textarea v-model="form.comment" class="textarea" />
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <template #footer>
      <button v-if="question" class="btn btn-danger" :disabled="saving" style="margin-right: auto" @click="remove">Удалить</button>
      <button class="btn" :disabled="saving" @click="emit('close')">Отмена</button>
      <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? 'Сохранение…' : 'Сохранить' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.theme {
  margin: 0 0 14px;
}

.hint {
  font-size: 13px;
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

@media (max-width: 560px) {
  .two {
    grid-template-columns: 1fr;
  }
}
</style>
