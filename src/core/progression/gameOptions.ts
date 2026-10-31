// Tùy chọn luật chơi bật / tắt của từng game (docs/rules/options.md). Mỗi tùy chọn một mục trong
// GAME_OPTION_RULES: việc phải làm thêm trên state khi đổi (ngoài việc ghi vào options).

import { ActionError, malformedAction } from '../shared'
import { isFainted, keepAlive } from '../monster'
import {
  GAME_OPTION_FLAGS,
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

/** Tùy chọn của game mới: mặc định tắt hết (chủ project chốt 2026-10-31). */
export function defaultGameOptions(overrides: Partial<GameOptions> = {}): GameOptions {
  const options = Object.fromEntries(GAME_OPTION_FLAGS.map((flag) => [flag, false]))
  // Ép kiểu vì vừa tạo đủ mọi khóa của GAME_OPTION_FLAGS ở trên.
  return { ...(options as GameOptions), ...overrides }
}

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
  const next = { ...state, options: { ...state.options, [option]: enabled } }
  return GAME_OPTION_RULES[option](data, next, enabled)
}
