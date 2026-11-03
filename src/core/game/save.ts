// Định dạng file save, kiểm tra state khi load, và đổi seed sau khi load (để reroll được).
// Hàm thuần: đọc / ghi file do main process làm; thời điểm lưu (savedAt) do nơi gọi truyền vào.
//
// File save là JSON: { format, gameId, kind, savedAt, summary, state }.
// state là GameState ("nguyên liệu", không lưu chỉ số đã tính). summary chỉ để hiện danh sách
// save; khi load luôn tính lại từ state, không tin summary trong file.
// Mọi Decimal lưu thành chuỗi (serializeState); đọc lại bằng deserializeState (trong migrateState).

import { asObject, createRng, DataError, Decimal, nextUint32 } from '../shared'
import { validateGameState } from './validateGameState'
import { biomeOfFloor } from '../world'
import { unequipIneligible, type UnequippedItem } from '../roster'
import { grantKeyItems } from '../inventory'
import { migrateState } from './migrate'
import { DIFFICULTIES, type Difficulty, type GameData, type GameState } from '../model'

export const SAVE_FORMAT = 'my-creature-collector-save'

export type SaveKind = 'auto' | 'manual'

/** Vị trí trong tóm tắt save: id và số, tên biome dịch khi hiển thị. */
export type SaveLocationSummary =
  { type: 'town' } | { type: 'floor'; floor: number; biomeId: string }

/**
 * Tóm tắt một save để hiện trong danh sách (tính từ state). Không chứa chữ hiển thị (mục
 * "Đa ngôn ngữ"): chỉ id và số, đổi ngôn ngữ không ảnh hưởng save.
 */
export interface SaveSummary {
  /** Biệt danh quái đầu đội; null thì hiện tên loài (leaderSpeciesId) theo ngôn ngữ. */
  leaderNickname: string | null
  /** null nếu đội rỗng (không xảy ra với state hợp lệ). */
  leaderSpeciesId: string | null
  highestLevel: number
  partySize: number
  totalMonsters: number
  /** Chuỗi số (Decimal.toString). */
  money: string
  location: SaveLocationSummary
  inBattle: boolean
  /** Độ khó và chế độ thử thách (docs/rules/challenge-modes.md): hiện ở danh sách, luật Hardcore. */
  challenge: SaveChallengeSummary
}

/** Phần thử thách của tóm tắt save. */
export interface SaveChallengeSummary {
  difficulty: Difficulty
  nuzlocke: boolean
  hardcore: boolean
  randomizer: boolean
  gameOver: boolean
}

export interface SaveFile {
  format: typeof SAVE_FORMAT
  gameId: string
  kind: SaveKind
  /** Thời điểm lưu, chuỗi ISO 8601. */
  savedAt: string
  summary: SaveSummary
  state: GameState
}

/** Đổi mọi Decimal trong dữ liệu thành chuỗi (Decimal.toString), giữ nguyên phần còn lại. */
function toJsonValue(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  const object = asObject(value)
  if (!object) return value
  return Object.fromEntries(Object.entries(object).map(([key, field]) => [key, toJsonValue(field)]))
}

/** State dạng ghi được ra JSON: mọi Decimal thành chuỗi (ví dụ "1.2345e+40"). */
export function serializeState(state: GameState): unknown {
  return toJsonValue(state)
}

/** Id game: chữ thường, số, gạch ngang (dùng làm tên thư mục, chống path traversal). */
export function isValidGameId(gameId: unknown): gameId is string {
  return typeof gameId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(gameId)
}

export function summarizeState(data: GameData, state: GameState): SaveSummary {
  const leader = state.party[0]
  const all = [...state.party, ...state.storage]
  const { location } = state
  return {
    leaderNickname: leader?.nickname ?? null,
    leaderSpeciesId: leader?.speciesId ?? null,
    highestLevel: all.reduce((max, m) => Math.max(max, m.level), 0),
    partySize: state.party.length,
    totalMonsters: all.length,
    money: state.money.toString(),
    location:
      location.type === 'town'
        ? { type: 'town' }
        : {
            type: 'floor',
            floor: location.floor,
            biomeId: biomeOfFloor(data, state, location.floor).id
          },
    inBattle: state.battle !== null,
    challenge: {
      difficulty: state.options.difficulty,
      nuzlocke: state.options.nuzlocke !== null,
      hardcore: state.options.hardcore,
      randomizer: state.options.randomizer !== null,
      gameOver: state.challenge.gameOver
    }
  }
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

function parseLocationSummary(value: unknown): SaveLocationSummary | null {
  const location = asObject(value)
  if (location?.type === 'town') return { type: 'town' }
  if (location?.type !== 'floor' || !isCount(location.floor)) return null
  if (typeof location.biomeId !== 'string') return null
  return { type: 'floor', floor: location.floor, biomeId: location.biomeId }
}

function parseChallengeSummary(value: unknown): SaveChallengeSummary | null {
  const raw = asObject(value)
  if (!raw || !DIFFICULTIES.some((difficulty) => difficulty === raw.difficulty)) return null
  const flags = [raw.nuzlocke, raw.hardcore, raw.randomizer, raw.gameOver]
  if (flags.some((flag) => typeof flag !== 'boolean')) return null
  return {
    // Ép kiểu vì đã kiểm tra thuộc DIFFICULTIES và boolean ở trên.
    difficulty: raw.difficulty as Difficulty,
    nuzlocke: raw.nuzlocke as boolean,
    hardcore: raw.hardcore as boolean,
    randomizer: raw.randomizer as boolean,
    gameOver: raw.gameOver as boolean
  }
}

/**
 * Đọc summary trong file save (chỉ để hiện danh sách, không tin khi load). Sai dạng hoặc dạng cũ
 * (trước khi tách chữ, có leaderName / locationName) thì null: danh sách hiện gameId cho tới lần
 * lưu sau.
 */
export function parseSaveSummary(value: unknown): SaveSummary | null {
  const raw = asObject(value)
  if (!raw) return null
  const location = parseLocationSummary(raw.location)
  const challenge = parseChallengeSummary(raw.challenge)
  if (
    !location ||
    !challenge ||
    !isStringOrNull(raw.leaderNickname) ||
    !isStringOrNull(raw.leaderSpeciesId) ||
    !isCount(raw.highestLevel) ||
    !isCount(raw.partySize) ||
    !isCount(raw.totalMonsters) ||
    typeof raw.money !== 'string' ||
    typeof raw.inBattle !== 'boolean'
  ) {
    return null
  }
  return {
    leaderNickname: raw.leaderNickname,
    leaderSpeciesId: raw.leaderSpeciesId,
    highestLevel: raw.highestLevel,
    partySize: raw.partySize,
    totalMonsters: raw.totalMonsters,
    money: raw.money,
    location,
    inBattle: raw.inBattle,
    challenge
  }
}

export function serializeSave(
  data: GameData,
  options: { gameId: string; kind: SaveKind; savedAt: string; state: GameState }
): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    gameId: options.gameId,
    kind: options.kind,
    savedAt: options.savedAt,
    summary: summarizeState(data, options.state),
    state: options.state
  }
  return JSON.stringify({ ...file, state: serializeState(file.state) }, null, 2)
}

// ---------- Đọc file save ----------

/**
 * Kết quả đọc save. `unequipped`: món unique bị tự tháo về túi vì quái không còn đủ điều kiện lắp
 * (dữ liệu game đổi giữa các phiên bản), để UI báo người chơi.
 */
export type ParsedSave =
  { ok: true; save: SaveFile; unequipped: UnequippedItem[] } | { ok: false; issues: string[] }

/**
 * Đọc nội dung file save: parse JSON, kiểm tra định dạng, migrate lên version hiện tại,
 * kiểm tra toàn bộ state, tháo món unique quái không còn lắp được. Không bao giờ ném lỗi.
 */
export function parseSave(data: GameData, text: string): ParsedSave {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, issues: ['file không phải JSON hợp lệ (có thể đã hỏng)'] }
  }
  const file = asObject(raw)
  if (!file || file.format !== SAVE_FORMAT) {
    return { ok: false, issues: ['không phải file save của game này'] }
  }
  const issues: string[] = []
  const gameId = isValidGameId(file.gameId) ? file.gameId : null
  if (gameId === null) issues.push('gameId không hợp lệ')
  const kind = file.kind === 'auto' || file.kind === 'manual' ? file.kind : null
  if (kind === null) issues.push('loại save không hợp lệ')
  const savedAt =
    typeof file.savedAt === 'string' && !Number.isNaN(Date.parse(file.savedAt))
      ? file.savedAt
      : null
  if (savedAt === null) issues.push('thời điểm lưu không hợp lệ')
  if (gameId === null || kind === null || savedAt === null) return { ok: false, issues }

  let state: GameState
  try {
    state = migrateState(file.state, data)
  } catch (error) {
    if (error instanceof DataError) return { ok: false, issues: error.issues }
    return { ok: false, issues: [`không nâng cấp được save: ${String(error)}`] }
  }
  const problems = validateGameState(data, state)
  if (problems.length > 0) return { ok: false, issues: problems }
  // Dữ liệu đổi tầng đạo quán của vật phẩm chìa khóa: nhận món còn thiếu của đạo quán đã thắng.
  const clearedGyms = state.trainers.gyms.filter((gym) => gym.wins > 0).map((gym) => gym.floor)
  const granted = grantKeyItems(data, state.inventory, clearedGyms)
  const fitted = unequipIneligible(data, { ...state, inventory: granted.inventory })

  return {
    ok: true,
    save: {
      format: SAVE_FORMAT,
      gameId,
      kind,
      savedAt,
      summary: summarizeState(data, fitted.state),
      state: fitted.state
    },
    unequipped: fitted.removed
  }
}

/**
 * Đổi seed sau khi load: trộn entropy mới vào rng để làm lại cùng action ra kết quả khác
 * (reroll). Core vẫn tất định: state sau khi trộn đã khác state trong file. Game Hardcore giữ seed.
 */
export function reseedState(state: GameState, entropy: number): GameState {
  // Hardcore: mở lại ra đúng kết quả cũ, không reroll được (docs/rules/challenge-modes.md).
  if (state.options.hardcore) return state
  const [, rng] = nextUint32(createRng((state.rng ^ entropy) >>> 0))
  return { ...state, rng }
}

// ---------- Hardcore (docs/rules/challenge-modes.md) ----------

/** Thông tin một save trong danh sách đủ để xét luật Hardcore. */
export interface SaveListing {
  id: string
  gameId: string
  kind: SaveKind
  savedAt: string
  summary: SaveSummary | null
}

/** Lưu tay được không: game Hardcore chỉ có tự lưu. */
export const canSaveManually = (summary: SaveSummary | null): boolean =>
  summary?.challenge.hardcore !== true

/**
 * Mở được save `id` không: game Hardcore (theo save mới nhất của game) chỉ mở được save mới nhất,
 * chặn tải lại save cũ để thử lại. Save không có trong danh sách: được (main báo lỗi đọc file).
 */
export function canLoadSave(saves: readonly SaveListing[], id: string): boolean {
  const target = saves.find((save) => save.id === id)
  if (!target) return true
  const newest = saves
    .filter((save) => save.gameId === target.gameId)
    .reduce((best, save) => (save.savedAt > best.savedAt ? save : best), target)
  if (!newest.summary?.challenge.hardcore) return true
  return newest.id === target.id
}
