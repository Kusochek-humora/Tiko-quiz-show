<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { ContentBlock, QuizPlayer, QuizQuestion } from '@/api'
import { useSessionStore } from '@/stores/session'

// Кнопки оператора для механик вопросов (QUIZ_API.md, разделы 6 и 7).
// Все действия идут через store: он сам подставляет expectedVersion и показывает ошибки.

const props = defineProps<{ q: QuizQuestion; players: QuizPlayer[] }>()
const store = useSessionStore()

const v = computed(() => props.q.view ?? {})
const prepare = computed(() => props.q.phase === 'prepare')
const finalInfo = computed(() => v.value.final as { finalists: string[]; stakes: Record<string, number | true> } | undefined)

const nameOf = (id?: string | null) => props.players.find((p) => p.id === id)?.name ?? '—'
const blocksText = (blocks?: ContentBlock[]) => (blocks ?? []).map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join(' ')

const bidPlayer = ref('')
const bidAmount = ref<number | null>(null)
const stakePlayer = ref('')
const stakeAmount = ref<number | null>(null)
const finalStakes = reactive<Record<string, number | null>>({})
const letter = ref('')

function placeBid() {
  if (!bidPlayer.value || !bidAmount.value) return
  void store.command('place_bid', { participantId: bidPlayer.value, amount: bidAmount.value })
  bidAmount.value = null
}

function setStake() {
  if (!stakeAmount.value) return
  const payload: Record<string, unknown> = { amount: stakeAmount.value }
  if (stakePlayer.value) payload.participantId = stakePlayer.value
  void store.command('set_stake', payload)
  stakeAmount.value = null
}

function setFinalStake(id: string) {
  const amount = finalStakes[id]
  if (amount === null || amount === undefined || amount < 0) return
  void store.command('set_stake', { participantId: id, amount })
}

function revealLetter() {
  const l = letter.value.trim().slice(0, 1)
  if (!l) return
  void store.command('reveal_letter', { letter: l })
  letter.value = ''
}
</script>

<template>
  <div class="kc">
    <!-- Фаза подготовки: кот, аукцион, ставка, финал -->
    <template v-if="prepare">
      <p class="muted title">Подготовка вопроса</p>

      <!-- Кот в мешке -->
      <div v-if="q.kind === 'cat_in_bag'" class="block">
        <p>Кому достанется вопрос?{{ v.recipientId ? ` Выбран: ${nameOf(v.recipientId)}` : '' }}</p>
        <div class="row wrap">
          <button v-for="p in players" :key="p.id" class="btn btn-sm" :class="{ 'btn-primary': p.id === v.recipientId }" @click="store.command('choose_recipient', { participantId: p.id })">
            {{ p.name }}
          </button>
        </div>
      </div>

      <!-- Аукцион -->
      <div v-else-if="q.kind === 'auction'" class="block">
        <p>
          Старт {{ v.startBid }}, шаг {{ v.step }}. Минимальная следующая ставка: <b>{{ v.minNextBid }}</b>
        </p>
        <div class="row wrap">
          <select v-model="bidPlayer" class="select sel">
            <option value="" disabled>Кто ставит</option>
            <option v-for="p in players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input v-model.number="bidAmount" class="input num" type="number" :min="v.minNextBid" :step="v.step" :placeholder="String(v.minNextBid ?? '')" @keydown.enter="placeBid" />
          <button class="btn btn-sm" :disabled="!bidPlayer || !bidAmount || v.closed" @click="placeBid">Принять ставку</button>
          <button class="btn btn-sm btn-danger" :disabled="v.closed || !(v.bids?.length)" @click="store.command('close_bidding')">Закрыть торги</button>
        </div>
        <div v-for="b in v.bids" :key="`${b.participantId}-${b.amount}`" class="muted line">{{ nameOf(b.participantId) }}: {{ b.amount }}</div>
        <p v-if="v.closed && v.winnerId">Победитель: <b>{{ nameOf(v.winnerId) }}</b>, цена {{ v.winningBid }}</p>
      </div>

      <!-- Супер-игра: ставки финалистов -->
      <div v-else-if="finalInfo" class="block">
        <p>Ставки финалистов (не больше счёта игрока):</p>
        <div v-for="id in finalInfo.finalists" :key="id" class="row wrap line">
          <span class="who">{{ nameOf(id) }}</span>
          <span class="muted">{{ finalInfo.stakes?.[id] === undefined ? 'ставки нет' : `ставка: ${finalInfo.stakes[id]}` }}</span>
          <input v-model.number="finalStakes[id]" class="input num" type="number" min="0" step="100" placeholder="сумма" @keydown.enter="setFinalStake(id)" />
          <button class="btn btn-sm" :disabled="finalStakes[id] === null || finalStakes[id] === undefined" @click="setFinalStake(id)">Принять</button>
        </div>
      </div>

      <!-- Со ставкой -->
      <div v-else-if="q.kind === 'stake'" class="block">
        <p>
          Ставка: <b>{{ v.stake ?? 'не сделана' }}</b>{{ v.participantId ? ` (${nameOf(v.participantId)})` : '' }}. Максимум: {{ v.maxStake }}
        </p>
        <div class="row wrap">
          <select v-model="stakePlayer" class="select sel">
            <option value="">Отвечающий (по умолчанию)</option>
            <option v-for="p in players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input v-model.number="stakeAmount" class="input num" type="number" min="1" step="100" placeholder="сумма" @keydown.enter="setStake" />
          <button class="btn btn-sm" :disabled="!stakeAmount" @click="setStake">Принять ставку</button>
        </div>
      </div>

      <button class="btn btn-primary" @click="store.command('begin_play')">▶ Показать вопрос</button>
    </template>

    <!-- Фаза игры: управление по механике -->
    <template v-else>
      <div v-if="q.kind === 'hints'" class="row wrap">
        <button class="btn" :disabled="v.hintsShown >= v.hintsTotal" @click="store.command('reveal_hint')">💡 Подсказка ({{ v.hintsShown }}/{{ v.hintsTotal }})</button>
        <span class="muted">Каждая подсказка снижает цену на {{ v.penaltyPerHint }}</span>
      </div>
      <div v-if="q.kind === 'hints'" class="block">
        <div v-for="(h, i) in v.hints" :key="i" class="line" :class="{ ok: h.shown }">{{ Number(i) + 1 }}. {{ h.text ?? '[медиа]' }}{{ h.shown ? ' (открыта)' : '' }}</div>
      </div>

      <div v-else-if="q.kind === 'blitz'" class="block">
        <div class="row wrap">
          <button class="btn btn-sm" :disabled="!v.index" @click="store.command('blitz_back')">← Предыдущий</button>
          <b>Пункт {{ Number(v.index) + 1 }} из {{ v.total }}</b>
          <button class="btn btn-sm" :disabled="Number(v.index) + 1 >= v.total" @click="store.command('blitz_next')">Следующий →</button>
        </div>
        <p class="line">{{ blocksText(v.item?.content) }}</p>
        <p class="line ok">Ответ: {{ blocksText(v.item?.answerContent) }}</p>
        <p class="muted line">{{ v.pointsPerItem }} за пункт. Очки начисляйте в списке игроков.</p>
      </div>

      <div v-else-if="q.kind === 'reveal_image'" class="row wrap">
        <button class="btn" :disabled="v.step >= v.steps" @click="store.command('reveal_step')">Открыть ещё ({{ v.step }}/{{ v.steps }})</button>
      </div>

      <div v-else-if="q.kind === 'word_guess'" class="block">
        <div class="mask">
          <i v-for="(m, i) in v.mask" :key="i" :class="{ open: m.char }">{{ m.char ?? '' }}</i>
        </div>
        <div class="row wrap">
          <input v-model="letter" class="input num" maxlength="1" placeholder="буква" @keydown.enter="revealLetter" />
          <button class="btn btn-sm" :disabled="!letter.trim()" @click="revealLetter">Открыть букву</button>
          <span v-if="v.word" class="ok">Слово: {{ v.word }}</span>
        </div>
      </div>

      <p v-else-if="q.kind === 'cat_in_bag' && v.recipientId" class="muted">Отвечает {{ nameOf(v.recipientId) }}, цена {{ v.price }}</p>
      <p v-else-if="q.kind === 'auction' && v.winnerId" class="muted">Отвечает {{ nameOf(v.winnerId) }}, ставка {{ v.winningBid }}</p>
    </template>
  </div>
</template>

<style scoped>
.kc {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px dashed var(--gold);
  border-radius: 8px;
}

.kc:empty {
  display: none;
}

.title {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
}

.block p {
  margin: 0 0 8px;
}

.wrap {
  flex-wrap: wrap;
}

.sel {
  width: auto;
  min-width: 180px;
}

.num {
  width: 110px;
}

.who {
  min-width: 120px;
  font-weight: 600;
}

.line {
  margin: 4px 0;
}

.ok {
  color: var(--ok);
}

.mask {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.mask i {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 36px;
  border-bottom: 2px solid var(--gold);
  font-style: normal;
  font-weight: 700;
  text-transform: uppercase;
}
</style>
