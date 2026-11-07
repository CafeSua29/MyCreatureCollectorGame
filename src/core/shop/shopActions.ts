// NPC cửa hàng ở thị trấn (mục "Cửa hàng và vứt vật phẩm"): mua món trong danh sách hàng, bán
// mọi item có giá (kể cả trang bị).

import { ActionError, malformedAction, spendMoney, toBig, type Decimal } from '../shared'
import {
  addByRef,
  addEquipment,
  assertCanLeaveBag,
  getRefCount,
  isSameItemRef,
  itemBuyPrice,
  itemSellPrice,
  parseItemBatch,
  parseItemRef,
  removeByRef,
  requireItemCount,
  shopEntryRef,
  takeEquipment
} from '../inventory'
import {
  assertBagRoom,
  eventModifierMultiplier,
  receiveByRef,
  tamerBonusMultiplier
} from '../registries'
import { bestFloorReached, dayOf, type GameData, type GameState, type ShopEntry } from '../model'
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
 * docs/rules/events.md) × kênh thưởng ngự thú sư `shopPricePercent` (thiên phú Trả Giá,
 * docs/rules/tamer-talents.md), làm tròn xuống.
 */
export function shopBuyPrice(data: GameData, state: GameState, entry: ShopEntry): Decimal {
  const multiplier =
    eventModifierMultiplier(data, state.events.modifiers, 'shopPricePercent') *
    tamerBonusMultiplier(data, state, 'shopPricePercent')
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
    assertBagRoom(data, state)
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
  // Bí kíp mua về có thể thành sticker (docs/rules/skill-stickers.md).
  const { stickers: _stickers, ...received } = receiveByRef(data, state, entry, count)
  return { ...paid, ...received }
}

/**
 * Mua bùa bán ở cửa hàng thị trấn (bùa có townPrice, kiểu Ôn Dưỡng Lò): luôn có hàng (từ tầng
 * townMinFloor nếu có), giá cố định, mỗi loại một lần (bùa có trong túi là có tác dụng, cái thứ hai vô dụng).
 */
export function buyCharm(data: GameData, state: GameState, itemId: string): GameState {
  requireShop(state)
  const item = data.items[itemId]
  if (item?.category !== 'charm' || item.townPrice === undefined) {
    throw new ActionError('charmNotForSale', { itemId, reason: 'notSold' })
  }
  if (getRefCount(state.inventory, { storage: 'stack', itemId }) > 0) {
    throw new ActionError('charmNotForSale', { itemId, reason: 'owned' })
  }
  const minFloor = item.townMinFloor ?? 1
  if (bestFloorReached(state) < minFloor)
    throw new ActionError('charmFloorLocked', { itemId, minFloor })
  const paid = spendMoney(state, toBig(item.townPrice))
  return { ...paid, inventory: addByRef(state.inventory, { storage: 'stack', itemId }, 1) }
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

/**
 * Bán nhiều dòng item trong một action (hàng loạt, docs/rules/bulk-actions.md): lần lượt như sellItem
 * (giá thị trường tụt dần theo số đã bán trước đó trong lệnh); một dòng lỗi thì cả lệnh lỗi.
 */
export function sellItems(data: GameData, state: GameState, items: unknown): GameState {
  return parseItemBatch(items).reduce(
    (current, line) => sellItem(data, current, line.item, line.count),
    state
  )
}

/**
 * Xem trước bán hàng loạt (UI hiện trước khi xác nhận): tổng số cái và tổng tiền nhận được, đúng như
 * khi gửi sellItems. Lệnh không hợp lệ thì ném lỗi như sellItems.
 */
export function previewSellItems(
  data: GameData,
  state: GameState,
  items: unknown
): { count: number; money: Decimal } {
  const sold = sellItems(data, state, items)
  const count = parseItemBatch(items).reduce((total, line) => total + Number(line.count), 0)
  return { count, money: sold.money.minus(state.money) }
}
