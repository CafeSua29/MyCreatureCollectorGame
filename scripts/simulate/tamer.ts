// Ngự thú sư trong mô phỏng (mục "Ngự thú sư" ở simulation-features.md): "người chơi" đột phá cảnh
// giới khi đủ EXP (mua Phá Cảnh Đan ở cửa hàng nếu thiếu và có bán); quét tầng giả định cảnh giới
// theo tầng.

import {
  breakthroughCost,
  breakthroughItemCount,
  expToNextRealm,
  getItemCount,
  itemBuyPrice,
  type GameData,
  type GameState
} from '@core'
import { simAct, shopStock } from './events'

/**
 * Quét tầng / quét map / tìm level: cảnh giới giả định của người chơi ở tầng `floor` = ⌊(tầng − 1) /
 * 10⌋, như luật migrate save cũ (docs/rules/tamer.md); chơi liên tục thì đo cảnh giới thật.
 */
export const assumedTamerRealm = (floor: number): number => Math.floor((floor - 1) / 10)

/** Kết quả các lần thử đột phá sau một trận. */
export interface BreakthroughTry {
  state: GameState
  successes: number
  failures: number
}

/** Mua thêm Phá Cảnh Đan cho đủ `need` nếu cửa hàng đang bán và đủ tiền (sau khi trừ tiền đột phá). */
function buyPills(data: GameData, state: GameState, need: number): GameState {
  const { itemId } = data.config.tamer.breakthrough
  const missing = need - getItemCount(state.inventory, itemId)
  if (missing <= 0) return state
  const item = { storage: 'stack', itemId } as const
  const sold = shopStock(state).some(
    (entry) => entry.storage === 'stack' && entry.itemId === itemId
  )
  if (!sold) return state
  const price = itemBuyPrice(data, item, state.highestFloor).times(missing)
  if (state.money.lt(price.plus(breakthroughCost(data, state.tamer.realm)))) return state
  return simAct(data, state, { type: 'buyItem', item, count: missing })
}

/** Đủ điều kiện đột phá từ cảnh giới hiện tại (EXP, tiền, đan). */
function canBreakthrough(data: GameData, state: GameState): boolean {
  const { realm, exp } = state.tamer
  const { itemId } = data.config.tamer.breakthrough
  return (
    exp.gte(expToNextRealm(data, realm)) &&
    state.money.gte(breakthroughCost(data, realm)) &&
    getItemCount(state.inventory, itemId) >= breakthroughItemCount(realm)
  )
}

/**
 * Ở thị trấn: đột phá liên tục tới khi không còn đủ điều kiện (mỗi lần có thể thất bại). Gọi khi
 * state đang ở thị trấn, ngoài trận.
 */
export function breakthroughWhilePossible(data: GameData, state: GameState): BreakthroughTry {
  let successes = 0
  let failures = 0
  for (;;) {
    if (state.tamer.exp.lt(expToNextRealm(data, state.tamer.realm))) break
    state = buyPills(data, state, breakthroughItemCount(state.tamer.realm))
    if (!canBreakthrough(data, state)) break
    const before = state.tamer.realm
    state = simAct(data, state, { type: 'tamerBreakthrough' })
    if (state.tamer.realm > before) successes++
    else failures++
  }
  return { state, successes, failures }
}

/** EXP ngự thú sư đủ để thử đột phá (người chơi về thị trấn để đột phá). */
export const readyToBreakthrough = (data: GameData, state: GameState): boolean =>
  state.tamer.exp.gte(expToNextRealm(data, state.tamer.realm))
