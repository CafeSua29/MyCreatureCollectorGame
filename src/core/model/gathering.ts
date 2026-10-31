// Câu cá và khai thác trên tầng (docs/rules/gathering.md): action có RNG (không phải minigame), cần
// dụng cụ (bùa cấp cần câu / cuốc), ra quái của map hoặc vật phẩm. Map nào làm được ghi ở trường
// `gathering` của biome; quái, bảng vật phẩm và số ở balance.json khóa `gathering`.

import type { ItemReward } from './trainers'
import type { ChestItemEntry } from './trials'

/** Cách thu thập trên tầng; thêm cách = thêm vào đây + một mục ở GATHERING_METHOD_RULES. */
export const GATHERING_METHODS = ['fishing', 'mining'] as const

export type GatheringMethod = (typeof GATHERING_METHODS)[number]

/**
 * Một món của bảng thu thập: `minTier` = cấp dụng cụ tối thiểu mới ra (bỏ trống = 1); `mapElementId`
 * = chỉ ra ở map có hệ chủ đạo này (Biome.elementIds; linh thạch theo hệ của mỏ...).
 */
export interface GatheringItemEntry extends ChestItemEntry {
  minTier?: number
  mapElementId?: string
}

/** Trường `gathering` của biome: cách nào ghi true thì map làm được cách đó. */
export type BiomeGathering = Partial<Record<GatheringMethod, true>>

/**
 * Một cấp dụng cụ (cấp 1 = phần tử đầu): trọng số loài / món ^ `rarityExponent` (< 1 thì loài, món
 * hiếm dễ ra hơn), level quái gặp + `levelOffset` (tối thiểu 1), số lượt tung bảng vật phẩm.
 */
export interface GatheringToolTier {
  rarityExponent: number
  levelOffset: number
  itemRolls: number
}

/**
 * Số của một cách thu thập: % ra trận (câu cá: thay vật phẩm; khai thác: phục kích sau khi đào), quái
 * gặp được = loài của map mang một hệ trong `elementIds` hoặc thuộc nhóm race trong `raceGroupIds`
 * (trọng số như quái hoang của map), bảng vật phẩm chung, các cấp dụng cụ.
 */
export interface GatheringMethodConfig {
  battleChance: number
  elementIds: string[]
  raceGroupIds: string[]
  items: GatheringItemEntry[]
  tiers: GatheringToolTier[]
}

export type GatheringConfig = Record<GatheringMethod, GatheringMethodConfig>

/** Quái của lần thu thập: không có, cắn câu (trận thường), phục kích (không chạy được ở lượt 1). */
export type GatheringEncounter = 'none' | 'bite' | 'ambush'

/** Kết quả lần thu thập gần nhất (cho UI). */
export interface GatheringResult {
  method: GatheringMethod
  tier: number
  /** Mồi câu đã dùng (null = không dùng). */
  lureItemId: string | null
  items: ItemReward[]
  encounter: GatheringEncounter
}

export interface GatheringState {
  lastResult: GatheringResult | null
}
