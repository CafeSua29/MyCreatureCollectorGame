// Phi thăng (docs/rules/ascension.md): số suy từ state: Tiên nguyên nhận được, tầng khởi đầu, tiền giữ
// lại, số ô thiên mệnh. Action ở game/ascension.ts.

import { BIG_ZERO, maxBig, toBig, type Decimal } from '../shared'
import { bestFloorReached, type GameData, type GameState } from '../model'
import { tamerBonusAmount, type TamerBonusState } from './tamerBonuses'

type AwakeningHolder = Pick<GameState, 'party' | 'storage' | 'ascension'>

/** Tổng tầng thức tỉnh cao nhất từng đạt: đội + kho hiện tại, hoặc mốc của lần phi thăng trước. */
export function bestAwakeningTotal(state: AwakeningHolder): number {
  const current = [...state.party, ...state.storage].reduce(
    (total, monster) => total + monster.awakening,
    0
  )
  return Math.max(current, state.ascension.bestAwakening)
}

/**
 * Tiên nguyên nhận nếu phi thăng lúc này = ⌊essenceBase × √(tầng cao nhất từng đạt / minFloor) ×
 * (1 + tổng tầng thức tỉnh cao nhất / 100)⌋ − tổng đã nhận (không âm): phải đi xa hơn mới được thêm.
 */
export function ascensionEssenceReward(
  data: GameData,
  state: AwakeningHolder & Pick<GameState, 'highestFloor'>
): Decimal {
  const { essenceBase, minFloor } = data.config.ascension
  const total = toBig(bestFloorReached(state))
    .div(minFloor)
    .sqrt()
    .times(essenceBase)
    .times(toBig(bestAwakeningTotal(state)).div(100).plus(1))
    .floor()
  return maxBig(BIG_ZERO, total.minus(state.ascension.totalEssenceEarned))
}

/** Tầng khởi đầu sau phi thăng: % tầng cao nhất từng đạt (kênh startFloorPercent, có trần), ≥ 1. */
export function ascensionStartFloor(
  data: GameData,
  state: TamerBonusState & Pick<GameState, 'highestFloor' | 'ascension'>
): number {
  const percent = Math.min(
    data.config.ascension.startFloorMaxPercent,
    Math.max(0, tamerBonusAmount(data, state, 'startFloorPercent'))
  )
  return Math.max(1, Math.floor((bestFloorReached(state) * percent) / 100))
}

/** Tiền giữ lại sau phi thăng: % tiền đang có (kênh keepMoneyPercent, có trần), làm tròn xuống. */
export function ascensionKeptMoney(
  data: GameData,
  state: TamerBonusState & Pick<GameState, 'money'>
): Decimal {
  const percent = Math.min(
    data.config.ascension.keepMoneyMaxPercent,
    Math.max(0, tamerBonusAmount(data, state, 'keepMoneyPercent'))
  )
  return state.money.times(percent).div(100).floor()
}

/** Số thiên mệnh chọn được: baseSlots + kênh destinySlots. */
export const destinySlotCount = (data: GameData, state: TamerBonusState): number =>
  data.config.ascension.destiny.baseSlots + tamerBonusAmount(data, state, 'destinySlots')

/** Số lựa chọn đưa ra khi có `slots` ô: choiceCount, mỗi ô thêm một lựa chọn. */
export const destinyChoiceCount = (data: GameData, slots: number): number =>
  data.config.ascension.destiny.choiceCount + Math.max(0, slots - 1)
