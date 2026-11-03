// Độ bất ổn tầng (docs/rules/instability.md): đặt mức và đổi thuộc tính ở Đền dịch chuyển (thị
// trấn), lộ thuộc tính ẩn khi ra tầng. Tác dụng trong trận ở battle/instability.ts.

import {
  ActionError,
  levelCost,
  malformedAction,
  spendMoney,
  type Decimal,
  type RngState
} from '../shared'
import { rollInstabilityRules } from '../registries'
import {
  bestFloorReached,
  type GameData,
  type GameState,
  type InstabilityProperty,
  type InstabilityState
} from '../model'
import { assertNoInstance, assertNoTournament } from './field'

/** Độ bất ổn tắt (game mới). */
export const newInstabilityState = (): InstabilityState => ({ level: 0, properties: [] })

/** Mức bất ổn tối đa: ⌊tầng cao nhất từng đạt / floorsPerLevel⌋ (không trần). */
export function maxInstabilityLevel(
  data: GameData,
  state: { highestFloor: number; ascension: { bestFloor: number } }
): number {
  return Math.floor(bestFloorReached(state) / data.config.instability.floorsPerLevel)
}

/** Số thuộc tính của một mức (hiện + ẩn). */
const propertiesPerLevel = (data: GameData): number =>
  data.config.instability.visiblePerLevel + data.config.instability.hiddenPerLevel

/** Giá đổi thuộc tính ở mức hiện tại. */
export function instabilityRerollCost(data: GameData, level: number): Decimal {
  return levelCost(data.config.instability.rerollCostPerLevel, level)
}

/** Ở Đền dịch chuyển: thị trấn, ngoài trận, không dự giải, không trong phó bản. */
function requireShrine(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoTournament(state)
  assertNoInstance(state)
}

/**
 * Tung thuộc tính thêm vào `kept` cho các mức từ `fromLevel` + 1 tới `toLevel`: mỗi mức
 * visiblePerLevel thuộc tính hiện rồi hiddenPerLevel thuộc tính ẩn (thiếu thuộc tính hợp lệ thì mức
 * đó ít hơn). Mô phỏng dùng trực tiếp (quét tầng với độ bất ổn giả định).
 */
export function rollInstabilityLevels(
  data: GameData,
  rng: RngState,
  { kept, fromLevel, toLevel }: { kept: InstabilityProperty[]; fromLevel: number; toLevel: number }
): [InstabilityState, RngState] {
  const { visiblePerLevel } = data.config.instability
  const properties = [...kept]
  for (let level = fromLevel + 1; level <= toLevel; level++) {
    let ruleIds: string[]
    ;[ruleIds, rng] = rollInstabilityRules(data, rng, {
      count: propertiesPerLevel(data),
      existing: properties.map((property) => property.ruleId)
    })
    ruleIds.forEach((ruleId, i) => properties.push({ ruleId, hidden: i >= visiblePerLevel }))
  }
  return [{ level: toLevel, properties }, rng]
}

/** Tung thuộc tính trong state (RNG của save). */
function rollLevels(
  data: GameData,
  state: GameState,
  range: { kept: InstabilityProperty[]; fromLevel: number; toLevel: number }
): GameState {
  const [instability, rng] = rollInstabilityLevels(data, state.rng, range)
  return { ...state, rng, instability }
}

/**
 * Đặt mức bất ổn (0 = tắt): tăng mức thì giữ thuộc tính cũ và tung thêm cho các mức mới; giảm mức
 * thì bỏ thuộc tính của các mức trên.
 */
export function setInstability(data: GameData, state: GameState, level: unknown): GameState {
  if (!Number.isSafeInteger(level) || (level as number) < 0) {
    throw malformedAction(`mức bất ổn phải là số nguyên ≥ 0, nhận "${String(level)}"`)
  }
  // Ép kiểu: vừa kiểm tra là số nguyên an toàn.
  const target = level as number
  requireShrine(state)
  const max = maxInstabilityLevel(data, state)
  if (target > max) throw new ActionError('instabilityLevelTooHigh', { level: target, max })
  const current = state.instability
  if (target === current.level) throw new ActionError('instabilityUnchanged', { level: target })
  if (target < current.level) {
    const kept = current.properties.slice(0, target * propertiesPerLevel(data))
    return { ...state, instability: { level: target, properties: kept } }
  }
  return rollLevels(data, state, {
    kept: current.properties,
    fromLevel: current.level,
    toLevel: target
  })
}

/** Đổi toàn bộ thuộc tính ở mức hiện tại, trả rerollCostPerLevel × mức tiền. */
export function rerollInstability(data: GameData, state: GameState): GameState {
  requireShrine(state)
  const { level } = state.instability
  if (level === 0) throw new ActionError('instabilityOff')
  const paid = spendMoney(state, instabilityRerollCost(data, level))
  return rollLevels(data, paid, { kept: [], fromLevel: 0, toLevel: level })
}

/** Rời thị trấn ra tầng: thuộc tính ẩn lộ ra (không có thuộc tính ẩn thì giữ nguyên state). */
export function revealInstability(state: GameState): GameState {
  const { properties } = state.instability
  if (!properties.some((property) => property.hidden)) return state
  const revealed = properties.map((property) => ({ ...property, hidden: false }))
  return { ...state, instability: { ...state.instability, properties: revealed } }
}
