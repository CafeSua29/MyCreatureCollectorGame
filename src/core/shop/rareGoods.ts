// Hàng hiếm khó tìm (docs/rules/events.md mục chợ đen): vật phẩm và Bí kíp skill mạnh không có ở
// cửa hàng thị trấn, theo config.events.blackMarket. Dùng chung cho chợ đen và Đấu giá hành
// (docs/rules/auction.md) để hai nơi cùng một định nghĩa "đồ hiếm".

import {
  isBookableSkill,
  isItemOffered,
  isRandomEquipment,
  itemStorage,
  skillLearnerCount
} from '../inventory'
import type { EquipmentItem, GameData, GameState } from '../model'

const blackMarketSkillCache = new WeakMap<GameData['skills'], string[]>()

/** Skill có Bí kíp ở chợ đen: có sách, power > shopMaxPower, có trong ít nhất một learnset. */
export function blackMarketSkillIds(data: GameData): string[] {
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

/** Một vật phẩm trong hàng chợ đen, trọng số theo giá. */
export interface BlackMarketOffer {
  itemId: string
  weight: number
}

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
 * Hàng vật phẩm hiếm ra được lúc này: như cửa hàng, món cần vật phẩm chìa khóa (đá Mega, Z-Crystal)
 * chỉ ra khi đã có món đó, món cần tùy chọn luật chơi chỉ khi tùy chọn đang bật.
 */
export function offeredBlackMarketItems(
  data: GameData,
  state: Pick<GameState, 'inventory' | 'options'>
): BlackMarketOffer[] {
  return blackMarketItems(data).filter((entry) => {
    const item = data.items[entry.itemId]
    const keyItemId = 'requiresKeyItemId' in item ? item.requiresKeyItemId : undefined
    if (keyItemId && !state.inventory.stacks[keyItemId]) return false
    return isItemOffered(item, state.options)
  })
}

/** Trang bị gốc thường (không unique, không phải hồn khí): chợ đen, Đấu giá hành. */
export const normalEquipmentItems = (data: GameData): EquipmentItem[] =>
  Object.values(data.items).filter(
    (item): item is EquipmentItem => item.category === 'equipment' && isRandomEquipment(data, item)
  )
