<script setup lang="ts">
import { computed } from 'vue'
import { absUrl, type QuizPlayer, type QuizQuestion, type QuizSnapshot } from '@/api'
import { KIND_LABELS } from '@/kinds'
import BlockList from './BlockList.vue'

// Сцена вопроса. Формы question.view для каждой механики описаны в QUIZ_API.md, раздел 6.
// Экран только рисует то, что прислал бэк: скрытые ответы сюда просто не приходят.

const props = defineProps<{ q: QuizQuestion; media: QuizSnapshot['media']; players: QuizPlayer[]; revealed: boolean; countdown: number | null }>()

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const v = computed(() => props.q.view ?? {})
const prepare = computed(() => props.q.phase === 'prepare')
const kindLabel = computed(() => KIND_LABELS[props.q.kind])

const url = (id?: string | null) => (id && props.media[id] ? absUrl(props.media[id].url) : null)
const nameOf = (id?: string | null) => props.players.find((p) => p.id === id)?.name ?? ''

const parts = (template: string) => String(template ?? '').split('___')

// Супер-игра: финалисты и ставки (до ответа приходит только факт ставки)
const finalInfo = computed(() => v.value.final as { finalists: string[]; stakes: Record<string, number | true> } | undefined)

const bids = computed(() => [...(v.value.bids ?? [])].sort((a: { amount: number }, b: { amount: number }) => b.amount - a.amount))

// «Расставить по порядку»: после ответа приходит correctOrder (id в верном порядке)
const orderedItems = computed(() => {
  const items: { id: string; text?: string; mediaId?: string }[] = v.value.items ?? []
  const order: string[] | undefined = v.value.correctOrder
  return order ? order.map((id) => items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i) : items
})

// «Сопоставление»: после ответа приходят пары
const matched = computed(() => {
  const left: { id: string; text?: string }[] = v.value.left ?? []
  const right: { id: string; text?: string }[] = v.value.right ?? []
  const pairs: { leftId: string; rightId: string }[] | undefined = v.value.pairs
  return pairs?.map((p) => ({ l: left.find((x) => x.id === p.leftId)?.text ?? '', r: right.find((x) => x.id === p.rightId)?.text ?? '' }))
})

// Открывающаяся картинка: чем больше шагов открыто, тем меньше размытие
const blur = computed(() => {
  const steps = Number(v.value.steps) || 1
  const step = Number(v.value.step) || 0
  return `${Math.max(0, 1 - step / steps) * 3}vw`
})
</script>

<template>
  <div class="stage">
    <div class="top">
      <span class="price">{{ q.price }}</span>
      <span v-if="q.kind !== 'standard'" class="kind">{{ kindLabel }}</span>
      <span class="theme">{{ q.themeTitle }}</span>
      <span v-if="countdown !== null" class="timer" :class="{ low: countdown <= 5 }">{{ countdown }}</span>
    </div>

    <div class="body">
      <!-- Фаза подготовки: заставка механики без содержимого вопроса -->
      <div v-if="prepare" class="splash">
        <h2>{{ finalInfo ? 'Супер-игра' : kindLabel }}</h2>
        <p v-if="v.teaser" class="note">{{ v.teaser }}</p>
        <p v-if="q.kind === 'cat_in_bag' && v.recipientId" class="note">Вопрос достаётся: <b>{{ nameOf(v.recipientId) }}</b></p>

        <div v-if="q.kind === 'auction'" class="bids">
          <p class="note">Стартовая ставка: {{ v.startBid }}</p>
          <div v-for="b in bids" :key="b.participantId" class="bid"><span>{{ nameOf(b.participantId) }}</span><b>{{ b.amount }}</b></div>
          <p v-if="v.closed && v.winnerId" class="note">Торги выиграл <b>{{ nameOf(v.winnerId) }}</b> за {{ v.winningBid }}</p>
        </div>

        <div v-if="q.kind === 'stake'" class="bids">
          <p v-if="v.stake" class="note"><b>{{ nameOf(v.participantId) }}</b> ставит {{ v.stake }}</p>
          <p v-else class="note">Ожидаем ставку</p>
        </div>

        <div v-if="finalInfo" class="chips">
          <div v-for="id in finalInfo.finalists" :key="id" class="chip">
            <span>{{ nameOf(id) }}</span>
            <b>{{ finalInfo.stakes?.[id] === undefined ? 'думает…' : typeof finalInfo.stakes[id] === 'number' ? finalInfo.stakes[id] : 'ставка сделана' }}</b>
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Содержимое вопроса -->
        <div v-if="q.content.length" class="content" :class="{ shrink: revealed }">
          <BlockList :blocks="q.content" :media="media" :small="revealed" />
        </div>

        <!-- Механики -->
        <div v-if="q.kind === 'options'" class="options">
          <div v-for="(o, i) in v.options" :key="o.id" class="opt" :class="{ right: revealed && o.isCorrect === true, dim: revealed && o.isCorrect === false }">
            <b>{{ LETTERS[Number(i)] }}</b>
            <img v-if="url(o.mediaId)" :src="url(o.mediaId)!" class="thumb" alt="" />
            <span>{{ o.text }}</span>
          </div>
        </div>

        <template v-else-if="q.kind === 'true_false'">
          <div class="options two">
            <div class="opt" :class="{ right: v.correct === true, dim: v.correct === false }">Верю</div>
            <div class="opt" :class="{ right: v.correct === false, dim: v.correct === true }">Не верю</div>
          </div>
          <p v-if="v.explanation" class="note">{{ v.explanation }}</p>
        </template>

        <div v-else-if="q.kind === 'hints'" class="hints">
          <div v-for="(h, i) in v.hints" :key="i" class="hint">
            <b>{{ Number(i) + 1 }}</b>
            <img v-if="url(h.mediaId)" :src="url(h.mediaId)!" class="thumb" alt="" />
            <span>{{ h.text }}</span>
          </div>
          <div v-if="v.hintsShown < v.hintsTotal" class="hint closed">Подсказок осталось: {{ v.hintsTotal - v.hintsShown }}</div>
        </div>

        <template v-else-if="q.kind === 'cat_in_bag'">
          <p v-if="v.recipientId" class="note">Отвечает: <b>{{ nameOf(v.recipientId) }}</b>, вопрос за {{ v.price }}</p>
        </template>

        <template v-else-if="q.kind === 'auction'">
          <p v-if="v.winnerId" class="note">Отвечает: <b>{{ nameOf(v.winnerId) }}</b>, ставка {{ v.winningBid }}</p>
        </template>

        <template v-else-if="q.kind === 'stake'">
          <p v-if="v.stake" class="note"><b>{{ nameOf(v.participantId) }}</b> поставил {{ v.stake }}</p>
        </template>

        <template v-else-if="q.kind === 'blitz'">
          <p class="note">Вопрос {{ Number(v.index) + 1 }} из {{ v.total }}</p>
          <div class="content"><BlockList :blocks="v.item?.content ?? []" :media="media" /></div>
          <div v-if="v.answers" class="hints">
            <div v-for="(a, i) in v.answers" :key="i" class="hint"><b>{{ Number(i) + 1 }}</b><span><BlockList :blocks="a" :media="media" small /></span></div>
          </div>
        </template>

        <img v-else-if="q.kind === 'reveal_image' && url(v.mediaId)" :src="url(v.mediaId)!" class="pic" :style="{ filter: `blur(${blur})` }" alt="" />

        <div v-else-if="q.kind === 'ordering'" class="options">
          <div v-for="(it, i) in orderedItems" :key="it.id" class="opt" :class="{ right: !!v.correctOrder }">
            <b>{{ v.correctOrder ? Number(i) + 1 : '•' }}</b>
            <img v-if="url(it.mediaId)" :src="url(it.mediaId)!" class="thumb" alt="" />
            <span>{{ it.text }}</span>
          </div>
        </div>

        <template v-else-if="q.kind === 'matching'">
          <div v-if="matched" class="options">
            <div v-for="(m, i) in matched" :key="i" class="opt right"><span>{{ m.l }}</span><b>—</b><span>{{ m.r }}</span></div>
          </div>
          <div v-else class="match">
            <div class="col"><div v-for="l in v.left" :key="l.id" class="opt">{{ l.text }}</div></div>
            <div class="col"><div v-for="r in v.right" :key="r.id" class="opt">{{ r.text }}</div></div>
          </div>
        </template>

        <p v-else-if="q.kind === 'fill_blank'" class="blank">
          <template v-for="(p, i) in parts(v.template)" :key="i">
            {{ p }}<span v-if="i < parts(v.template).length - 1" class="gap" :class="{ filled: !!v.blanks }">{{ v.blanks ? v.blanks[i] : '' }}</span>
          </template>
        </p>

        <div v-else-if="q.kind === 'word_guess'" class="word">
          <span class="mask">
            <i v-for="(m, i) in v.mask" :key="i" :class="{ open: m.char }">{{ m.char ?? '' }}</i>
          </span>
          <span v-if="v.hint" class="note">{{ v.hint }}</span>
          <span v-if="v.letters?.length" class="note">Названы: {{ v.letters.join(' ') }}</span>
        </div>

        <!-- Финал: ставки открываются вместе с ответом -->
        <div v-if="finalInfo && revealed" class="chips">
          <div v-for="id in finalInfo.finalists" :key="id" class="chip">
            <span>{{ nameOf(id) }}</span>
            <b>{{ typeof finalInfo.stakes?.[id] === 'number' ? finalInfo.stakes[id] : '—' }}</b>
          </div>
        </div>

        <!-- Ответ -->
        <div v-if="revealed && q.answerContent?.length" class="answer">
          <span class="label">Ответ</span>
          <BlockList :blocks="q.answerContent" :media="media" />
        </div>
      </template>
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

.theme {
  overflow: hidden;
  color: #9fb0ee;
  font-size: 1.6vw;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
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

.content.shrink {
  opacity: 0.6;
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

.thumb {
  width: 5vw;
  height: 5vw;
  border-radius: 0.5vw;
  object-fit: cover;
}

.pic {
  max-width: 100%;
  max-height: 34vh;
  border-radius: 0.8vw;
  object-fit: contain;
  transition: filter 0.6s;
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
  align-items: center;
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

.blank {
  margin: 0;
  color: #fff;
  font-size: 3.4vw;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
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
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6vw;
}

.mask i {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.6vw;
  height: 6vw;
  border-bottom: 0.3vw solid #ffd84a;
  color: #fff;
  font-size: 4vw;
  font-style: normal;
  font-weight: 800;
  text-transform: uppercase;
}

.note {
  margin: 0;
  color: #cfd8ff;
  font-size: 2vw;
  text-align: center;
}

.note b {
  color: #ffd84a;
}

.splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2vw;
}

.splash h2 {
  margin: 0;
  color: #ffd84a;
  font-size: 6vw;
  font-weight: 900;
  text-shadow: 0.25vw 0.25vw 0 rgba(0, 0, 0, 0.4);
  text-transform: uppercase;
}

.bids {
  display: flex;
  flex-direction: column;
  gap: 0.6vw;
  min-width: 36vw;
}

.bid,
.chip {
  display: flex;
  justify-content: space-between;
  gap: 3vw;
  padding: 0.6vw 1.6vw;
  border-radius: 0.8vw;
  background: rgba(8, 14, 40, 0.55);
  color: #fff;
  font-size: 2.2vw;
}

.bid b,
.chip b {
  color: #ffd84a;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1vw;
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
