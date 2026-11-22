# Backend: техническое задание

Игра в формате «Своя игра» проходит офлайн, в зале. Игроки и зрители в систему не заходят, трансляцию снимает физическая камера. Оператор сидит за пультом и ведёт игру, а экран эфира показывает результат.

| Клиент | Что делает | Доступ |
|---|---|---|
| **Админка** | Готовит контент: игры, раунды, темы, вопросы, медиа, участники | JWT, роль `admin` |
| **Пульт (host)** | Ведёт игру: открывает вопросы, выбирает отвечающего, начисляет очки | JWT, роли `admin` и `host` |
| **Экран эфира (screen)** | Только показывает состояние. Без логина, без курсора | токен сессии в URL |

Вся игровая логика живёт на бэке. Экран ничего не решает, он рисует то, что прислал бэк.

## 0. Что показывает экран эфира

Игровое поле (как на референсах):
- **Сетка:** строки — темы, в каждой строке ячейки с ценами (100…500). Открытый вопрос из сетки исчезает.
- **Активный игрок** подсвечивается рамкой. Это тот, кто сейчас отвечает.
- **Табло** с очками всех игроков видно постоянно, под сеткой.
- **Подписи:** имена игроков, имя ведущего. Видео с камер вставляется на стороне трансляции, система его не обрабатывает.

Отдельного экрана «табло» нет: очки видны всегда. Поэтому статуса `scores` в автомате нет.

## 1. Стек

- Node.js 22 LTS, TypeScript (strict), pnpm
- Fastify 5, PostgreSQL 16, Drizzle ORM (миграции через drizzle-kit)
- Zod для валидации (`fastify-type-provider-zod`)
- `@fastify/websocket`, `@fastify/jwt`, `@fastify/multipart`, `@fastify/static`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/swagger`
- Vitest для тестов, pino для логов

## 2. Репозитории и деплой

- **Бэк** — отдельный репозиторий `quiz-api`, деплой на VPS.
- **Фронты** — репозиторий `quiz-web` (экран и пульт с админкой), публикуются на GitHub Pages. Они живут на домене `github.io`, а API на другом домене, поэтому cookie-авторизация не подходит: **авторизация только по заголовку `Authorization: Bearer <jwt>`**.
- Типы для фронта берутся из OpenAPI. Бэк обязан отдавать актуальную схему на `/docs/json`, а в схему должны попадать и снимок состояния, и команды.
- Адрес API фронт получает на этапе сборки из переменной `VITE_API_URL`.

## 3. Структура

```
src/
  app.ts, server.ts, config.ts
  db/ schema.ts, migrations/, seed.ts
  modules/
    auth/  games/  rounds/  questions/  media/  participants/
    sessions/
      engine.ts      конечный автомат (чистые функции, без БД)
      snapshot.ts    сбор снимка для screen и host
      realtime.ts    WebSocket: комнаты, рассылка
  plugins/ auth-guard, error-handler
test/
```

`engine.ts` содержит чистые функции `(state, command) => newState | ошибка` и легко тестируется отдельно.

## 4. Модель данных

Все `id` — uuid. Во всех таблицах есть `created_at` и `updated_at`.

| Таблица | Поля |
|---|---|
| `users` | login (unique), password_hash (argon2), role (`admin` \| `host`) |
| `media` | type (`image` \| `audio` \| `video`), path, original_name, mime, size |
| `games` | title, description |
| `rounds` | game_id, order, title, description, type (`standard` \| `final`, по умолчанию `standard`), settings (jsonb, см. 4.1) |
| `themes` | round_id, order, title (тема, строка сетки) |
| `questions` | theme_id, order, price (int), kind (по умолчанию `standard`, см. 4.1), settings (jsonb, зависит от kind), content (jsonb: массив блоков вопроса), answer_content (jsonb: массив блоков ответа), comment (заметка ведущему, на экран не идёт), time_limit_sec (nullable) |
| `question_media` | question_id, media_id — служебная связь, обновляется при сохранении вопроса (включая `mediaId` внутри `content`, `answer_content` и `settings`); по ней блокируется удаление используемых файлов |
| `session_question_state` | session_id, question_id, state (jsonb) — рабочее состояние вопроса в эфире (открытые подсказки, ставки, получатель и т. п., см. 4.1) |
| `participants` | name, color, photo_media_id (nullable), default_start_score (int, по умолчанию 0) |
| `sessions` | game_id, status, host_name, current_round_id, current_question_id, active_participant_id, timer_ends_at, screen_token, version (int), started_at, finished_at |
| `session_participants` | session_id, participant_id, order (слот на экране), start_score (int, по умолчанию `participants.default_start_score`, редактируется оператором в любой момент) |
| `session_played_questions` | session_id, question_id |
| `session_history` | session_id, version, command, state_before (jsonb) — для отката |
| `score_events` | session_id, participant_id, kind (`correct` \| `wrong` \| `bonus` \| `penalty` \| `manual`), delta (int, может быть отрицательным), reason (текст, например «рассмешил зал»), question_id (nullable), voided (bool), created_by |

Решения:
- Порядок ячеек в строке задаётся ценой (`price` по возрастанию), а `order` у вопросов служит запасным признаком.
- Очки хранятся только как журнал `score_events`. Сумма считается запросом. Отмена начисления — это `voided = true`, а не удаление строки.
- Каскады: удаление игры удаляет раунды, темы, вопросы. Удаление медиа блокируется (`409`), если файл используется.
- Вопрос проходит валидацию: `price > 0`; в `content` и `answer_content` минимум по одному блоку; `settings` валидируется схемой своей механики (zod, ошибки в `422` с путями полей).
- Счёт игрока = `session_participants.start_score` + сумма неотменённых `score_events` игрока.- Игроков в сессии любое количество, их можно добавлять и убирать на ходу (см. API сессий).

## 4.1 Механики вопросов и типы раундов

### Содержимое вопроса
`content` и `answer_content` — массивы блоков: `{ type: 'text' | 'image' | 'audio' | 'video', text?: string, mediaId?: string }`. Видео и аудио — это блоки содержимого, а не отдельные механики: их можно добавить к любой механике, и к ответу тоже. Для `text` обязателен `text`, для остальных — `mediaId`.

### Механики (`questions.kind`)
Общая настройка для любой механики: `settings.noPenalty: boolean` («без риска»: неверный ответ даёт 0 вместо `−цена`).

| kind | settings | Команды оператора | Что на экране |
|---|---|---|---|
| `standard` | — | — | Содержимое вопроса. Ответ после `reveal_answer`. |
| `options` | `variant: 'choice' \| 'odd_one_out'`, `multiple: boolean`, `options: [{id, text?, mediaId?, isCorrect}]` (2–8, минимум один верный) | — | Варианты. Верные подсвечиваются после `reveal_answer`. «Найти лишнее» — тот же набор данных с другим заголовком. |
| `true_false` | `correct: boolean`, `explanation?: string` | — | «Верю / не верю». Верный ответ и пояснение после `reveal_answer`. |
| `hints` | `penaltyPerHint: int`, `hints: [{text?, mediaId?}]` (1–5) | `reveal_hint` | Открытые подсказки. Цена `max(0, price − n·penaltyPerHint)`, где n — число открытых подсказок. |
| `cat_in_bag` | `priceOverride?: int`, `allowSelf: boolean` (по умолчанию false), `teaser?: string` | `choose_recipient {participantId}`, затем `begin_play` | Сначала заставка «Кот в мешке» без содержимого, затем вопрос. Отвечает выбранный игрок (становится активным). |
| `auction` | `startBid: int`, `step: int` | `place_bid {participantId, amount}`, `close_bidding` | Таблица ставок. После `close_bidding` победитель становится активным, цена вопроса = его ставка. |
| `stake` | `maxStake: 'score' \| 'price' \| number` | `set_stake {participantId?, amount}`, затем `begin_play` | Ставка отвечающего. Верно: `+ставка`, неверно: `−ставка`. |
| `blitz` | `items: [{content, answerContent}]` (минимум 2), `perItemSec?`, `totalSec?`, `pointsPerItem: int` | `blitz_next`, `blitz_back` | Текущий пункт и прогресс `n/всего`. Очки за пункты оператор начисляет через `/scores`. |
| `reveal_image` | `mediaId`, `mode: 'blur' \| 'tiles'`, `steps: 2..10`, `penaltyPerStep?: int` | `reveal_step` | Картинка открывается по шагам. |
| `ordering` | `items: [{id, text?, mediaId?}]` — в правильном порядке | — | Перемешанные элементы (порядок фиксируется `shuffleSeed` в state). После `reveal_answer` правильный порядок. |
| `matching` | `pairs: [{left: {text?, mediaId?}, right: {text?, mediaId?}}]` | — | Две перемешанные колонки. После `reveal_answer` показываются соответствия. |
| `fill_blank` | `template: string` с маркерами `___`, `blanks: string[]` | — | Текст с пропусками. После `reveal_answer` пропуски заполнены. |
| `word_guess` | `word: string`, `hint?: string` | `reveal_letter {letter}` | Маска слова с открытыми буквами. |

### Фаза подготовки
Механики `cat_in_bag`, `auction` и `stake` после `open_question` попадают в `state.phase = 'prepare'`: экран показывает заставку механики (без содержимого вопроса), `start_timer` в этой фазе запрещён. `begin_play` переводит вопрос в `phase = 'play'`. Остальные механики сразу идут в `play`. Новых статусов в сессии не добавляется: `status` остаётся `question_shown`.

### Реестр механик
Каждая механика — отдельный модуль `modules/sessions/kinds/<kind>.ts` с одним интерфейсом:

```ts
interface QuestionKind<Settings, State> {
  settingsSchema: ZodType<Settings>
  initState(q: Question): State
  commands: Record<string, (state: State, payload: unknown, ctx: Ctx) => State>
  // что показывать клиенту, зависит от роли, статуса и фазы
  project(q: Question, state: State, ctx: { role: 'screen' | 'host'; status: SessionStatus }): QuestionView
  // сколько очков «засчитать» / «не засчитать» по умолчанию (подсказка для кнопок пульта)
  points(q: Question, state: State): { ifCorrect: number; ifWrong: number }
}
```

Новая механика добавляется одним файлом и регистрацией в реестре, движок не меняется. Состояние лежит в `session_question_state.state` и меняется только через `commands` механики. Команды механик идут через тот же `POST /sessions/:id/commands`, увеличивают `version` и пишут историю для `back`.

### Типы раундов (`rounds.type`)
- **`standard`** — сетка тем и цен.
- **Командный раунд отдельного типа не имеет.** Это обычный раунд (`standard`) с названием вроде «Командный раунд» и своими вопросами, оператор переходит к нему кнопкой `next_round`. Никакой особой логики и общего командного счёта нет: очки, если нужны, оператор начисляет игрокам вручную через `/scores`.
- **`final`** — супер-игра. `settings.finalists: 'leader' | number` (по умолчанию `'leader'` — игрок с максимальным счётом, при равенстве все лидеры; число — топ-N), `settings.mode: 'single_question' | 'elimination'`.
  - `single_question`: в раунде одна тема с одним вопросом. Перед ним оператор выбирает финалистов командой `select_finalists {participantIds}` (по умолчанию подставляются по правилу `finalists`), каждый финалист делает ставку `set_stake {participantId, amount}` (не больше его счёта; экран показывает только факт ставки до `reveal_answer`). Дальше как в обычном вопросе. Начисление: `kind=correct|wrong`, `delta = ±ставка`. Не финалисты на экране приглушены.
  - `elimination`: на поле темы раунда, оператор по очереди вычёркивает их командой `eliminate_theme {themeId}`. Когда осталась одна, открывается её вопрос по правилам `single_question`.

## 5. Игровой движок

Статусы сессии:

```
idle → intro → round_intro → board → question_shown → timer_running → answer_revealed → board
                                                                                        ↓
                                                                      round_intro (следующий раунд) / finished
```

| Команда | Откуда | Куда | Параметры |
|---|---|---|---|
| `start` | idle | intro | — |
| `next_round` | intro, board | round_intro | — (следующий раунд по порядку; если раундов больше нет, то `409 NO_MORE_ROUNDS`) |
| `goto_round` | intro, round_intro, board | round_intro | `index` (номер раунда с нуля; можно вернуться к предыдущему, сыгранные вопросы остаются отмеченными); текущий раунд `409`, несуществующий `422` |
| `show_board` | round_intro, answer_revealed | board | — |
| `open_question` | board | question_shown | `questionId` (должен быть в текущем раунде и не сыгран). Вопрос помечается как сыгранный. |
| `start_timer` | question_shown | timer_running | — (длительность из `time_limit_sec`, иначе `409 NO_TIMER`) |
| `reveal_answer` | question_shown, timer_running | answer_revealed | — |
| `set_active` | board, question_shown, timer_running, answer_revealed | тот же | `participantId` или `null` |
| `finish` | любой, кроме idle | finished | — |
| `back` | любой, кроме idle | предыдущее | откат по `session_history` |
| `reveal_hint` | question_shown, timer_running (фаза `play`) | тот же | механика `hints` |
| `choose_recipient` | question_shown (фаза `prepare`) | тот же | `participantId`; механика `cat_in_bag` |
| `place_bid`, `close_bidding` | question_shown (фаза `prepare`) | тот же | механика `auction` |
| `set_stake` | question_shown (фаза `prepare`) | тот же | `amount`, `participantId?`; механики `stake` и `final` |
| `begin_play` | question_shown (фаза `prepare`) | тот же | переводит `phase` в `play` |
| `blitz_next`, `blitz_back` | question_shown, timer_running | тот же | механика `blitz` |
| `reveal_step` | question_shown, timer_running | тот же | механика `reveal_image` |
| `reveal_letter` | question_shown, timer_running | тот же | `letter`; механика `word_guess` |
| `select_finalists` | round_intro, board (раунд `final`) | тот же | `participantIds` |
| `eliminate_theme` | board (раунд `final`, режим `elimination`) | тот же | `themeId` |

Команды механик допустимы только для вопроса соответствующего `kind`, иначе `409 INVALID_TRANSITION`. Остальные правила (version, expectedVersion, история) те же, что у основных команд.

Правила:
- Недопустимая команда возвращает `409 INVALID_TRANSITION` с текущим статусом.
- Таймер считает только бэк. Для `start_timer` пишется `timer_ends_at = now + time_limit`. Когда время вышло, сервер сам ничего не переключает: оператор нажимает `reveal_answer`. Экран по `timer_ends_at` показывает, что время вышло.
- Каждая успешная команда и каждое изменение очков увеличивает `version` на 1, пишет строку в `session_history` и рассылает новый снимок.
- Опциональный параметр `expectedVersion` у команды: если он не совпадает, вернуть `409 VERSION_MISMATCH` (защита от двойного клика и двух открытых пультов).
- Команды одной сессии выполняются строго последовательно: транзакция БД с `SELECT ... FOR UPDATE` по строке сессии.

## 6. Снимок состояния (snapshot)

Один формат с разной детализацией по ролям.

```ts
type SessionSnapshot = {
  sessionId: string
  version: number
  status: SessionStatus
  serverTime: string                 // ISO, чтобы экран мог вычислить сдвиг часов
  timerEndsAt: string | null
  hostName: string | null
  round: { id, title, description, order, total: number } | null
  board: {                           // для round_intro/board/question_shown и дальше
    themes: {
      id, title,
      cells: { questionId, price, played: boolean }[]
    }[]
  } | null
  question: {
    id, kind, price, timeLimitSec,
    phase: 'prepare' | 'play'
    content,                         // блоки; в фазе prepare для screen пусто
    view: unknown                    // ответ реестра механик: project() (варианты, открытые подсказки, ставки, маска слова и т. д.)
    answerContent?                   // для screen только при answer_revealed
    pointsIfCorrect, pointsIfWrong   // для host: что предложить на кнопках «засчитать» / «не засчитать»
    comment?                         // только host
  } | null
  finalists: string[] | null         // id игроков, только в раунде type=final
  activeParticipantId: string | null
  players: { id, name, color, photo, score, order }[]   // по слотам (order), не по рейтингу
  canBack: boolean                   // только host
  nextRoundAvailable: boolean        // только host
}
```

Различия по ролям:
- **screen:** `answerText` и `answerMedia` приходят только при статусе `answer_revealed`. `comment` не приходит никогда. В ячейках сетки есть только цена и признак `played`, без содержимого вопросов.
- **host:** получает всё сразу: ответ, комментарий и содержимое вопросов в сетке (`cells[].question` с текстом, чтобы ведущий видел, что открывает).

## 7. REST API

Префикс `/api`. Формат ошибок: `{ "error": { "code": "INVALID_TRANSITION", "message": "..." } }`. Валидация: `422 VALIDATION_ERROR` с деталями по полям. Пагинация в списках: `?limit=&offset=`, ответ `{ items, total }`. Авторизация: заголовок `Authorization: Bearer <jwt>`.

### Авторизация
| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/login` | `{login, password}` → `{ token, user }` |
| GET | `/auth/me` | Текущий пользователь |

Rate limit на логин: 5 попыток в минуту с одного IP. Токен живёт 12 часов, перевыпуск не нужен.

### Игры, раунды, темы, вопросы (admin)
| Метод | Путь |
|---|---|
| GET, POST | `/games` |
| GET, PATCH, DELETE | `/games/:id` (GET возвращает игру целиком: раунды → темы → вопросы) |
| POST | `/games/:id/duplicate` |
| POST | `/games/:id/rounds` |
| PATCH, DELETE | `/rounds/:id` |
| PUT | `/games/:id/rounds/order` — тело `{ ids: [...] }` |
| POST | `/rounds/:id/themes` |
| PATCH, DELETE | `/themes/:id` |
| PUT | `/rounds/:id/themes/order` — тело `{ ids: [...] }` |
| POST | `/themes/:id/questions` |
| GET, PATCH, DELETE | `/questions/:id` |

### Медиа (admin)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/media` | multipart, поле `file`. Разрешены jpeg, png, webp, gif, mp3, mp4. Лимит 50 МБ. Имя на диске: uuid + расширение. mime проверять по содержимому. |
| GET | `/media` | Список с фильтром `?type=` |
| DELETE | `/media/:id` | `409`, если используется |

Файлы отдаются статикой на `/uploads/...` без авторизации (экран грузит их напрямую).

### Участники (admin)
`GET, POST /participants`, `PATCH, DELETE /participants/:id`

### Сессии и ведение игры (host)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/sessions` | `{gameId, participantIds, hostName?}` → создать сессию, сгенерировать `screen_token`. В ответе `screenUrl`. |
| GET | `/sessions` | Список (история) |
| GET | `/sessions/:id` | Снимок для host |
| POST | `/sessions/:id/commands` | `{ type, payload?, expectedVersion? }` → новый снимок |
| POST | `/sessions/:id/scores` | `{participantId, kind, delta, reason?, questionId?}` → создаёт `score_event`, рассылает снимок. Оператор сам решает, верен ли ответ: «засчитать» это `kind=correct, delta=+цена`, «не засчитать» это `kind=wrong, delta=−цена` (или 0, если вопрос без риска). Бонус или штраф в любой момент и на любую сумму: `kind=bonus` или `penalty` с произвольным `delta` и комментарием `reason`. Работает в любом статусе игры. `delta` не равен 0. |
| POST | `/sessions/:id/scores/set` | `{participantId, total, reason?}` → выставить итоговый счёт вручную. Бэк сам создаёт событие `kind=manual` с `delta = total − текущий счёт`, чтобы журнал оставался полным. |
| POST | `/sessions/:id/scores/:eventId/void` | Отменить начисление |
| GET | `/sessions/:id/scores` | Журнал событий |
| POST | `/sessions/:id/screen-token/rotate` | Перевыпустить токен (подключённый экран отключается) |
| POST | `/sessions/:id/participants` | `{participantId, startScore?}` → добавить игрока в сессию на ходу (слот в конец) |
| PATCH | `/sessions/:id/participants/:participantId` | `{startScore?, order?}` → изменить стартовый балл или порядок в любой момент, в любом статусе. Увеличивает `version`, пишется в историю. |
| DELETE | `/sessions/:id/participants/:participantId` | Убрать игрока из сессии (его события остаются в журнале) |
| DELETE | `/sessions/:id` | admin: удалить сессию |

Типичный сценарий оператора: `open_question` → (`set_active` на того, кто ответил) → `reveal_answer` → `POST /scores` с `kind=correct|wrong` и `delta = ±price` → `show_board`.

Оценка всегда ручная: бэк не проверяет ответы. Любое начисление можно отменить (`void`), а счёт игрока исправить через `/scores/set`. Экран при каждом изменении счёта получает новый снимок (поле `players[].score`) и может показать анимацию изменения.

## 8. WebSocket

`GET /ws/sessions/:id?role=screen&token=<screen_token>` — для экрана.
`GET /ws/sessions/:id?role=host&token=<jwt>` — для пульта.

Сообщения сервера (JSON):

| type | Когда | payload |
|---|---|---|
| `snapshot` | сразу после подключения | полный снимок для роли |
| `update` | после любой команды, начисления очков или отката | полный снимок для роли |
| `session_closed` | сессия завершена или токен перевыпущен | — |
| `pong` | ответ на `ping` | — |

Клиент → сервер: только `{ "type": "ping" }`. Все команды идут через REST, а WebSocket работает в одну сторону.

Требования:
- Комната на каждый `sessionId`, для рассылки готовятся два варианта снимка (screen и host).
- Серверный ping каждые 25 секунд, мёртвые соединения закрывать.
- Подключений единицы, поэтому состояние комнат хранится в памяти процесса. Redis не нужен.
- Снимок небольшой, присылаем его целиком, а не diff.
- При неверном токене закрыть соединение с кодом 4401.

## 9. Безопасность

- Пароли — argon2. JWT подписывается `JWT_SECRET`, срок жизни 12 часов.
- Роли: `admin` может всё, `host` только `/sessions/*` и чтение игр и участников.
- CORS: разрешить только origin из `ALLOWED_ORIGINS`, без `credentials`.
- Экран открывается по `screen_token` (32 случайных байта, base64url). Токен показывается только в `screenUrl` при создании сессии и при перевыпуске.
- Первый админ создаётся командой `pnpm seed` из переменных `ADMIN_LOGIN` и `ADMIN_PASSWORD`. Открытой регистрации нет.
- Адрес API не секрет (он виден во фронте), защита построена на авторизации.

## 10. Конфигурация (.env)

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://user:pass@db:5432/quiz
JWT_SECRET=<длинная случайная строка>
UPLOADS_DIR=/data/uploads
PUBLIC_UPLOADS_URL=https://api.example.com/uploads
ALLOWED_ORIGINS=https://<user>.github.io
SCREEN_URL_BASE=https://<user>.github.io/quiz-web/screen/#
ADMIN_LOGIN=
ADMIN_PASSWORD=
```

Все переменные проверяются через zod при старте. Если чего-то не хватает, сервер не запускается. Для локальной разработки в `ALLOWED_ORIGINS` добавляется `http://localhost:5173,http://localhost:5174`.

## 11. Тесты и критерии готовности

Обязательные тесты:
- Движок: каждый допустимый переход, каждый недопустимый, `back` на всю глубину, повторное открытие сыгранного вопроса (`409`), смена раунда.
- Снимок: у screen нет `answerText` до `reveal_answer`, нет `comment` и содержимого сетки; у host всё есть.
- Команды: параллельные запросы дают корректный `version`; `expectedVersion` отклоняет устаревшие.
- Очки: начисление, отрицательные значения, отмена, сумма в `players[].score`.
- Авторизация: без токена 401, `host` не может править игры (403).
- WebSocket: экран получает `snapshot` при подключении и `update` после команды; неверный токен отключается.

Этап готов, когда:
1. Все эндпоинты из раздела 7 работают и описаны в OpenAPI (`/docs`, `/docs/json`).
2. Один сценарий проходит от начала до конца через curl и WebSocket-клиент: создать игру с двумя раундами → сессию → пройти все состояния → начислить очки → `finish`.
3. Тесты зелёные, миграции накатываются на пустую БД, `pnpm seed` создаёт админа и демо-игру.

## 12. Порядок разработки

1. Каркас: Fastify, конфиг, БД, миграции, обработчик ошибок, `/api/health`.
2. Авторизация и роли.
3. Игры, раунды, темы, вопросы (CRUD, порядок, валидация).
4. Медиа.
5. Участники.
6. Движок (`engine.ts` и тесты) — до подключения к HTTP.
7. Сессии: команды, история, откат, очки.
8. WebSocket и снимки по ролям.
9. OpenAPI, seed, Docker.

После шага 3 админка может подключаться к реальному API, а после шага 8 можно подключать экран и пульт.

## 13. Инфраструктура

```
  GitHub Pages                         VPS
┌──────────────────┐            ┌──────────────────────────┐
│ /screen/  (Vue)  │            │ nginx (TLS) → api (Node) │
│ /control/ (Vue)  │ ─ HTTPS ─► │             → Postgres   │
└──────────────────┘ ─ WSS ───► │             → uploads/   │
                                └──────────────────────────┘
```

- Фронты — статика на GitHub Pages. Всё, что нужно им от VPS, — API, `wss://` и `/uploads`.
- VPS (2 vCPU, 2–4 ГБ) с `docker compose`: `nginx`, `api`, `db`. nginx терминирует TLS (Let's Encrypt), проксирует `/api`, `/ws` (с заголовками Upgrade) и `/uploads` на `api:3000`.
- HTTPS и WSS обязательны: страница на HTTPS не может обращаться к `http://` и `ws://`.
- Бэкапы: ежедневный `pg_dump` и копия `uploads` (cron).
- CI (GitHub Actions): lint, typecheck, tests, сборка образа, деплой по SSH.
