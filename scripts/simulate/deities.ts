// Thần linh trong chơi liên tục (mục "Thần linh" ở simulation-features.md, docs/rules/deities.md):
// mỗi lần ở thị trấn (sau mọi việc tốn tiền khác) "người chơi" mua Hương nến ở Miếu (tổng giá ≤
// spendFraction tiền), dâng hết hương cho thần cai quản map của tầng cao nhất (nơi đánh boss / farm),
// rồi đổi tín vật của mọi thần lấy món đắt nhất (theo giá tín vật) đã mở bậc, tới khi không đổi được
// nữa. Ân sủng từ trận / bắt quái / thu phục và chúc phúc chạy thật theo reducer.

import {
  biomeOfFloor,
  deityRank,
  getItemCount,
  incensePrice,
  type DeityShopEntry,
  type GameData,
  type GameState
} from '@core'
import type { EconomyCount } from './economy'
import { simAct } from './events'

export const DEITY_POLICY = {
  /** Tổng giá Hương nến mỗi lần về thị trấn ≤ phần này của tiền. */
  spendFraction: 0.2
} as const

/** Hương nến và tín vật: mô phỏng giữ lại, không bán như nguyên liệu dư. */
export function isDeityCurrency(data: GameData, itemId: string): boolean {
  if (itemId === data.config.deities.incenseItemId) return true
  return Object.values(data.deities).some((deity) => deity.tokenItemId === itemId)
}

/** Mua Hương nến ở Miếu trong ngân sách. */
function buyIncense(data: GameData, state: GameState): GameState {
  const price = incensePrice(data, state)
  if (price.lte(0)) return state
  const count = state.money.times(DEITY_POLICY.spendFraction).div(price).floor().toNumber()
  return count < 1 ? state : simAct(data, state, { type: 'buyIncense', count })
}

/** Món đắt nhất của thần đã mở bậc và đủ tín vật; null nếu không đổi được gì. */
function bestDeal(data: GameData, state: GameState, deityId: string): DeityShopEntry | null {
  const deity = data.deities[deityId]
  const tokens = getItemCount(state.inventory, deity.tokenItemId)
  const rank = deityRank(data, state, deityId)
  const affordable = deity.shop.filter((e) => e.minRank <= rank && e.price <= tokens)
  return affordable.sort((a, b) => b.price - a.price)[0] ?? null
}

/** Ở thị trấn: mua / dâng hương cho thần của tầng cao nhất, đổi tín vật mọi thần. */
export function runDeities(data: GameData, state: GameState, count: EconomyCount): GameState {
  if (state.location.type !== 'town' || state.battle) return state
  state = buyIncense(data, state)
  const incense = getItemCount(state.inventory, data.config.deities.incenseItemId)
  const deityId = biomeOfFloor(data, state, state.highestFloor).deityId
  if (incense > 0 && deityId) {
    state = simAct(data, state, { type: 'offerIncense', deityId, count: incense })
    count.incense += incense
  }
  for (const id of Object.keys(data.deities)) {
    for (let deal = bestDeal(data, state, id); deal; deal = bestDeal(data, state, id)) {
      state = simAct(data, state, {
        type: 'buyDeityItem',
        deityId: id,
        itemId: deal.itemId,
        count: 1
      })
      count.deityBuys++
    }
  }
  return state
}

/** Bậc ân sủng cao nhất trong mọi thần (cột của progression.csv). */
export const highestFavorRank = (data: GameData, state: GameState): number =>
  Math.max(0, ...Object.keys(state.favor).map((id) => deityRank(data, state, id)))
