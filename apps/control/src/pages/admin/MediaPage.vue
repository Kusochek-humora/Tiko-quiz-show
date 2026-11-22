<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMediaStore } from '@/stores/media'
import MediaThumb from '@/components/MediaThumb.vue'

const store = useMediaStore()
const error = ref('')
const uploading = ref(false)
const input = ref<HTMLInputElement | null>(null)

onMounted(() => store.load(true).catch((e) => (error.value = e.message)))

async function onFiles(e: Event) {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  error.value = ''
  uploading.value = true
  for (const file of files) {
    try {
      await store.upload(file)
    } catch (err) {
      error.value = `${file.name}: ${err instanceof Error ? err.message : 'ошибка загрузки'}`
    }
  }
  uploading.value = false
  el.value = ''
}

async function remove(id: string, name: string) {
  if (!confirm(`Удалить файл «${name}»?`)) return
  error.value = ''
  try {
    await store.remove(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось удалить'
  }
}

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`)
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Медиа</h1>
      <div>
        <input ref="input" type="file" multiple accept="image/*,audio/*,video/*" hidden @change="onFiles" />
        <button class="btn btn-primary" :disabled="uploading" @click="input?.click()">{{ uploading ? 'Загрузка…' : 'Загрузить файлы' }}</button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="!store.items.length" class="empty">Файлов пока нет</p>

    <div class="grid">
      <article v-for="m in store.items" :key="m.id" class="card item">
        <div class="thumb"><MediaThumb :media="m" /></div>
        <div class="name" :title="m.originalName">{{ m.originalName }}</div>
        <div class="row-between">
          <span class="muted small">{{ size(m.size) }}</span>
          <button class="btn btn-sm btn-danger" @click="remove(m.id, m.originalName)">Удалить</button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.thumb {
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.small {
  font-size: 13px;
}
</style>
