import type { ContentBlock, Question, QuestionKind, QuestionSettings } from '@/api'

// Справочник механик вопросов: названия, настройки по умолчанию и валидация.
// Структура settings описана в docs/backend.md (раздел 4.1).

export const KIND_LABELS: Record<QuestionKind, string> = {
  standard: 'Обычный',
  options: 'С вариантами ответа',
  true_false: 'Верю / не верю',
  hints: 'С подсказками',
  cat_in_bag: 'Кот в мешке',
  auction: 'Аукцион',
  stake: 'Со ставкой',
  blitz: 'Блиц',
  reveal_image: 'Открывающаяся картинка',
  ordering: 'Расставить по порядку',
  matching: 'Сопоставление',
  fill_blank: 'Закончи фразу',
  word_guess: 'Угадай слово',
}

export const KIND_SHORT: Record<QuestionKind, string> = {
  standard: '',
  options: 'варианты',
  true_false: 'да/нет',
  hints: 'подсказки',
  cat_in_bag: 'кот',
  auction: 'аукцион',
  stake: 'ставка',
  blitz: 'блиц',
  reveal_image: 'картинка',
  ordering: 'порядок',
  matching: 'пары',
  fill_blank: 'пропуски',
  word_guess: 'слово',
}

export const KIND_HINTS: Record<QuestionKind, string> = {
  standard: 'Вопрос и ответ, ведущий оценивает ответ.',
  options: 'Варианты ответа или «найти лишнее».',
  true_false: 'Игрок отвечает «верю» или «не верю».',
  hints: 'Подсказки открываются по одной, цена вопроса падает.',
  cat_in_bag: 'Вопрос передаётся другому игроку, которого выбирает отвечающий.',
  auction: 'Игроки делают ставки, вопрос получает тот, кто поставил больше.',
  stake: 'Отвечающий сам ставит часть своих баллов.',
  blitz: 'Серия коротких вопросов подряд.',
  reveal_image: 'Картинка открывается по шагам.',
  ordering: 'Нужно расставить элементы в правильном порядке.',
  matching: 'Нужно соединить пары.',
  fill_blank: 'Текст с пропусками, которые нужно заполнить.',
  word_guess: 'Слово открывается по буквам.',
}

export const KIND_LIST = Object.keys(KIND_LABELS) as QuestionKind[]

const uid = () => crypto.randomUUID()

export const textBlock = (text = ''): ContentBlock => ({ type: 'text', text })

export const newOption = () => ({ id: uid(), text: '', isCorrect: false })
export const newHint = () => ({ text: '' })
export const newBlitzItem = () => ({ content: [textBlock()], answerContent: [textBlock()] })
export const newOrderItem = () => ({ id: uid(), text: '' })
export const newPair = () => ({ left: { text: '' }, right: { text: '' } })

export function defaultSettings(kind: QuestionKind): QuestionSettings {
  switch (kind) {
    case 'options':
      return { variant: 'choice', multiple: false, options: [{ ...newOption(), isCorrect: true }, newOption()] }
    case 'true_false':
      return { correct: true, explanation: '' }
    case 'hints':
      return { penaltyPerHint: 100, hints: [newHint()] }
    case 'cat_in_bag':
      return { priceOverride: null, allowSelf: false, teaser: '' }
    case 'auction':
      return { startBid: 100, step: 100 }
    case 'stake':
      return { maxStake: 'score' }
    case 'blitz':
      return { items: [newBlitzItem(), newBlitzItem()], perItemSec: null, totalSec: null, pointsPerItem: 100 }
    case 'reveal_image':
      return { mediaId: null, mode: 'blur', steps: 5, penaltyPerStep: null }
    case 'ordering':
      return { items: [newOrderItem(), newOrderItem(), newOrderItem()] }
    case 'matching':
      return { pairs: [newPair(), newPair()] }
    case 'fill_blank':
      return { template: '', blanks: [] }
    case 'word_guess':
      return { word: '', hint: '' }
    default:
      return {}
  }
}

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0
const posInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0

export const blockValid = (b: ContentBlock) => (b.type === 'text' ? filled(b.text) : !!b.mediaId)

export interface QuestionDraft {
  price: number
  kind: QuestionKind
  settings: QuestionSettings
  content: ContentBlock[]
  answerContent: ContentBlock[]
  timeLimitSec: number | null
}

/** Возвращает текст ошибки или пустую строку */
export function validateQuestion(q: QuestionDraft): string {
  if (!posInt(q.price)) return 'Цена должна быть целым числом больше нуля'
  if (!q.content.length) return 'Добавьте содержимое вопроса'
  if (!q.content.every(blockValid)) return 'В вопросе есть пустой блок (нет текста или файла)'
  if (!q.answerContent.length) return 'Добавьте содержимое ответа'
  if (!q.answerContent.every(blockValid)) return 'В ответе есть пустой блок (нет текста или файла)'
  if (q.timeLimitSec !== null && !posInt(q.timeLimitSec)) return 'Время должно быть целым числом секунд больше нуля'

  const s = q.settings
  switch (q.kind) {
    case 'options': {
      const opts: { text: string; isCorrect: boolean }[] = s.options ?? []
      if (opts.length < 2 || opts.length > 8) return 'Вариантов должно быть от 2 до 8'
      if (!opts.every((o) => filled(o.text))) return 'У каждого варианта должен быть текст'
      const correct = opts.filter((o) => o.isCorrect).length
      if (correct === 0) return 'Отметьте хотя бы один верный вариант'
      if (!s.multiple && correct > 1) return 'Верных вариантов несколько: включите «Несколько верных» или оставьте один'
      return ''
    }
    case 'hints': {
      const hints: { text: string }[] = s.hints ?? []
      if (hints.length < 1 || hints.length > 5) return 'Подсказок должно быть от 1 до 5'
      if (!hints.every((h) => filled(h.text))) return 'У каждой подсказки должен быть текст'
      if (typeof s.penaltyPerHint !== 'number' || s.penaltyPerHint < 0) return 'Штраф за подсказку не может быть отрицательным'
      return ''
    }
    case 'cat_in_bag':
      if (s.priceOverride !== null && s.priceOverride !== undefined && !posInt(s.priceOverride)) return 'Своя цена должна быть целым числом больше нуля'
      return ''
    case 'auction':
      if (typeof s.startBid !== 'number' || s.startBid < 0) return 'Стартовая ставка не может быть отрицательной'
      if (!posInt(s.step)) return 'Шаг ставки должен быть больше нуля'
      return ''
    case 'stake':
      if (typeof s.maxStake === 'number' && !posInt(s.maxStake)) return 'Максимальная ставка должна быть больше нуля'
      return ''
    case 'blitz': {
      const items: { content: ContentBlock[]; answerContent: ContentBlock[] }[] = s.items ?? []
      if (items.length < 2) return 'В блице минимум два пункта'
      if (!items.every((i) => i.content.every(blockValid) && i.content.length && i.answerContent.every(blockValid) && i.answerContent.length)) {
        return 'У каждого пункта блица нужны вопрос и ответ'
      }
      if (!posInt(s.pointsPerItem)) return 'Очки за пункт должны быть больше нуля'
      return ''
    }
    case 'reveal_image':
      if (!s.mediaId) return 'Выберите картинку'
      if (!Number.isInteger(s.steps) || s.steps < 2 || s.steps > 10) return 'Шагов открытия должно быть от 2 до 10'
      return ''
    case 'ordering': {
      const items: { text: string }[] = s.items ?? []
      if (items.length < 2 || items.length > 8) return 'Элементов должно быть от 2 до 8'
      if (!items.every((i) => filled(i.text))) return 'У каждого элемента должен быть текст'
      return ''
    }
    case 'matching': {
      const pairs: { left: { text: string }; right: { text: string } }[] = s.pairs ?? []
      if (pairs.length < 2) return 'Нужно минимум две пары'
      if (!pairs.every((p) => filled(p.left.text) && filled(p.right.text))) return 'Заполните обе части каждой пары'
      return ''
    }
    case 'fill_blank': {
      const markers = (String(s.template ?? '').match(/___/g) ?? []).length
      if (markers === 0) return 'В тексте нужен хотя бы один пропуск «___»'
      if ((s.blanks ?? []).length !== markers) return `Пропусков в тексте ${markers}, а ответов ${(s.blanks ?? []).length}`
      return ''
    }
    case 'word_guess':
      if (!filled(s.word)) return 'Введите слово'
      return ''
    default:
      return ''
  }
}

/** Короткое описание вопроса для подсказок и списков */
export function questionSummary(q: Question): string {
  const text = q.content.find((b) => b.type === 'text' && filled(b.text))?.text
  if (text) return text
  return q.content.length ? 'Вопрос с медиа' : 'Пустой вопрос'
}
