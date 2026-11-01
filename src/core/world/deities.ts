// Miếu thần linh ở thị trấn (docs/rules/deities.md): bán Hương nến (luôn có hàng), dâng hương tăng ân
// sủng, đổi tín vật lấy đồ ở cửa hàng thần. Ân sủng / tín vật trong trận ở battle/deities.ts.

import { ActionError, spendMoney, toBig, type Decimal } from '../shared'
import { addItems, getItemCount, itemBuyPrice, removeItems, requireItemCount } from '../inventory'
import { favorOf, favorRank } from '../registries'
import type { DeityDef, DeityShopEntry, GameData, GameState } from '../model'
import { assertNoInstance, assertNoTournament } from './field'

/** Ở Miếu: thị trấn, ngoài trận, không dự giải, không trong phó bản. */
function requireTemple(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoTournament(state)
  assertNoInstance(state)
}

function requireDeity(data: GameData, deityId: unknown): DeityDef {
  if (typeof deityId !== 'string' || !Object.hasOwn(data.deities, deityId)) {
    throw new ActionError('unknownDeity', { deityId: String(deityId) })
  }
  return data.deities[deityId]
}

/** Trừ `count` món trong túi (thiếu: notEnoughItem). */
function spendItems(state: GameState, itemId: string, count: number): GameState {
  const have = getItemCount(state.inventory, itemId)
  if (have < count) throw new ActionError('notEnoughItem', { itemId, have, need: count })
  return { ...state, inventory: removeItems(state.inventory, itemId, count) }
}

/** Bậc ân sủng hiện tại với thần (0 = chưa có chúc phúc). */
export const deityRank = (
  data: GameData,
  state: Pick<GameState, 'favor'>,
  deityId: string
): number => favorRank(data, favorOf(state.favor, deityId))

/** Giá một nén Hương nến ở Miếu (giá vật phẩm × tầng cao nhất như cửa hàng). */
export const incensePrice = (data: GameData, state: Pick<GameState, 'highestFloor'>): Decimal =>
  itemBuyPrice(
    data,
    { storage: 'stack', itemId: data.config.deities.incenseItemId },
    state.highestFloor
  )

/** Mua `count` nén Hương nến ở Miếu (luôn có hàng, không phụ thuộc danh sách hàng của cửa hàng). */
export function buyIncense(data: GameData, state: GameState, count: unknown): GameState {
  requireTemple(state)
  requireItemCount(count)
  const { incenseItemId } = data.config.deities
  if (count > Number.MAX_SAFE_INTEGER - getItemCount(state.inventory, incenseItemId)) {
    throw new ActionError('stackLimitReached', { max: Number.MAX_SAFE_INTEGER })
  }
  const paid = spendMoney(state, incensePrice(data, state).times(count))
  return { ...paid, inventory: addItems(state.inventory, incenseItemId, count) }
}

/** Dâng `count` nén Hương nến cho thần: mỗi nén + favorPerIncense ân sủng. */
export function offerIncense(
  data: GameData,
  state: GameState,
  { deityId, count }: { deityId: unknown; count: unknown }
): GameState {
  requireTemple(state)
  const deity = requireDeity(data, deityId)
  requireItemCount(count)
  const { incenseItemId, favorPerIncense } = data.config.deities
  const paid = spendItems(state, incenseItemId, count)
  const favor = favorOf(state.favor, deity.id).plus(toBig(favorPerIncense).times(count))
  return { ...paid, favor: { ...state.favor, [deity.id]: favor } }
}

/** Món của cửa hàng thần (không bán: deityItemNotSold; chưa đủ bậc: blessingRankTooLow). */
function shopEntryOf(
  data: GameData,
  state: GameState,
  { deity, itemId }: { deity: DeityDef; itemId: unknown }
): DeityShopEntry {
  const entry = deity.shop.find((candidate) => candidate.itemId === itemId)
  if (!entry) {
    throw new ActionError('deityItemNotSold', { deityId: deity.id, itemId: String(itemId) })
  }
  const rank = deityRank(data, state, deity.id)
  if (rank < entry.minRank) {
    throw new ActionError('blessingRankTooLow', { deityId: deity.id, rank, need: entry.minRank })
  }
  return entry
}

/** Đổi tín vật lấy `count` món ở cửa hàng thần (giá cố định bằng tín vật của thần đó). */
export function buyDeityItem(
  data: GameData,
  state: GameState,
  { deityId, itemId, count }: { deityId: unknown; itemId: unknown; count: unknown }
): GameState {
  requireTemple(state)
  const deity = requireDeity(data, deityId)
  requireItemCount(count)
  const entry = shopEntryOf(data, state, { deity, itemId })
  if (count > Number.MAX_SAFE_INTEGER - getItemCount(state.inventory, entry.itemId)) {
    throw new ActionError('stackLimitReached', { max: Number.MAX_SAFE_INTEGER })
  }
  const cost = entry.price * count
  if (!Number.isSafeInteger(cost)) {
    const have = getItemCount(state.inventory, deity.tokenItemId)
    throw new ActionError('notEnoughItem', { itemId: deity.tokenItemId, have, need: cost })
  }
  const paid = spendItems(state, deity.tokenItemId, cost)
  return { ...paid, inventory: addItems(paid.inventory, entry.itemId, count) }
}
