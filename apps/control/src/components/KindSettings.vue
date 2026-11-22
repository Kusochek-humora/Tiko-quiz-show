<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { QuestionKind, QuestionSettings } from '@/api'
import { KIND_LABELS, newBlitzItem, newHint, newOption, newOrderItem, newPair } from '@/kinds'
import MediaPicker from './MediaPicker.vue'

defineProps<{ kind: QuestionKind }>()
const model = defineModel<QuestionSettings>({ required: true })
const s = computed(() => model.value)

// «Со ставкой»: максимум — счёт игрока, цена вопроса или фиксированное число
const stakeMode = computed({
  get: () => (typeof s.value.maxStake === 'number' ? 'number' : (s.value.maxStake ?? 'score')),
  set: (v: string) => {
    s.value.maxStake = v === 'number' ? 100 : v
  },
})

// «Закончи фразу»: ответы для пропусков по одному в строке
const blanksText = ref(((s.value.blanks as string[] | undefined) ?? []).join('\n'))
watch(blanksText, (text) => {
  s.value.blanks = text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
})

// Номер для подписи (индекс из v-for по полям с типом any имеет тип string | number)
const n = (i: string | number) => Number(i) + 1

// Необязательные числа: пустое поле = null
const optionalNumber = (e: Event) => {
  const v = (e.target as HTMLInputElement).value
  return v === '' ? null : Number(v)
}
</script>

<template>
  <section v-if="kind !== 'standard'" class="box">
    <h3>Настройки: {{ KIND_LABELS[kind] }}</h3>

    <!-- Варианты ответа -->
    <template v-if="kind === 'options'">
      <div class="two">
        <div class="field">
          <label>Вид</label>
          <select v-model="s.variant" class="select">
            <option value="choice">Выбор ответа</option>
            <option value="odd_one_out">Найти лишнее</option>
          </select>
        </div>
        <label class="check"><input v-model="s.multiple" type="checkbox" /> Несколько верных</label>
      </div>
      <div v-for="(o, i) in s.options" :key="o.id" class="row item">
        <input v-model="o.isCorrect" type="checkbox" title="Верный вариант" />
        <input v-model="o.text" class="input" :placeholder="`Вариант ${n(i)}`" />
        <button type="button" class="btn btn-sm btn-icon btn-danger" :disabled="s.options.length <= 2" @click="s.options.splice(i, 1)">✕</button>
      </div>
      <button type="button" class="btn btn-sm" :disabled="s.options.length >= 8" @click="s.options.push(newOption())">+ Вариант</button>
      <p class="muted note">Галочка слева отмечает верный вариант. От 2 до 8 вариантов.</p>
    </template>

    <!-- Верю / не верю -->
    <template v-else-if="kind === 'true_false'">
      <div class="field">
        <label>Верный ответ</label>
        <select v-model="s.correct" class="select">
          <option :value="true">Верю</option>
          <option :value="false">Не верю</option>
        </select>
      </div>
      <div class="field">
        <label>Пояснение (показывается вместе с ответом)</label>
        <textarea v-model="s.explanation" class="textarea" />
      </div>
    </template>

    <!-- Подсказки -->
    <template v-else-if="kind === 'hints'">
      <div class="field narrow">
        <label>Штраф за каждую подсказку, баллов</label>
        <input v-model.number="s.penaltyPerHint" class="input" type="number" min="0" step="50" />
      </div>
      <div v-for="(h, i) in s.hints" :key="i" class="row item">
        <span class="muted idx">{{ n(i) }}</span>
        <input v-model="h.text" class="input" :placeholder="`Подсказка ${n(i)}`" />
        <button type="button" class="btn btn-sm btn-icon btn-danger" :disabled="s.hints.length <= 1" @click="s.hints.splice(i, 1)">✕</button>
      </div>
      <button type="button" class="btn btn-sm" :disabled="s.hints.length >= 5" @click="s.hints.push(newHint())">+ Подсказка</button>
    </template>

    <!-- Кот в мешке -->
    <template v-else-if="kind === 'cat_in_bag'">
      <div class="two">
        <div class="field">
          <label>Своя цена (необязательно)</label>
          <input class="input" type="number" min="1" :value="s.priceOverride ?? ''" placeholder="как в сетке" @input="s.priceOverride = optionalNumber($event)" />
        </div>
        <label class="check"><input v-model="s.allowSelf" type="checkbox" /> Можно оставить себе</label>
      </div>
      <div class="field">
        <label>Интрига на заставке (необязательно)</label>
        <input v-model="s.teaser" class="input" />
      </div>
    </template>

    <!-- Аукцион -->
    <template v-else-if="kind === 'auction'">
      <div class="two">
        <div class="field">
          <label>Стартовая ставка</label>
          <input v-model.number="s.startBid" class="input" type="number" min="0" step="100" />
        </div>
        <div class="field">
          <label>Шаг ставки</label>
          <input v-model.number="s.step" class="input" type="number" min="1" step="50" />
        </div>
      </div>
    </template>

    <!-- Со ставкой -->
    <template v-else-if="kind === 'stake'">
      <div class="two">
        <div class="field">
          <label>Максимальная ставка</label>
          <select v-model="stakeMode" class="select">
            <option value="score">Весь счёт игрока</option>
            <option value="price">Цена вопроса</option>
            <option value="number">Фиксированное число</option>
          </select>
        </div>
        <div v-if="stakeMode === 'number'" class="field">
          <label>Значение</label>
          <input v-model.number="s.maxStake" class="input" type="number" min="1" step="100" />
        </div>
      </div>
    </template>

    <!-- Блиц -->
    <template v-else-if="kind === 'blitz'">
      <div class="three">
        <div class="field">
          <label>Очков за пункт</label>
          <input v-model.number="s.pointsPerItem" class="input" type="number" min="1" step="50" />
        </div>
        <div class="field">
          <label>Секунд на пункт</label>
          <input class="input" type="number" min="1" :value="s.perItemSec ?? ''" placeholder="без лимита" @input="s.perItemSec = optionalNumber($event)" />
        </div>
        <div class="field">
          <label>Секунд на весь блиц</label>
          <input class="input" type="number" min="1" :value="s.totalSec ?? ''" placeholder="без лимита" @input="s.totalSec = optionalNumber($event)" />
        </div>
      </div>
      <div v-for="(it, i) in s.items" :key="i" class="item pair">
        <span class="muted idx">{{ n(i) }}</span>
        <input v-model="it.content[0].text" class="input" placeholder="Вопрос" />
        <input v-model="it.answerContent[0].text" class="input" placeholder="Ответ" />
        <button type="button" class="btn btn-sm btn-icon btn-danger" :disabled="s.items.length <= 2" @click="s.items.splice(i, 1)">✕</button>
      </div>
      <button type="button" class="btn btn-sm" @click="s.items.push(newBlitzItem())">+ Пункт</button>
    </template>

    <!-- Открывающаяся картинка -->
    <template v-else-if="kind === 'reveal_image'">
      <div class="field">
        <label>Картинка</label>
        <MediaPicker :model-value="s.mediaId ?? null" type="image" @update:model-value="s.mediaId = $event" />
      </div>
      <div class="three">
        <div class="field">
          <label>Способ</label>
          <select v-model="s.mode" class="select">
            <option value="blur">Убывающее размытие</option>
            <option value="tiles">По плиткам</option>
          </select>
        </div>
        <div class="field">
          <label>Шагов открытия (2–10)</label>
          <input v-model.number="s.steps" class="input" type="number" min="2" max="10" />
        </div>
        <div class="field">
          <label>Штраф за шаг (необязательно)</label>
          <input class="input" type="number" min="0" step="50" :value="s.penaltyPerStep ?? ''" placeholder="нет" @input="s.penaltyPerStep = optionalNumber($event)" />
        </div>
      </div>
    </template>

    <!-- Расставить по порядку -->
    <template v-else-if="kind === 'ordering'">
      <p class="muted note">Введите элементы в ПРАВИЛЬНОМ порядке. Игрокам они покажутся перемешанными.</p>
      <div v-for="(it, i) in s.items" :key="it.id" class="row item">
        <span class="muted idx">{{ n(i) }}</span>
        <input v-model="it.text" class="input" :placeholder="`Элемент ${n(i)}`" />
        <button type="button" class="btn btn-sm btn-icon btn-danger" :disabled="s.items.length <= 2" @click="s.items.splice(i, 1)">✕</button>
      </div>
      <button type="button" class="btn btn-sm" :disabled="s.items.length >= 8" @click="s.items.push(newOrderItem())">+ Элемент</button>
    </template>

    <!-- Сопоставление -->
    <template v-else-if="kind === 'matching'">
      <div v-for="(p, i) in s.pairs" :key="i" class="item pair">
        <span class="muted idx">{{ n(i) }}</span>
        <input v-model="p.left.text" class="input" placeholder="Левая часть" />
        <span class="muted">—</span>
        <input v-model="p.right.text" class="input" placeholder="Правая часть" />
        <button type="button" class="btn btn-sm btn-icon btn-danger" :disabled="s.pairs.length <= 2" @click="s.pairs.splice(i, 1)">✕</button>
      </div>
      <button type="button" class="btn btn-sm" @click="s.pairs.push(newPair())">+ Пара</button>
    </template>

    <!-- Закончи фразу -->
    <template v-else-if="kind === 'fill_blank'">
      <div class="field">
        <label>Текст (пропуск обозначается тремя подчёркиваниями ___)</label>
        <textarea v-model="s.template" class="textarea" placeholder="Москва — столица ___" />
      </div>
      <div class="field">
        <label>Ответы для пропусков, по одному в строке, в порядке появления</label>
        <textarea v-model="blanksText" class="textarea" />
      </div>
    </template>

    <!-- Угадай слово -->
    <template v-else-if="kind === 'word_guess'">
      <div class="two">
        <div class="field">
          <label>Слово</label>
          <input v-model="s.word" class="input" />
        </div>
        <div class="field">
          <label>Подсказка (необязательно)</label>
          <input v-model="s.hint" class="input" />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.box {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
}

h3 {
  margin-bottom: 12px;
  color: var(--gold);
  font-size: 14px;
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: end;
}

.three {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.narrow {
  max-width: 280px;
}

.item {
  margin-bottom: 8px;
}

.pair {
  display: flex;
  align-items: center;
  gap: 8px;
}

.idx {
  width: 18px;
  flex: none;
  text-align: center;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 6px;
}

.note {
  margin: 10px 0 0;
  font-size: 13px;
}

@media (max-width: 640px) {
  .two,
  .three {
    grid-template-columns: 1fr;
  }
}
</style>
