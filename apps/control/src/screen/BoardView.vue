<script setup lang="ts">
import { computed } from 'vue'
import type { QuizSnapshot } from '@/api'

const props = defineProps<{ board: NonNullable<QuizSnapshot['board']> }>()

const maxCells = computed(() => Math.max(1, ...props.board.themes.map((t) => t.cells.length)))
const pad = (n: number) => Array.from({ length: maxCells.value - n })
</script>

<template>
  <div class="board" data-board :style="{ '--n': maxCells }">
    <div v-for="(t, ri) in board.themes" :key="t.id" class="row" :class="{ out: t.eliminated }">
      <div class="theme" :style="{ '--d': `${ri * 90}ms` }">{{ t.title }}</div>
      <div
        v-for="(c, ci) in t.cells"
        :key="c.questionId"
        class="cell"
        :class="{ played: c.played || t.eliminated }"
        :data-cell="c.questionId"
        :style="{ '--d': `${ri * 90 + (ci + 1) * 60}ms` }"
      >
        {{ c.played || t.eliminated ? '' : c.price }}
      </div>
      <div v-for="(_, i) in pad(t.cells.length)" :key="`pad-${i}`" class="cell played"></div>
    </div>
  </div>
</template>

<style scoped>
/* Grid, чтобы все ячейки строки гарантированно тянулись на её высоту */
.board {
  display: grid;
  flex: 1;
  grid-auto-rows: minmax(0, 1fr);
  gap: 0.6vw;
  width: 100%;
  min-height: 0;
}

.row {
  display: grid;
  grid-template-columns: 30% repeat(var(--n), minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch; /* перебивает глобальный .row { align-items: center } */
  gap: 0.6vw;
  min-height: 0;
}

.row.out .theme {
  opacity: 0.3;
  text-decoration: line-through;
}

.theme {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1.2vw;
  border: 0.15vw solid #4a66d0;
  border-radius: 0.6vw;
  background: linear-gradient(#2a4bc0, #1b3590);
  color: #fff;
  font-size: 2.2vw;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  text-transform: uppercase;
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.15vw solid #4a66d0;
  border-radius: 0.6vw;
  background: linear-gradient(#2d52d6, #1c3a9e);
  color: #ffd84a;
  font-size: 4.2vw;
  font-weight: 800;
  text-shadow: 0.15vw 0.15vw 0 rgba(0, 0, 0, 0.35);
}

.cell.played {
  border-color: rgba(74, 102, 208, 0.18);
  background: rgba(14, 24, 70, 0.45);
}

/* Поле собирается волной: темы выезжают слева, ячейки «выпрыгивают» по очереди */
.theme {
  animation: theme-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  animation-delay: var(--d, 0ms);
}

.cell {
  animation: cell-in 0.5s cubic-bezier(0.2, 1.25, 0.3, 1) both;
  animation-delay: var(--d, 0ms);
}

@keyframes theme-in {
  from {
    opacity: 0;
    transform: translateX(-4vw);
  }
}

@keyframes cell-in {
  from {
    opacity: 0;
    transform: scale(0.55);
  }
}
</style>
