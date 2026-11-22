<script setup lang="ts">
import type { BlockType, ContentBlock } from '@/api'
import { textBlock } from '@/kinds'
import MediaPicker from './MediaPicker.vue'

const model = defineModel<ContentBlock[]>({ required: true })

const LABELS: Record<BlockType, string> = { text: 'Текст', image: 'Картинка', audio: 'Аудио', video: 'Видео' }
const TYPES = Object.keys(LABELS) as BlockType[]

function add(type: BlockType) {
  model.value = [...model.value, type === 'text' ? textBlock() : { type, mediaId: null }]
}

function remove(i: number) {
  model.value = model.value.filter((_, idx) => idx !== i)
}

function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= model.value.length) return
  const next = [...model.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  model.value = next
}
</script>

<template>
  <div class="blocks">
    <div v-for="(b, i) in model" :key="i" class="block">
      <div class="head">
        <span class="tag">{{ LABELS[b.type] }}</span>
        <span class="tools">
          <button type="button" class="btn btn-sm btn-icon" :disabled="i === 0" title="Выше" @click="move(i, -1)">↑</button>
          <button type="button" class="btn btn-sm btn-icon" :disabled="i === model.length - 1" title="Ниже" @click="move(i, 1)">↓</button>
          <button type="button" class="btn btn-sm btn-icon btn-danger" title="Убрать блок" @click="remove(i)">✕</button>
        </span>
      </div>
      <textarea v-if="b.type === 'text'" v-model="b.text" class="textarea" />
      <MediaPicker v-else :model-value="b.mediaId ?? null" :type="b.type" @update:model-value="b.mediaId = $event" />
    </div>

    <p v-if="!model.length" class="muted empty-note">Блоков пока нет</p>

    <div class="add row">
      <span class="muted">Добавить:</span>
      <button v-for="t in TYPES" :key="t" type="button" class="btn btn-sm" @click="add(t)">+ {{ LABELS[t] }}</button>
    </div>
  </div>
</template>

<style scoped>
.blocks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block {
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-2);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tag {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tools {
  display: flex;
  gap: 4px;
}

.empty-note {
  margin: 0;
}

.add {
  flex-wrap: wrap;
  gap: 6px;
}
</style>
