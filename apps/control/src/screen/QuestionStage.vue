<script setup lang="ts">
import type { RBlock, ScreenSnapshot } from '@/demo/engine'

defineProps<{ q: NonNullable<ScreenSnapshot['question']>; revealed: boolean; countdown: number | null }>()

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// Шаблон «___» превращаем в части: текст и пропуски
const parts = (template: string) => String(template ?? '').split('___')

const isMedia = (b: RBlock) => b.type !== 'text'
</script>

<template>
  <div class="stage">
    <div class="top">
      <span class="price">{{ q.price }}</span>
      <span v-if="q.kind !== 'standard'" class="kind">{{ q.kindLabel }}</span>
      <span v-if="countdown !== null" class="timer" :class="{ low: countdown <= 5 }">{{ countdown }}</span>
    </div>

    <div class="body">
      <!-- Содержимое вопроса -->
      <div class="content" :class="{ small: revealed }">
        <template v-for="(b, i) in q.content" :key="i">
          <p v-if="b.type === 'text'" class="text">{{ b.text }}</p>
          <img v-else-if="b.type === 'image' && b.url" :src="b.url" class="media" alt="" />
          <video v-else-if="b.type === 'video' && b.url" :src="b.url" class="media" autoplay muted loop playsinline />
          <audio v-else-if="b.type === 'audio' && b.url" :src="b.url" autoplay />
          <p v-if="isMedia(b) && b.type === 'audio'" class="audio">♪ Звучит аудио</p>
        </template>
      </div>

      <!-- Механики -->
      <div v-if="q.kind === 'options'" class="options">
        <div
          v-for="(o, i) in q.view.options"
          :key="o.id"
          class="opt"
          :class="{ right: revealed && o.isCorrect, dim: revealed && !o.isCorrect }"
        >
          <b>{{ LETTERS[Number(i)] }}</b>{{ o.text }}
        </div>
      </div>

      <div v-else-if="q.kind === 'true_false'" class="options two">
        <div class="opt" :class="{ right: revealed && q.view.correct === true, dim: revealed && q.view.correct !== true }">Верю</div>
        <div class="opt" :class="{ right: revealed && q.view.correct === false, dim: revealed && q.view.correct !== false }">Не верю</div>
      </div>
      <p v-if="q.kind === 'true_false' && revealed && q.view.explanation" class="note">{{ q.view.explanation }}</p>

      <div v-else-if="q.kind === 'hints'" class="hints">
        <div v-for="(h, i) in q.view.opened" :key="i" class="hint"><b>{{ Number(i) + 1 }}</b>{{ h }}</div>
        <div v-if="q.view.opened.length < q.view.total" class="hint closed">Подсказок осталось: {{ q.view.total - q.view.opened.length }}</div>
      </div>

      <div v-else-if="q.kind === 'ordering'" class="options">
        <div v-for="(it, i) in q.view.items" :key="it.id" class="opt" :class="{ right: q.view.correctOrder }">
          <b>{{ q.view.correctOrder ? Number(i) + 1 : '•' }}</b>{{ it.text }}
        </div>
      </div>

      <div v-else-if="q.kind === 'matching'" class="match">
        <div class="col">
          <div v-for="(l, i) in q.view.left" :key="i" class="opt">{{ l }}</div>
        </div>
        <div class="col">
          <div v-for="(r, i) in q.view.right" :key="i" class="opt" :class="{ right: q.view.matched }">{{ r }}</div>
        </div>
      </div>

      <p v-else-if="q.kind === 'fill_blank'" class="text blank">
        <template v-for="(p, i) in parts(q.view.template)" :key="i">
          {{ p }}<span v-if="i < parts(q.view.template).length - 1" class="gap" :class="{ filled: q.view.blanks }">{{ q.view.blanks ? q.view.blanks[i] : '' }}</span>
        </template>
      </p>

      <div v-else-if="q.kind === 'word_guess'" class="word">
        <span class="mask">{{ [...q.view.mask].join(' ') }}</span>
        <span v-if="q.view.hint" class="note">{{ q.view.hint }}</span>
      </div>

      <img v-else-if="q.kind === 'reveal_image' && q.view.url" :src="q.view.url" class="media" :class="{ blur: !revealed }" alt="" />

      <p v-else-if="q.kind === 'blitz'" class="note">Блиц: {{ q.view.count }} вопросов по {{ q.view.points }}</p>
      <p v-else-if="q.kind === 'cat_in_bag' && q.view.teaser" class="note">{{ q.view.teaser }}</p>

      <!-- Ответ -->
      <div v-if="revealed && q.answerContent" class="answer">
        <span class="label">Ответ</span>
        <template v-for="(b, i) in q.answerContent" :key="i">
          <p v-if="b.type === 'text'" class="text ans">{{ b.text }}</p>
          <img v-else-if="b.type === 'image' && b.url" :src="b.url" class="media" alt="" />
          <video v-else-if="b.type === 'video' && b.url" :src="b.url" class="media" autoplay muted loop playsinline />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 1.4vw 2vw;
  border: 0.2vw solid #4a66d0;
  border-radius: 1.2vw;
  background: linear-gradient(#1c3a9e, #112463);
}

.top {
  display: flex;
  align-items: center;
  gap: 1.5vw;
  min-height: 4.6vw;
}

.price {
  color: #ffd84a;
  font-size: 3.6vw;
  font-weight: 800;
}

.kind {
  padding: 0.3vw 1.2vw;
  border: 0.15vw solid #ffd84a;
  border-radius: 99vw;
  color: #ffd84a;
  font-size: 1.5vw;
  text-transform: uppercase;
}

.timer {
  margin-left: auto;
  color: #fff;
  font-size: 4vw;
  font-weight: 800;
}

.timer.low {
  color: #ff6b6b;
}

.body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.4vw;
  overflow: hidden;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1vw;
  max-width: 100%;
  min-height: 0;
}

.content.small .text {
  font-size: 2.4vw;
  opacity: 0.6;
}

.text {
  margin: 0;
  color: #fff;
  font-size: 3.4vw;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.media {
  max-width: 100%;
  max-height: 28vh;
  border-radius: 0.8vw;
  object-fit: contain;
}

.media.blur {
  filter: blur(2.2vw);
}

.audio {
  margin: 0;
  color: #cfd8ff;
  font-size: 2.4vw;
}

.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1vw;
  width: 100%;
}

.options.two {
  max-width: 70%;
}

.opt {
  display: flex;
  align-items: center;
  gap: 1vw;
  padding: 1vw 1.4vw;
  border: 0.15vw solid #4a66d0;
  border-radius: 0.8vw;
  background: rgba(8, 14, 40, 0.5);
  color: #fff;
  font-size: 2.2vw;
  font-weight: 600;
}

.opt b {
  color: #ffd84a;
}

.opt.right {
  border-color: #39e08a;
  background: rgba(57, 224, 138, 0.22);
}

.opt.dim {
  opacity: 0.35;
}

.match {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2vw;
  width: 100%;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 0.8vw;
}

.hints {
  display: flex;
  flex-direction: column;
  gap: 0.8vw;
  width: 80%;
}

.hint {
  display: flex;
  gap: 1vw;
  padding: 0.8vw 1.4vw;
  border-radius: 0.8vw;
  background: rgba(8, 14, 40, 0.5);
  color: #fff;
  font-size: 2.2vw;
}

.hint b {
  color: #ffd84a;
}

.hint.closed {
  color: #8d99bd;
  font-style: italic;
}

.blank .gap {
  display: inline-block;
  min-width: 8vw;
  margin: 0 0.5vw;
  border-bottom: 0.25vw solid #ffd84a;
  color: #39e08a;
}

.word {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1vw;
}

.mask {
  color: #fff;
  font-size: 5vw;
  font-weight: 800;
  letter-spacing: 0.3vw;
}

.note {
  margin: 0;
  color: #cfd8ff;
  font-size: 2vw;
  text-align: center;
}

.answer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6vw;
  padding: 1vw 3vw;
  border-radius: 1vw;
  background: rgba(57, 224, 138, 0.18);
}

.label {
  color: #39e08a;
  font-size: 1.4vw;
  letter-spacing: 0.2vw;
  text-transform: uppercase;
}

.ans {
  color: #fff;
  font-size: 3.6vw;
}

/* ---------- анимация ---------- */

/* Вопрос разворачивается из ячейки, на которую нажали (--dx, --dy, --sx, --sy задаёт ScreenPage) */
.stage {
  animation: zoom-from-cell 0.65s cubic-bezier(0.2, 0.85, 0.25, 1) both;
}

/* Содержимое появляется чуть позже и каскадом */
.top {
  animation: fade-in 0.4s 0.35s both;
}

.body > * {
  animation: rise 0.55s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  animation-delay: calc(0.4s + var(--i, 0) * 90ms);
}

.options > :nth-child(2),
.match .col > :nth-child(2),
.hints > :nth-child(2) {
  --i: 1;
}
.options > :nth-child(3),
.match .col > :nth-child(3) {
  --i: 2;
}
.options > :nth-child(4),
.match .col > :nth-child(4) {
  --i: 3;
}
.options > :nth-child(5) {
  --i: 4;
}
.options > :nth-child(n + 6) {
  --i: 5;
}

.opt {
  transition: background 0.4s, border-color 0.4s, opacity 0.4s, transform 0.4s;
}

.opt.right {
  transform: scale(1.03);
}

/* Новая подсказка выезжает сразу, без общей задержки */
.hint {
  animation: rise 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
}

/* Ответ всплывает с лёгким «подпрыгиванием» */
.answer {
  animation: pop 0.6s cubic-bezier(0.2, 1.3, 0.3, 1) both;
  animation-delay: 0s;
}

.timer.low {
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes zoom-from-cell {
  from {
    opacity: 0;
    filter: brightness(1.8);
    transform: translate(var(--dx, 0px), var(--dy, 0px)) scale(var(--sx, 0.6), var(--sy, 0.6));
  }
  35% {
    opacity: 1;
  }
  to {
    opacity: 1;
    filter: none;
    transform: none;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(2.2vw) scale(0.97);
  }
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}

@keyframes pulse {
  50% {
    transform: scale(1.18);
  }
}
</style>
