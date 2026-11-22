<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown.self="emit('close')">
      <div class="modal" :class="{ wide }" role="dialog" aria-modal="true">
        <header class="row-between modal-head">
          <h2>{{ title }}</h2>
          <button class="btn btn-icon" aria-label="Закрыть" @click="emit('close')">✕</button>
        </header>
        <div class="modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(5, 8, 18, 0.7);
}

.modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 92vh;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.modal.wide {
  max-width: 680px;
}

.modal-head {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--line);
}
</style>
