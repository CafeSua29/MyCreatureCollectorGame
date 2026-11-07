// Công thức của Thợ rèn (docs/rules/equipment-forge.md): giá cường hóa, số đá đã dùng, giá tẩy
// luyện, đồ nhận khi phân giải, giá và bảng bậc khi đúc. Hàm thuần, action ở roster/forgeActions.ts.

import { toBig, type Decimal } from '../shared'
import type { EquipmentInstance, GameData, NormalRarity, StickerInstance } from '../model'
import { boostRareWeights } from './equipment'

/** Giá cường hóa món cấp n → n + 1. */
export interface EnhanceCost {
  money: Decimal
  stones: number
  /** Số món của nhóm coreEnhance.groupId (yêu đan bất kỳ) cần thêm ở cấp cao. */
  cores: number
}

/**
 * Cường hóa cấp n → n + 1: enhanceBase × hệ số giá của bậc × n² tiền + n Đá cường hóa (không trần);
 * từ cấp coreEnhance.fromLevel thêm ⌊(n − fromLevel) / step⌋ + 1 món của nhóm.
 */
export function enhanceCost(data: GameData, instance: EquipmentInstance): EnhanceCost {
  const level = instance.level
  const factor = data.config.equipment.rarityPriceMultipliers[instance.rarity]
  const money = toBig(data.config.forge.enhanceBase).times(factor).times(toBig(level).pow(2))
  const { fromLevel, step } = data.config.forge.coreEnhance
  const cores = level < fromLevel ? 0 : Math.floor((level - fromLevel) / step) + 1
  return { money, stones: level, cores }
}

/** Tiền mỗi lần đúc trang bị: cast.money × tầng cao nhất. */
export const castMoney = (data: GameData, highestFloor: number): Decimal =>
  toBig(data.config.forge.cast.money).times(highestFloor)

/**
 * Bảng bậc khi đúc với `cores` món của nhóm ở cấp luyện khí `level`: bậc từ floorBoostFrom trở lên ×
 * (1 + coreFactor × (cores − 1)) × (1 + levelFactor × (level − minLevel)); hệ số theo tầng cao nhất
 * nhân thêm khi tung (rollRarity).
 */
export function castRarityWeights(
  data: GameData,
  { cores, level }: { cores: number; level: number }
): Partial<Record<NormalRarity, number>> {
  const cast = data.config.forge.cast
  const boost =
    (1 + cast.coreFactor * (cores - 1)) *
    (1 + cast.levelFactor * Math.max(0, level - cast.minLevel))
  return boostRareWeights(data, cast.rarityWeights, boost)
}

/** Phụ linh món bậc này: imbue.cores[bậc] yêu đan cùng hệ + imbue.money × tầng cao nhất tiền. */
export function imbueCost(
  data: GameData,
  instance: EquipmentInstance,
  highestFloor: number
): { cores: number; money: Decimal } {
  const { cores, money } = data.config.forge.imbue
  return { cores: cores[instance.rarity], money: toBig(money).times(highestFloor) }
}

/** Tổng Đá cường hóa đã dùng để đưa món từ cấp 1 lên `level`: 1 + 2 + … + (level − 1). */
export const enhanceStonesUsed = (level: number): number => (level * (level - 1)) / 2

/**
 * Tẩy luyện sticker (docs/rules/skill-stickers.md): (1 + số thuộc tính khóa) × giá theo độ hiếm, đá
 * Tẩy luyện thạch và tiền × highestFloor.
 */
export function stickerRerollCost(
  data: GameData,
  {
    sticker,
    locked,
    highestFloor
  }: { sticker: StickerInstance; locked: number; highestFloor: number }
): { stones: number; money: Decimal } {
  const { stones, moneyPerFloor } = data.config.stickers.reroll
  const factor = 1 + locked
  return {
    stones: factor * stones[sticker.rarity],
    money: toBig(moneyPerFloor[sticker.rarity]).times(factor).times(highestFloor)
  }
}

/** Tẩy luyện: (1 + số dòng khóa) × rerollCost[bậc] Tẩy luyện thạch. */
export const rerollCost = (data: GameData, instance: EquipmentInstance, locked: number): number =>
  (1 + locked) * data.config.forge.rerollCost[instance.rarity]

/** Đồ chắc chắn nhận khi phân giải một món (Tẩy luyện thạch tung riêng theo tỉ lệ). */
export interface SalvageYield {
  enhanceStones: number
  /** % ra 1 Tẩy luyện thạch. */
  refiningChance: number
  /** Điểm hồn tinh (chỉ hồn khí). */
  soulPoints: number
}

/**
 * Phân giải: Đá cường hóa theo bậc + salvageRefundPercent % số đá đã dùng để cường hóa (làm tròn
 * xuống); hồn khí thêm điểm hồn tinh theo bậc.
 */
export function salvageYield(data: GameData, instance: EquipmentInstance): SalvageYield {
  const config = data.config.forge
  const refund = Math.floor((enhanceStonesUsed(instance.level) * config.salvageRefundPercent) / 100)
  return {
    // Cấp cực lớn: kẹp để số lượng vẫn là số nguyên an toàn của túi.
    enhanceStones: Math.min(
      Number.MAX_SAFE_INTEGER,
      config.salvageStones[instance.rarity] + refund
    ),
    refiningChance: config.salvageRefiningChance[instance.rarity],
    soulPoints: instance.soul ? config.salvageSoulPoints[instance.rarity] : 0
  }
}
