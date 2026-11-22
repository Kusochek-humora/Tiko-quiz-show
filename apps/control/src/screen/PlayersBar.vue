<script setup lang="ts">
import type { ScreenSnapshot } from '@/demo/engine'

defineProps<{ players: ScreenSnapshot['players']; activeId: string | null }>()

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
</script>

<template>
  <div class="bar">
    <div v-for="p in players" :key="p.id" class="card" :class="{ active: p.id === activeId }" :style="{ '--c': p.color }">
      <div class="photo">
        <img v-if="p.photoUrl" :src="p.photoUrl" :alt="p.name" />
        <span v-else class="ini">{{ initials(p.name) }}</span>
      </div>
      <div class="info">
        <span class="name">{{ p.name }}</span>
        <span :key="p.score" class="score" :class="{ neg: p.score < 0 }">{{ p.score }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  gap: 1.2vw;
  width: 100%;
}

.card {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 1vw;
  padding: 0.8vw 1.2vw;
  border: 0.25vw solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 1.2vw;
  background: rgba(8, 14, 40, 0.78);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.card.active {
  border-color: #39e08a;
  box-shadow: 0 0 2.4vw rgba(57, 224, 138, 0.55);
  transform: translateY(-0.6vw);
}

.photo {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 6vw;
  height: 6vw;
  border-radius: 50%;
  background: var(--c);
  overflow: hidden;
}

.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ini {
  color: #fff;
  font-size: 2.4vw;
  font-weight: 700;
}

.info {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.name {
  overflow: hidden;
  color: #cfd8ff;
  font-size: 1.7vw;
  font-weight: 600;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.score {
  color: #ffd84a;
  font-size: 3.4vw;
  font-weight: 800;
  line-height: 1.1;
}

.score.neg {
  color: #ff7a7a;
}

/* При изменении счёта число «подпрыгивает» (элемент пересоздаётся по :key) */
.score {
  transform-origin: left center;
  animation: bump 0.7s cubic-bezier(0.2, 1.3, 0.3, 1);
}

@keyframes bump {
  0% {
    transform: scale(1);
  }
  35% {
    color: #fff;
    text-shadow: 0 0 1.4vw #ffd84a;
    transform: scale(1.4);
  }
  100% {
    transform: scale(1);
  }
}
</style>
