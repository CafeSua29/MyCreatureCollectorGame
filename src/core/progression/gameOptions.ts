// Tùy chọn luật chơi bật / tắt của từng game (docs/rules/options.md). Mỗi tùy chọn một mục trong
// GAME_OPTION_RULES: việc phải làm thêm trên state khi đổi (ngoài việc ghi vào options).

import { ActionError, malformedAction } from '../shared'
import { isFainted, keepAlive } from '../monster'
import { difficultyRank } from '../registries'
import {
  DIFFICULTIES,
  GAME_OPTION_FLAGS,
  type ChallengeState,
  type Difficulty,
  type GameAction,
  type GameData,
  type GameOptionFlag,
  type GameOptions,
  type GameState,
  type Monster
} from '../model'

/** Việc làm thêm khi đổi một tùy chọn (state đã ghi giá trị mới vào options). */
type OptionChange = (data: GameData, state: GameState, enabled: boolean) => GameState

/**
 * Thọ nguyên (lifespan.md): mọi quái đang sở hữu (cả trong trứng) đổi cờ aging. Tắt thì tuổi đứng
 * yên và mất hiệu ứng tuổi; bật lại thì tuổi tiếp tục từ chỗ cũ.
 */
const changeLifespan: OptionChange = (data, state, enabled) => {
  // Bật lại có thể làm max HP tụt (ấu niên, lão niên): quái đang sống không bị gục vì vậy.
  const toggle = (monster: Monster): Monster =>
    keepAlive(data, !isFainted(data, monster), { ...monster, aging: enabled })
  return {
    ...state,
    party: state.party.map(toggle),
    storage: state.storage.map(toggle),
    eggs: state.eggs.map((egg) => ({ ...egg, monster: { ...egg.monster, aging: enabled } }))
  }
}

const GAME_OPTION_RULES: Record<GameOptionFlag, OptionChange> = {
  lifespanEnabled: changeLifespan,
  // Chết thật chỉ xét lúc trận kết thúc (battle/permadeath.ts): đổi giữa hai trận không làm gì thêm.
  permadeathEnabled: (_data, state) => state
}

/**
 * Tùy chọn của game mới: mặc định tắt hết (chủ project chốt 2026-10-31), độ khó Thường, không chế độ
 * thử thách. Mức thấp nhất từng dùng = độ khó lúc tạo game; Nuzlocke ép bật chết thật
 * (docs/rules/challenge-modes.md).
 */
export function defaultGameOptions(overrides: Partial<GameOptions> = {}): GameOptions {
  // Ép kiểu vì vừa tạo đủ mọi khóa của GAME_OPTION_FLAGS.
  const flags = Object.fromEntries(GAME_OPTION_FLAGS.map((flag) => [flag, false])) as Record<
    GameOptionFlag,
    boolean
  >
  const difficulty = overrides.difficulty ?? 'normal'
  const options: GameOptions = {
    ...flags,
    difficulty,
    lowestDifficulty: difficulty,
    nuzlocke: null,
    hardcore: false,
    randomizer: null,
    ...overrides
  }
  return options.nuzlocke ? { ...options, permadeathEnabled: true } : options
}

/** Tùy chọn Nuzlocke ép bật: không tắt được khi đang chơi Nuzlocke. */
const NUZLOCKE_FORCED: readonly GameOptionFlag[] = ['permadeathEnabled']

/** Bật / tắt một tùy chọn luật chơi (ngoài trận, ở đâu cũng được). */
export function setGameOption(
  data: GameData,
  state: GameState,
  option: GameOptionFlag,
  enabled: boolean
): GameState {
  if (!GAME_OPTION_FLAGS.includes(option)) throw malformedAction('option không hợp lệ')
  if (typeof enabled !== 'boolean') throw malformedAction('enabled phải là boolean')
  if (state.battle) throw new ActionError('inBattle')
  if (state.options[option] === enabled) {
    throw new ActionError('optionUnchanged', { option, enabled })
  }
  if (state.options.nuzlocke && NUZLOCKE_FORCED.includes(option)) {
    throw new ActionError('nuzlockeLocked', { option })
  }
  const next = { ...state, options: { ...state.options, [option]: enabled } }
  return GAME_OPTION_RULES[option](data, next, enabled)
}

/**
 * Đổi độ khó (ngoài trận, ở đâu cũng được; docs/rules/challenge-modes.md). Xuống thấp hơn mức thấp
 * nhất từng dùng thì ghi lại mức mới.
 */
export function setDifficulty(state: GameState, difficulty: Difficulty): GameState {
  if (!DIFFICULTIES.includes(difficulty)) throw malformedAction('difficulty không hợp lệ')
  if (state.battle) throw new ActionError('inBattle')
  if (state.options.difficulty === difficulty) {
    throw new ActionError('difficultyUnchanged', { difficulty })
  }
  const lowest = state.options.lowestDifficulty
  const lowestDifficulty = difficultyRank(difficulty) < difficultyRank(lowest) ? difficulty : lowest
  return { ...state, options: { ...state.options, difficulty, lowestDifficulty } }
}

/** Nuzlocke đã thua game: chỉ còn rời trận vừa kết thúc, mọi action khác báo lỗi. */
export function assertNotGameOver(state: GameState, action: GameAction): void {
  if (state.challenge.gameOver && action.type !== 'leaveBattle') throw new ActionError('gameOver')
}

/** Tiến độ thử thách của game mới: chưa dùng khu Nuzlocke nào, chưa thua. */
export const newChallengeState = (): ChallengeState => ({ nuzlockeAreas: [], gameOver: false })
