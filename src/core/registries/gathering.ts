// Luật theo cách thu thập (docs/rules/gathering.md): dụng cụ nào, có mồi câu không, trận thay vật
// phẩm hay sau khi đào, trận có phải phục kích không. Điểm duy nhất để hỏi "đang có dụng cụ cấp mấy".

import type {
  Biome,
  CharmEffectType,
  EncounterEntry,
  GameData,
  GatheringItemEntry,
  GatheringMethod,
  GatheringToolTier,
  Inventory
} from '../model'
import { charmEffect } from './charms'

export interface GatheringMethodRule {
  /** Hiệu ứng bùa cho cấp dụng cụ (cần câu / cuốc). */
  toolEffect: CharmEffectType
  /** Dùng được mồi câu. */
  usesLure: boolean
  /** Ra trận thì vẫn nhận vật phẩm trước (khai thác) hay trận thay cho vật phẩm (câu cá). */
  itemsWithBattle: boolean
  /** Trận là phục kích: không chạy được ở lượt đầu. */
  ambush: boolean
}

/** Thêm cách thu thập = thêm vào GATHERING_METHODS + một mục ở đây (TypeScript báo nếu thiếu). */
export const GATHERING_METHOD_RULES: Readonly<Record<GatheringMethod, GatheringMethodRule>> = {
  // Câu cá: cá cắn câu (trận thường) hoặc kéo lên vật phẩm.
  fishing: { toolEffect: 'fishingRodTier', usesLure: true, itemsWithBattle: false, ambush: false },
  // Khai thác: luôn đào ra khoáng, có tỉ lệ quái đất / đá phục kích sau đó.
  mining: { toolEffect: 'pickaxeTier', usesLure: false, itemsWithBattle: true, ambush: true }
}

/** Cấp dụng cụ đang có cho cách thu thập này (0 = chưa có). */
export const gatheringToolTier = (
  data: GameData,
  inventory: Inventory,
  method: GatheringMethod
): number => charmEffect(data, inventory, GATHERING_METHOD_RULES[method].toolEffect)

/**
 * Số của cấp dụng cụ `tier` (≥ 1); cấp cao hơn số cấp của config thì lấy cấp cuối (bùa cấp lạ đã bị
 * kiểm tra dữ liệu chặn).
 */
export function gatheringTierConfig(
  data: GameData,
  method: GatheringMethod,
  tier: number
): GatheringToolTier {
  const { tiers } = data.config.gathering[method]
  return tiers[Math.min(tier, tiers.length) - 1]
}

/**
 * Quái gặp được khi câu cá / khai thác ở map: loài của map mang một hệ trong config.elementIds hoặc
 * thuộc nhóm race trong config.raceGroupIds, giữ trọng số quái hoang của map.
 */
export function gatheringEncounters(
  data: GameData,
  biome: Biome,
  method: GatheringMethod
): EncounterEntry[] {
  const { elementIds, raceGroupIds } = data.config.gathering[method]
  return biome.encounters.filter(({ speciesId }) => {
    const species = data.species[speciesId]
    // Loài lạ / không phải loài thường đã bị kiểm tra biome báo lỗi; ở đây chỉ bỏ qua.
    if (species?.kind !== 'normal' || !Array.isArray(species.elementIds)) return false
    const groupId = data.races[species.raceId]?.groupId
    return (
      species.elementIds.some((id) => elementIds.includes(id)) ||
      (groupId !== undefined && raceGroupIds.includes(groupId))
    )
  })
}

/** Món của bảng ra được ở map này với cấp dụng cụ `tier` (minTier ≤ cấp, đúng hệ của map). */
export function gatheringItems(
  data: GameData,
  { biome, method, tier }: { biome: Biome; method: GatheringMethod; tier: number }
): GatheringItemEntry[] {
  const mapElements = biome.elementIds ?? []
  return data.config.gathering[method].items.filter(
    (entry) =>
      (entry.minTier ?? 1) <= tier &&
      (entry.mapElementId === undefined || mapElements.includes(entry.mapElementId))
  )
}
