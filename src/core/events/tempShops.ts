// Cửa hàng tạm của event (docs/rules/events.md): tung hàng theo pool (TEMP_SHOP_ROLLERS, cùng khóa
// với TEMP_SHOP_POOL_CHECKS ở gameData/validateEvents.ts), mua bằng buyEventItem. Cửa hàng mất khi
// rời chỗ gặp hoặc đi tiếp (khám phá, đánh quái hoang).

import { assertBagRoom, tamerBonusMultiplier } from '../registries'
import {
  ActionError,
  malformedAction,
  nextInt,
  pick,
  pickWeighted,
  rollPercent,
  spendMoney,
  type Decimal,
  type RngState
} from '../shared'
import {
  addByRef,
  addEquipment,
  equipmentInstanceId,
  isBookableSkill,
  isItemOffered,
  isSameItemRef,
  isSkillBookUsefulForParty,
  isRandomEquipment,
  itemBuyPrice,
  getRefCount,
  parseItemRef,
  requireItemCount,
  rollEquipment,
  rollRarity,
  shopEntryRef,
  skillLearnerCount,
  itemStorage
} from '../inventory'
import { rollShopStock } from '../shop'
import type {
  EquipmentItem,
  GameData,
  GameState,
  NormalRarity,
  ShopEntry,
  TempShopEntry,
  TempShopPool
} from '../model'

/** Đầu vào chung của một lượt tung hàng: RNG và bộ đếm id món trang bị. */
interface RollInput {
  data: GameData
  state: GameState
  rng: RngState
  nextItemId: number
  floor: number
  params: Record<string, unknown>
}

interface RollOutput {
  stock: TempShopEntry[]
  rng: RngState
  nextItemId: number
}

/** Tham số pool đã kiểm tra ở validateEvents. */
interface CountRange {
  min: number
  max: number
}

/** Thêm món vào hàng; món gộp được trùng định danh thì cộng số lượng (sách chợ đen trùng skill). */
function pushEntry(stock: TempShopEntry[], entry: ShopEntry, remaining: number | null): void {
  const ref = shopEntryRef(entry)
  const same = stock.find((existing) => isSameItemRef(shopEntryRef(existing.entry), ref))
  if (same && same.remaining !== null && remaining !== null) same.remaining += remaining
  else stock.push({ entry, remaining })
}

/** Hàng như cửa hàng thị trấn (rollShopStock), lấy `count` món đầu. */
function rollRegular({ data, state, rng, nextItemId, params }: RollInput): RollOutput {
  const range = params.count as CountRange
  const [size, afterSize] = nextInt(rng, range.min, range.max)
  const rolled = rollShopStock(data, afterSize, { ...state, nextItemId })
  const stock = rolled.stock.slice(0, size).map((entry) => ({
    entry,
    remaining: entry.storage === 'instance' ? 1 : null
  }))
  return { stock, rng: rolled.rng, nextItemId: rolled.nextItemId }
}

/** Skill có Bí kíp ở chợ đen: có sách, power > shopMaxPower, có trong ít nhất một learnset. */
const blackMarketSkillCache = new WeakMap<GameData['skills'], string[]>()

function blackMarketSkillIds(data: GameData): string[] {
  const cached = blackMarketSkillCache.get(data.skills)
  if (cached) return cached
  const { shopMaxPower } = data.config.skillBook
  const ids = Object.values(data.skills)
    // Power cao hơn kệ sách cửa hàng, hoặc chiêu không loài nào học (chiêu sự kiện của game gốc như
    // Happy Hour / Celebrate: chỉ có ở chợ đen).
    .filter(
      (skill) =>
        isBookableSkill(data, skill) &&
        (skill.power > shopMaxPower || skillLearnerCount(data, skill.id) === 0)
    )
    .map((skill) => skill.id)
  blackMarketSkillCache.set(data.skills, ids)
  return ids
}

/** Trang bị gốc thường (không unique, không phải hồn khí) bán ở chợ đen. */
const normalEquipmentOf = (data: GameData): EquipmentItem[] =>
  Object.values(data.items).filter(
    (item): item is EquipmentItem => item.category === 'equipment' && isRandomEquipment(item)
  )

/** Một vật phẩm trong hàng chợ đen, trọng số theo giá. */
interface BlackMarketOffer {
  itemId: string
  weight: number
}

type BlackMarketCandidate =
  | { kind: 'item'; entry: BlackMarketOffer; weight: number }
  | { kind: 'equipment'; weight: number }
  | { kind: 'book'; weight: number }

const blackMarketItemCache = new WeakMap<GameData, readonly BlackMarketOffer[]>()

/**
 * Hàng vật phẩm của chợ đen: chỉ đồ hiếm, khó tìm (docs/rules/events.md): gộp chồng, không bán ở cửa
 * hàng thị trấn, giá gốc ≥ minItemPrice, cộng các món extraItemIds; trọng số = giá^itemWeightPower.
 */
export function blackMarketItems(data: GameData): readonly BlackMarketOffer[] {
  const cached = blackMarketItemCache.get(data)
  if (cached) return cached
  const { minItemPrice, itemWeightPower, extraItemIds } = data.config.events.blackMarket
  const pool = Object.values(data.items).flatMap((item) => {
    if (itemStorage(item.category) !== 'stack' || !('price' in item) || item.price <= 0) return []
    const hardToFind = !('shop' in item && item.shop === true) && item.price >= minItemPrice
    if (!hardToFind && !extraItemIds.includes(item.id)) return []
    return [{ itemId: item.id, weight: item.price ** itemWeightPower }]
  })
  blackMarketItemCache.set(data, pool)
  return pool
}

/**
 * Chợ đen (config.events.blackMarket): số lượt đều trong count; mỗi lượt chọn theo trọng số giữa
 * các vật phẩm chưa chọn (số lượng bán đều trong [min, max]), một trang bị thường (bậc theo bảng có
 * hệ số tầng, dòng ở phần trên của khoảng) hoặc một Bí kíp skill mạnh (có tỉ lệ Chân kinh).
 */
function rollBlackMarket({ data, state, rng, nextItemId, floor }: RollInput): RollOutput {
  const config = data.config.events.blackMarket
  const equipmentPool = normalEquipmentOf(data)
  const skillIds = blackMarketSkillIds(data)
  // Như cửa hàng: món cần vật phẩm chìa khóa (đá Mega, Z-Crystal) chỉ bán khi đã có món đó.
  let items = blackMarketItems(data).filter((entry) => {
    const item = data.items[entry.itemId]
    const keyItemId = 'requiresKeyItemId' in item ? item.requiresKeyItemId : undefined
    if (keyItemId && !state.inventory.stacks[keyItemId]) return false
    return isItemOffered(item, state.options)
  })
  const stock: TempShopEntry[] = []
  let size: number
  ;[size, rng] = nextInt(rng, config.count.min, config.count.max)
  for (let i = 0; i < size; i++) {
    const candidates: BlackMarketCandidate[] = [
      ...items.map((entry) => ({ kind: 'item' as const, entry, weight: entry.weight })),
      ...(equipmentPool.length > 0
        ? [{ kind: 'equipment' as const, weight: config.equipment.weight }]
        : []),
      ...(skillIds.length > 0 ? [{ kind: 'book' as const, weight: config.skillBooks.weight }] : [])
    ].filter((candidate) => candidate.weight > 0)
    if (candidates.length === 0) break
    let chosen: BlackMarketCandidate
    ;[chosen, rng] = pickWeighted(rng, candidates, (candidate) => candidate.weight)
    if (chosen.kind === 'item') {
      const { entry } = chosen
      items = items.filter((candidate) => candidate !== entry)
      pushEntry(stock, { storage: 'stack', itemId: entry.itemId }, 1)
    } else if (chosen.kind === 'equipment') {
      let base: EquipmentItem
      ;[base, rng] = pick(rng, equipmentPool)
      let rarity: NormalRarity
      ;[rarity, rng] = rollRarity(data, rng, config.equipment.rarityWeights, floor)
      const [instance, afterRoll] = rollEquipment(data, rng, {
        itemId: base.id,
        rarity,
        id: equipmentInstanceId(nextItemId++),
        minRollPercent: config.equipment.minRollPercent
      })
      rng = afterRoll
      pushEntry(stock, { storage: 'instance', instance }, 1)
    } else {
      const { partyMultiplier } = data.config.skillBook
      const weightOf = (id: string): number =>
        isSkillBookUsefulForParty(data, state.party, id) ? partyMultiplier : 1
      let skillId: string
      ;[skillId, rng] = pickWeighted(rng, skillIds, weightOf)
      let reusable: boolean
      ;[reusable, rng] = rollPercent(rng, config.skillBooks.reusableChance)
      pushEntry(stock, { storage: 'book', skillId, reusable }, 1)
    }
  }
  return { stock, rng, nextItemId }
}

/** Tinh thể cấp `level` của `count` trait khác nhau thuộc loại `traitKind`, mỗi tinh thể 1 cái. */
function rollCrystals({ data, rng, nextItemId, params }: RollInput): RollOutput {
  const { traitKind, level, count } = params as { traitKind: string; level: number; count: number }
  let remaining = Object.values(data.traits).filter((trait) => trait.kind === traitKind)
  const stock: TempShopEntry[] = []
  while (stock.length < count && remaining.length > 0) {
    let trait: (typeof remaining)[number]
    ;[trait, rng] = pick(rng, remaining)
    remaining = remaining.filter((other) => other !== trait)
    stock.push({ entry: { storage: 'crystal', traitId: trait.id, level }, remaining: 1 })
  }
  return { stock, rng, nextItemId }
}

export const TEMP_SHOP_ROLLERS: Readonly<Record<TempShopPool, (input: RollInput) => RollOutput>> = {
  regular: rollRegular,
  blackMarket: rollBlackMarket,
  crystal: rollCrystals
}

/**
 * Giá mua một món ở cửa hàng tạm: giá cửa hàng × priceMultiplier × kênh thưởng ngự thú sư
 * `shopPricePercent` (docs/rules/tamer-talents.md), làm tròn xuống.
 */
export function tempShopPrice(
  data: GameData,
  state: GameState,
  { entry, priceMultiplier }: { entry: ShopEntry; priceMultiplier: number }
): Decimal {
  return itemBuyPrice(data, entry, state.highestFloor)
    .times(priceMultiplier * tamerBonusMultiplier(data, state, 'shopPricePercent'))
    .floor()
}

/** Chỗ đang đứng (tầng, null = thị trấn). */
export const currentFloor = (state: GameState): number | null =>
  state.location.type === 'floor' ? state.location.floor : null

/**
 * Mua count món ở cửa hàng tạm của event (ngoài trận, còn ở chỗ gặp): món còn đủ số lượng, trả
 * giá × priceMultiplier. Món trang bị mua đúng 1; hết hàng thì món mất khỏi danh sách.
 */
export function buyEventItem(
  data: GameData,
  state: GameState,
  itemRef: unknown,
  count: unknown
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const shop = state.events.tempShop
  if (!shop || shop.floor !== currentFloor(state)) throw new ActionError('noTempShop')
  const ref = parseItemRef(data, itemRef)
  requireItemCount(count)
  const found = shop.stock.find((candidate) => isSameItemRef(shopEntryRef(candidate.entry), ref))
  if (!found) throw new ActionError('notInShop')
  const { entry } = found
  if (entry.storage === 'instance' && count !== 1) {
    throw malformedAction('món trang bị chỉ mua được 1')
  }
  if (found.remaining !== null && count > found.remaining) {
    throw new ActionError('tempShopStockLow', { remaining: found.remaining })
  }
  if (
    entry.storage !== 'instance' &&
    count > Number.MAX_SAFE_INTEGER - getRefCount(state.inventory, entry)
  ) {
    throw new ActionError('stackLimitReached', { max: Number.MAX_SAFE_INTEGER })
  }
  if (entry.storage === 'instance') assertBagRoom(data, state)
  const price = tempShopPrice(data, state, { entry, priceMultiplier: shop.priceMultiplier })
  const paid = spendMoney(state, price.times(count))
  const inventory =
    entry.storage === 'instance'
      ? addEquipment(state.inventory, entry.instance)
      : addByRef(state.inventory, entry, count)
  const stock = shop.stock.flatMap((candidate) => {
    if (candidate !== found || candidate.remaining === null) return [candidate]
    const remaining = candidate.remaining - count
    return remaining > 0 ? [{ ...candidate, remaining }] : []
  })
  return { ...paid, inventory, events: { ...state.events, tempShop: { ...shop, stock } } }
}
