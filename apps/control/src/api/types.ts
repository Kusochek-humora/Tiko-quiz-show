// Типы и контракт API. Позже будут заменены сгенерированными из OpenAPI бэка.

export type Role = 'admin' | 'host'

export interface User {
  id: string
  login: string
  role: Role
}

export type MediaType = 'image' | 'audio' | 'video'

export interface Media {
  id: string
  type: MediaType
  url: string
  originalName: string
  size: number
}

export interface Participant {
  id: string
  name: string
  color: string
  photoMediaId: string | null
  /** Стартовый балл по умолчанию при добавлении в сессию */
  defaultStartScore: number
}

/** Блок содержимого вопроса или ответа. Видео и аудио — просто блоки. */
export type BlockType = 'text' | MediaType

export interface ContentBlock {
  type: BlockType
  text?: string
  mediaId?: string | null
}

export type QuestionKind =
  | 'standard'
  | 'options'
  | 'true_false'
  | 'hints'
  | 'cat_in_bag'
  | 'auction'
  | 'stake'
  | 'blitz'
  | 'reveal_image'
  | 'ordering'
  | 'matching'
  | 'fill_blank'
  | 'word_guess'

/** Настройки зависят от механики, структура описана в docs/backend.md (раздел 4.1) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QuestionSettings = Record<string, any>

export interface Question {
  id: string
  themeId: string
  order: number
  price: number
  kind: QuestionKind
  settings: QuestionSettings
  content: ContentBlock[]
  answerContent: ContentBlock[]
  /** Заметка ведущему, на экран не попадает */
  comment: string
  timeLimitSec: number | null
}

export type QuestionInput = Omit<Question, 'id' | 'themeId' | 'order'>

export interface Theme {
  id: string
  roundId: string
  order: number
  title: string
  questions: Question[]
}

export type RoundType = 'standard' | 'final'

export interface Round {
  id: string
  gameId: string
  order: number
  title: string
  description: string
  type: RoundType
  /** Для final: { finalists: 'leader' | number, mode: 'single_question' | 'elimination' } */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: Record<string, any>
  themes: Theme[]
}

export interface RoundInput {
  title?: string
  description?: string
  type?: RoundType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any>
}

export interface GameSummary {
  id: string
  title: string
  description: string
  roundsCount: number
  questionsCount: number
  updatedAt: string
}

export interface Game {
  id: string
  title: string
  description: string
  rounds: Round[]
  updatedAt: string
}

export interface ParticipantInput {
  name: string
  color: string
  defaultStartScore?: number
  photoMediaId?: string | null
}

export interface Api {
  // auth
  login(login: string, password: string): Promise<{ token: string; user: User }>
  me(): Promise<User>

  // games
  listGames(): Promise<GameSummary[]>
  getGame(id: string): Promise<Game>
  createGame(input: { title: string; description?: string }): Promise<Game>
  updateGame(id: string, input: { title?: string; description?: string }): Promise<void>
  deleteGame(id: string): Promise<void>
  duplicateGame(id: string): Promise<Game>

  // rounds
  createRound(gameId: string, input: RoundInput & { title: string }): Promise<Round>
  updateRound(id: string, input: RoundInput): Promise<void>
  deleteRound(id: string): Promise<void>
  reorderRounds(gameId: string, ids: string[]): Promise<void>

  // themes
  createTheme(roundId: string, input: { title: string }): Promise<Theme>
  updateTheme(id: string, input: { title: string }): Promise<void>
  deleteTheme(id: string): Promise<void>
  reorderThemes(roundId: string, ids: string[]): Promise<void>

  // questions
  createQuestion(themeId: string, input: QuestionInput): Promise<Question>
  updateQuestion(id: string, input: Partial<QuestionInput>): Promise<void>
  deleteQuestion(id: string): Promise<void>

  // media
  listMedia(): Promise<Media[]>
  uploadMedia(file: File): Promise<Media>
  deleteMedia(id: string): Promise<void>

  // participants
  listParticipants(): Promise<Participant[]>
  createParticipant(input: ParticipantInput): Promise<Participant>
  updateParticipant(id: string, input: Partial<Pick<Participant, 'name' | 'color' | 'photoMediaId' | 'defaultStartScore'>>): Promise<void>
  deleteParticipant(id: string): Promise<void>
}

// ---------- сессии и снимок состояния (QUIZ_API.md, разделы 7–11) ----------

export type SessionStatus = 'idle' | 'intro' | 'round_intro' | 'board' | 'question_shown' | 'timer_running' | 'answer_revealed' | 'finished'

export type SessionRole = 'screen' | 'host'

export interface QuizPlayer {
  id: string
  name: string
  color: string
  /** Готовая ссылка на фото или null */
  photo: string | null
  score: number
  order: number
}

export interface QuizCell {
  questionId: string
  price: number
  played: boolean
  /** Только в снимке для пульта */
  question?: { kind: QuestionKind; content: ContentBlock[]; answerContent: ContentBlock[]; comment?: string }
}

export interface QuizTheme {
  id: string
  title: string
  eliminated?: boolean
  cells: QuizCell[]
}

export interface QuizQuestion {
  id: string
  kind: QuestionKind
  price: number
  timeLimitSec: number | null
  themeId: string
  themeTitle: string
  phase: 'prepare' | 'play'
  content: ContentBlock[]
  /** Зависит от механики, см. QUIZ_API.md, раздел 6 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  view: Record<string, any>
  answerContent?: ContentBlock[]
  pointsIfCorrect?: number
  pointsIfWrong?: number
  comment?: string
}

export interface QuizSnapshot {
  sessionId: string
  version: number
  status: SessionStatus
  /** ISO, нужен для поправки на часы */
  serverTime: string
  /** ISO */
  timerEndsAt: string | null
  hostName: string | null
  round: { id: string; title: string; description: string; order: number; total: number; type: RoundType; settings: Record<string, unknown> } | null
  board: { themes: QuizTheme[] } | null
  question: QuizQuestion | null
  finalists: string[] | null
  activeParticipantId: string | null
  players: QuizPlayer[]
  /** Файлы для всех mediaId из снимка */
  media: Record<string, { type: MediaType; url: string }>
  // только для пульта
  canBack?: boolean
  nextRoundAvailable?: boolean
  suggestedFinalists?: string[]
}

export type ScoreKind = 'correct' | 'wrong' | 'bonus' | 'penalty' | 'manual'

export interface ScoreEventDto {
  id: string
  participantId: string
  kind: ScoreKind
  delta: number
  reason: string | null
  questionId: string | null
  voided: boolean
  createdAt: string
}

export interface SessionSummary {
  id: string
  gameId: string
  status: SessionStatus
  hostName: string | null
  createdAt?: string
}

export interface CreatedSession {
  session: SessionSummary
  screenToken: string
  screenUrl: string | null
  snapshot: QuizSnapshot
}

export interface CommandInput {
  type: string
  payload?: Record<string, unknown>
  expectedVersion?: number
}

export interface SessionApi {
  listSessions(): Promise<SessionSummary[]>
  createSession(input: { gameId: string; participantIds: string[]; hostName?: string }): Promise<CreatedSession>
  getSession(id: string): Promise<QuizSnapshot>
  deleteSession(id: string): Promise<void>
  sendCommand(id: string, cmd: CommandInput): Promise<QuizSnapshot>
  rotateScreenToken(id: string): Promise<{ screenToken: string; screenUrl: string | null }>

  listScores(id: string): Promise<ScoreEventDto[]>
  addScore(id: string, input: { participantId: string; kind: ScoreKind; delta: number; reason?: string; questionId?: string | null; expectedVersion?: number }): Promise<QuizSnapshot>
  setScore(id: string, input: { participantId: string; total: number; reason?: string; expectedVersion?: number }): Promise<QuizSnapshot>
  voidScore(id: string, eventId: string, expectedVersion?: number): Promise<QuizSnapshot>

  addSessionPlayer(id: string, input: { participantId: string; startScore?: number; expectedVersion?: number }): Promise<QuizSnapshot>
  patchSessionPlayer(id: string, participantId: string, input: { startScore?: number; order?: number; expectedVersion?: number }): Promise<QuizSnapshot>
  removeSessionPlayer(id: string, participantId: string, expectedVersion?: number): Promise<QuizSnapshot>
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
