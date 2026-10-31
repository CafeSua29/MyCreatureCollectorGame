// Giá thị trường động (mục "Giá thị trường động" ở world-items.md): bán nhiều thì giá bán tụt
// (saturation theo món), mỗi ngày hồi dần; giá dao động theo ngày và mỗi ngày một category được
// giá. Dao động và hàng được giá băm từ ngày (hashToUnit), không lưu và không tốn RNG của save,
// nên load lại hay đổi seed không đổi được giá. Chỉ đổi giá bán; giá mua giữ nguyên.

import { assertNever, hashToUnit, toBig, type Decimal } from '../shared'
import { itemBasePrice, itemSellPrice } from '../inventory'
import {
  ITEM_CATEGORIES,
  dayOf,
  type DayEvent,
  type GameData,
  type GameState,
  type ItemCategory,
  type MarketDropTier,
  type StackableItemRef
} from '../model'

/**
 * Category nào áp giá động. Trang bị bán theo từng món (giá theo bậc) và vật phẩm chìa khóa không
 * bán được nên không áp. Record theo union để thêm category mới mà quên khai báo thì TypeScript báo.
 */
const MARKET_CATEGORY_RULES: Readonly<Record<ItemCategory, boolean>> = {
  consumable: true,
  ball: true,
  evolutionStone: true,
  held: true,
  equipment: false,
  traitCrystal: true,
  fusionAid: true,
  keyItem: false,
  megaStone: true,
  teraShard: true,
  zCrystal: true,
  material: true,
  formationScroll: true,
  recipeScroll: true,
  seed: true,
  skillBook: true,
  soulCrystal: true,
  bait: true,
  charm: false
}

/** Category của item gộp được: tinh thể / sách là category chung `traitCrystal` / `skillBook`. */
function marketCategory(data: GameData, ref: StackableItemRef): ItemCategory {
  switch (ref.storage) {
    case 'stack':
      return data.items[ref.itemId].category
    case 'crystal':
      return 'traitCrystal'
    case 'book':
      return 'skillBook'
    default:
      return assertNever(ref, 'định danh item')
  }
}

/**
 * Key saturation của item gộp được: vật phẩm theo id, tinh thể theo trait (mọi cấp của một trait
 * chung key, chủ project chốt: chống farm một trait mà không phạt trait khác), sách theo skill (Bí
 * kíp và Chân kinh chung key, cùng lý do).
 */
export function marketKey(ref: StackableItemRef): string {
  switch (ref.storage) {
    case 'stack':
      return ref.itemId
    case 'crystal':
      return `crystal:${ref.traitId}`
    case 'book':
      return `book:${ref.skillId}`
    default:
      return assertNever(ref, 'định danh item')
  }
}

/** Hệ số dao động của category trong ngày, trong [dayFactorMin, dayFactorMax]. */
export function marketDayFactor(data: GameData, day: number, category: ItemCategory): number {
  const { dayFactorMin, dayFactorMax } = data.config.market
  return dayFactorMin + hashToUnit('marketDay', day, category) * (dayFactorMax - dayFactorMin)
}

/**
 * Category được giá trong ngày: chọn đều trong các category áp giá động đang có item trong dữ
 * liệu (UI thị trấn hiện "hôm nay được giá"). Không có category nào thì null.
 */
export function marketHotCategory(data: GameData, day: number): ItemCategory | null {
  const present = new Set(Object.values(data.items).map((item) => item.category))
  const candidates = ITEM_CATEGORIES.filter(
    (category) => MARKET_CATEGORY_RULES[category] && present.has(category)
  )
  if (candidates.length === 0) return null
  return candidates[Math.floor(hashToUnit('marketHot', day) * candidates.length)]
}

/**
 * Bậc tụt giá theo giá gốc trong dữ liệu (giá ở tầng 1, không nhân tầng; tinh thể = giá extract, sách
 * = giá ở tầng 1).
 */
function dropTierOf(data: GameData, ref: StackableItemRef): MarketDropTier {
  const rawPrice = itemBasePrice(data, ref, 1)
  const { dropTiers } = data.config.market
  return (
    dropTiers.find((tier) => tier.maxPrice === undefined || rawPrice.lte(tier.maxPrice)) ??
    dropTiers[dropTiers.length - 1]
  )
}

/** Giá bán tối thiểu 1 mỗi cái (giá thị trường không làm món có giá thành 0). */
const atLeastOne = (price: Decimal): Decimal => (price.lt(1) ? toBig(1) : price)

/** Độ bão hòa hiện tại của item (0 nếu chưa bán). */
export function marketSaturation(state: GameState, ref: StackableItemRef): number {
  return Object.hasOwn(state.market.saturation, marketKey(ref))
    ? state.market.saturation[marketKey(ref)]
    : 0
}

/**
 * Tổng tiền bán count cái item gộp được theo giá thị trường: mỗi cái = ⌊giá bán thường ×
 * max(minFactor, 1 − saturation × dropPerUnit) × hệ số ngày × hệ số được giá⌋, tối thiểu 1 (khi
 * giá bán thường > 0); saturation tăng 1 sau mỗi cái nên bán một lần bằng tổng bán lẻ.
 */
export function marketSellTotal(
  data: GameData,
  state: GameState,
  ref: StackableItemRef,
  count: number
): Decimal {
  const base = itemSellPrice(data, ref, state.highestFloor)
  if (base.lte(0)) return toBig(0)
  const day = dayOf(state.time)
  const category = marketCategory(data, ref)
  const hot = marketHotCategory(data, day) === category ? data.config.market.hotMultiplier : 1
  const dayPrice = base.times(marketDayFactor(data, day, category)).times(hot)
  const unitPrice = (factor: Decimal): Decimal => atLeastOne(dayPrice.times(factor).floor())
  const minFactor = toBig(data.config.market.minFactor)
  const { dropPerUnit } = dropTierOf(data, ref)
  const start = marketSaturation(state, ref)
  // Đoạn giá còn tụt dài tối đa (1 − minFactor) / dropPerUnit cái (kiểm tra dữ liệu chặn
  // dropPerUnit quá nhỏ nên vòng lặp có giới hạn); phần còn lại cùng một giá (sàn, hoặc giá gốc
  // khi bậc không tụt). Không lặp theo count vì count có thể tới Number.MAX_SAFE_INTEGER. Hệ số
  // tính bằng Decimal: số thực cho 1 − 6 × 0,1 = 0,3999… làm tròn xuống sai một đồng.
  let total = toBig(0)
  let sold = 0
  if (dropPerUnit > 0) {
    for (; sold < count; sold++) {
      const factor = toBig(1).minus(toBig(start + sold).times(dropPerUnit))
      if (factor.lte(minFactor)) break
      total = total.plus(unitPrice(factor))
    }
  }
  const flatFactor = dropPerUnit > 0 ? minFactor : toBig(1)
  return total.plus(unitPrice(flatFactor).times(count - sold))
}

/** Cộng count cái đã bán vào saturation (kẹp Number.MAX_SAFE_INTEGER). */
export function addMarketSale(state: GameState, ref: StackableItemRef, count: number): GameState {
  const key = marketKey(ref)
  const saturation = Math.min(Number.MAX_SAFE_INTEGER, marketSaturation(state, ref) + count)
  return { ...state, market: { saturation: { ...state.market.saturation, [key]: saturation } } }
}

/**
 * Việc theo ngày (DAILY_TASKS.market): mọi saturation × recoveryPerDay, dưới removeBelow thì xóa
 * key. Không có sự kiện.
 */
export function recoverMarket(data: GameData, state: GameState, _events: DayEvent[]): GameState {
  const { recoveryPerDay, removeBelow } = data.config.market
  const saturation: Record<string, number> = {}
  for (const [key, value] of Object.entries(state.market.saturation)) {
    const recovered = value * recoveryPerDay
    if (recovered >= removeBelow) saturation[key] = recovered
  }
  return { ...state, market: { saturation } }
}
