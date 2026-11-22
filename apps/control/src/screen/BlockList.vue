<script setup lang="ts">
import { absUrl, type ContentBlock, type QuizSnapshot } from '@/api'

const props = defineProps<{ blocks: ContentBlock[]; media: QuizSnapshot['media']; small?: boolean }>()

const url = (id?: string | null) => (id && props.media[id] ? absUrl(props.media[id].url) : null)

// Браузер может заблокировать автозапуск со звуком: для видео пробуем без звука,
// для аудио после первого клика по странице запуск разблокируется (см. ScreenPage)
function startMedia(el: unknown) {
  if (!(el instanceof HTMLMediaElement)) return
  el.play().catch(() => {
    if (el instanceof HTMLVideoElement) {
      el.muted = true
      el.play().catch(() => {})
    }
  })
}
</script>

<template>
  <template v-for="(b, i) in blocks" :key="i">
    <p v-if="b.type === 'text'" class="text" :class="{ small }">{{ b.text }}</p>
    <img v-else-if="b.type === 'image' && url(b.mediaId)" :src="url(b.mediaId)!" class="media" alt="" />
    <video v-else-if="b.type === 'video' && url(b.mediaId)" :ref="startMedia" :src="url(b.mediaId)!" class="media" autoplay loop playsinline />
    <template v-else-if="b.type === 'audio' && url(b.mediaId)">
      <audio :ref="startMedia" :src="url(b.mediaId)!" autoplay />
      <p class="audio">♪ Звучит аудио</p>
    </template>
  </template>
</template>

<style scoped>
.text {
  margin: 0;
  color: #fff;
  font-size: 3.4vw;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.text.small {
  font-size: 2.4vw;
}

.media {
  max-width: 100%;
  max-height: 28vh;
  border-radius: 0.8vw;
  object-fit: contain;
}

.audio {
  margin: 0;
  color: #cfd8ff;
  font-size: 2.4vw;
}
</style>
