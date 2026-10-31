// Dữ liệu test cho câu cá và khai thác (docs/rules/gathering.md): dụng cụ (bùa cấp) và mồi câu, nằm
// trong fixture gốc; không bán ở cửa hàng ngẫu nhiên, không rơi nên không đổi RNG của test cũ.

import type { GatheringConfig, Item } from '../model'
// Import vòng với fixtures.ts an toàn: hằng chỉ đọc khi makeRawData gọi gatheringTestConfig.
import { FIXTURE_ENHANCE_STONE_ID } from './fixtures'

export const FIXTURE_GATHERING_ITEM_IDS = {
  oldRod: 'oldRod',
  superRod: 'superRod',
  pickaxe: 'pickaxe',
  lure: 'fishingLure'
} as const

/** Cần câu cấp 1 / 3 (cấp 3 bán từ tầng 3), cuốc cấp 1, mồi câu san đều trọng số (rarityFactor 0). */
export const gatheringTestItems = (): Item[] => {
  const ids = FIXTURE_GATHERING_ITEM_IDS
  return [
    {
      id: ids.oldRod,
      category: 'charm',
      effects: [{ type: 'fishingRodTier', value: 1 }],
      townPrice: 100
    },
    {
      id: ids.superRod,
      category: 'charm',
      effects: [{ type: 'fishingRodTier', value: 3 }],
      townPrice: 1000,
      townMinFloor: 3
    },
    { id: ids.pickaxe, category: 'charm', effects: [{ type: 'pickaxeTier', value: 1 }] },
    { id: ids.lure, category: 'fishingLure', price: 10, rarityFactor: 0 }
  ]
}

/**
 * Câu cá: mọi loài fixture (cỏ, lửa), món cấp 3 masterBall, món của map hệ nước (map fixture không có
 * nên không bao giờ ra); cấp 1 giữ trọng số, cấp 2 căn bậc hai, cấp 3 san đều (số mũ 0). Khai thác:
 * loài hệ cỏ, Đá cường hóa, một cấp.
 */
export const gatheringTestConfig = (): GatheringConfig => ({
  fishing: {
    battleChance: 50,
    elementIds: ['grass', 'fire'],
    raceGroupIds: [],
    items: [
      { itemId: 'potion', weight: 1, min: 1, max: 1 },
      { itemId: 'masterBall', weight: 1, min: 1, max: 1, minTier: 3 },
      { itemId: 'revive', weight: 1, min: 1, max: 1, mapElementId: 'water' }
    ],
    tiers: [
      { rarityExponent: 1, levelOffset: -2, itemRolls: 1 },
      { rarityExponent: 0.5, levelOffset: 0, itemRolls: 1 },
      { rarityExponent: 0, levelOffset: 3, itemRolls: 2 }
    ]
  },
  mining: {
    battleChance: 20,
    elementIds: ['grass'],
    raceGroupIds: [],
    items: [{ itemId: FIXTURE_ENHANCE_STONE_ID, weight: 1, min: 2, max: 2 }],
    tiers: [{ rarityExponent: 1, levelOffset: 0, itemRolls: 1 }]
  }
})
