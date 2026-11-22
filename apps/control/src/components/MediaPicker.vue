<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMediaStore } from '@/stores/media'
import BaseModal from './BaseModal.vue'
import MediaThumb from './MediaThumb.vue'

import type { MediaType } from '@/api'

// compact — маленькая круглая аватарка вместо полной панели (для фото игроков)
const props = defineProps<{ type?: MediaType; compact?: boolean }>()
const model = defineModel<string | null>({ default: null })
const store = useMediaStore()

const items = computed(() => store.items.filter((m) => !props.type || m.type === props.type))
const accept = computed(() => (props.type ? `${props.type}/*` : 'image/*,audio/*,video/*'))

const open = ref(false)
const uploading = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => store.load().catch(() => {}))

const selected = computed(() => (model.value ? store.byId.get(model.value) ?? null : null))

function pick(id: string) {
  model.value = id
  open.value = false
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  uploading.value = true
  try {
    const media = await store.upload(file)
    pick(media.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить файл'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<template>
  <div v-if="compact" class="compact">
    <button type="button" class="avatar" :title="selected ? 'Сменить фото' : 'Добавить фото'" @click="open = true">
      <MediaThumb v-if="selected" :media="selected" />
      <span v-else class="plus">+</span>
    </button>
    <button v-if="model" type="button" class="btn btn-sm btn-icon btn-danger" title="Убрать фото" @click="model = null">✕</button>
  </div>
  <div v-else class="picker">
    <div class="preview">
      <MediaThumb v-if="selected" :media="selected" />
      <span v-else class="muted">нет</span>
    </div>
    <div class="actions">
      <button type="button" class="btn btn-sm" @click="open = true">{{ selected ? 'Заменить' : 'Выбрать' }}</button>
      <button v-if="model" type="button" class="btn btn-sm btn-danger" @click="model = null">Убрать</button>
      <span v-if="selected" class="muted name">{{ selected.originalName }}</span>
    </div>
  </div>

  <BaseModal v-if="open" title="Выбор файла" wide @close="open = false">
    <div class="row" style="margin-bottom: 14px">
      <input ref="fileInput" type="file" :accept="accept" hidden @change="onFiles" />
      <button type="button" class="btn btn-primary btn-sm" :disabled="uploading" @click="fileInput?.click()">
        {{ uploading ? 'Загрузка…' : 'Загрузить новый' }}
      </button>
      <span v-if="error" class="error">{{ error }}</span>
    </div>
    <p v-if="!items.length" class="empty">Подходящих файлов в библиотеке пока нет</p>
    <div v-else class="grid">
      <button v-for="m in items" :key="m.id" type="button" class="cell" :class="{ on: m.id === model }" @click="pick(m.id)">
        <MediaThumb :media="m" />
        <span class="cap">{{ m.originalName }}</span>
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.compact {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  width: 80px; /* фиксированная ширина, чтобы строки не прыгали, когда появляется кнопка «убрать» */
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px dashed var(--line);
  border-radius: 50%;
  background: var(--bg);
  overflow: hidden;
  cursor: pointer;
}

.avatar:hover {
  border-color: var(--accent);
}

.plus {
  color: var(--muted);
  font-size: 22px;
  line-height: 1;
}

.picker {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 54px;
  flex: none;
  border: 1px dashed var(--line);
  border-radius: 8px;
  overflow: hidden;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.cell {
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 2px solid var(--line);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--text);
  overflow: hidden;
  cursor: pointer;
}

.cell.on,
.cell:hover {
  border-color: var(--accent);
}

.cell > :first-child {
  height: 84px;
}

.cap {
  padding: 4px 6px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
