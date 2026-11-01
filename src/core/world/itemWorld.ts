// Tầng của Khí giới bí cảnh (docs/rules/artifact-spirits.md): tầng sức mạnh theo bậc + cấp món và
// tầng đang đánh (không theo tầng thế giới), boss theo tầng (Khí Tướng / Khí Vương / Khí Thần).

import type { EquipmentInstance, GameData, ItemWorldBossTier } from '../model'

/**
 * Tầng sức mạnh của tầng `depth` trong món: rarityFloors[bậc] + ⌈floorsPerDepth × depth +
 * floorsPerLevel × (cấp − 1)⌉, tối thiểu 1 (món hiếm, cấp cao, đi sâu thì quái mạnh hơn).
 */
export function itemWorldPowerFloor(
  data: GameData,
  instance: EquipmentInstance,
  depth: number
): number {
  const config = data.config.artifactSpirits.itemWorld
  const extra = config.floorsPerDepth * depth + config.floorsPerLevel * (instance.level - 1)
  return Math.max(1, config.rarityFloors[instance.rarity] + Math.ceil(extra))
}

/**
 * Bậc boss của tầng `depth`: bậc cuối (theo thứ tự config) có `every` chia hết tầng; null = trận
 * thường. Lặp mãi theo tầng (Khí Thần ở tầng 100, 200…; không trần).
 */
export function itemWorldBossTier(data: GameData, depth: number): ItemWorldBossTier | null {
  let tier: ItemWorldBossTier | null = null
  for (const entry of data.config.artifactSpirits.itemWorld.bosses) {
    if (depth % entry.every === 0) tier = entry
  }
  return tier
}
