<script setup lang="ts">
import type { Media } from '@/api'

defineProps<{ media: Media }>()
</script>

<template>
  <div class="thumb">
    <img v-if="media.type === 'image'" :src="media.url" :alt="media.originalName" loading="lazy" />
    <span v-else class="ico">{{ media.type === 'audio' ? '♪' : '▶' }}</span>
  </div>
</template>

<style scoped>
.thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--bg);
  overflow: hidden;
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ico {
  font-size: 28px;
  color: var(--muted);
}
</style>
