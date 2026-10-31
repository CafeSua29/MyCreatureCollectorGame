// NPC cửa hàng ở thị trấn (mục "Cửa hàng và vứt vật phẩm"): mua món trong danh sách hàng, bán
// mọi item có giá (kể cả trang bị).

import { ActionError, malformedAction, spendMoney, type Decimal } from '../shared'
import {
  addByRef,
  addEquipment,
  assertCanLeaveBag,
  getRefCount,
  isSameItemRef,
  itemBuyPrice,
  itemSellPrice,
  parseItemRef,
  removeByRef,
  requireItemCount,
  shopEntryRef,
  takeEquipment
} from '../inventory'
import { eventModifierMultiplier } from '../registries'
import { dayOf, type GameData, type GameState, type ShopEntry } from '../model'
import { addMarketSale, marketSellTotal } from './market'

/** Cửa hàng thị trấn đang mở (không đóng cửa sau thú triều thất bại; docs/rules/events.md). */
export function isShopOpen(state: GameState): boolean {
  const until = state.events.shopClosedUntilDay
  return until === null || dayOf(state.time) > until
}

/** Cửa hàng thị trấn: ngoài trận, ở thị trấn, đang mở. */
function requireShop(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const until = state.events.shopClosedUntilDay
  if (until !== null && !isShopOpen(state)) throw new ActionError('shopClosed', { untilDay: until })
}

/**
 * Giá mua một món ở cửa hàng thị trấn: giá gốc × modifier giá cửa hàng của event (kiểu Hội chợ,
 * docs/rules/events.md), làm tròn xuống.
 */
export function shopBuyPrice(data: GameData, state: GameState, entry: ShopEntry): Decimal {
  const multiplier = eventModifierMultiplier(data, state.events.modifiers, 'shopPricePercent')
  const price = itemBuyPrice(data, entry, state.highestFloor)
  return multiplier === 1 ? price : price.times(multiplier).floor()
}

/**
 * Mua count món đang bán. Item gộp được không giới hạn số lượng, nhưng số lượng trong túi không
 * được vượt Number.MAX_SAFE_INTEGER (túi chỉ kẹp, nên phải chặn ở đây để không mất tiền oan). Món
 * trang bị là bản riêng: mua đúng 1, mua xong thì món mất khỏi danh sách hàng.
 */
export function buyItem(
  data: GameData,
  state: GameState,
  itemRef: unknown,
  count: unknown
): GameState {
  requireShop(state)
  const ref = parseItemRef(data, itemRef)
  requireItemCount(count)
  const entry = state.shop.stock.find((candidate) => isSameItemRef(shopEntryRef(candidate), ref))
  if (!entry) throw new ActionError('notInShop')
  if (entry.storage === 'instance') {
    if (count !== 1) throw malformedAction('món trang bị chỉ mua được 1')
    const paid = spendMoney(state, shopBuyPrice(data, state, entry))
    return {
      ...paid,
      inventory: addEquipment(state.inventory, entry.instance),
      shop: { stock: state.shop.stock.filter((candidate) => candidate !== entry) }
    }
  }
  if (count > Number.MAX_SAFE_INTEGER - getRefCount(state.inventory, entry)) {
    throw new ActionError('stackLimitReached', { max: Number.MAX_SAFE_INTEGER })
  }
  const paid = spendMoney(state, shopBuyPrice(data, state, entry).times(count))
  return { ...paid, inventory: addByRef(state.inventory, entry, count) }
}

/**
 * Bán count món. Item gộp được theo giá thị trường động (marketSellTotal, rồi cộng saturation);
 * món trang bị theo giá bậc như cũ: sellPercent % giá gốc, làm tròn xuống.
 */
export function sellItem(
  data: GameData,
  state: GameState,
  itemRef: unknown,
  count: unknown
): GameState {
  requireShop(state)
  const ref = parseItemRef(data, itemRef)
  assertCanLeaveBag(data, ref)
  requireItemCount(count)
  if (ref.storage === 'instance') {
    const [instance] = takeEquipment(state.inventory, ref.instanceId)
    const inventory = removeByRef(state.inventory, ref, count)
    const price = itemSellPrice(data, { storage: 'instance', instance }, state.highestFloor)
    return { ...state, inventory, money: state.money.plus(price) }
  }
  const inventory = removeByRef(state.inventory, ref, count)
  const earned = marketSellTotal(data, state, ref, count)
  return { ...addMarketSale(state, ref, count), inventory, money: state.money.plus(earned) }
}
