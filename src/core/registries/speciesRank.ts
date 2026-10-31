// Phẩm cấp loài (docs/rules/species-rank.md): nhãn G → X theo tổng chỉ số gốc của loài, huyền thoại
// cộng bậc, loài ghi đè được bằng `rank`. Không lưu, tính khi cần, không đổi chỉ số. Khác tư chất
// (aptitude.ts: chấm từng con theo gen).
// Đặt ở registries (như tư chất) để các tính năng sau (thu phục, khu bảo tồn...) dùng chung.

import {
  STAT_NAMES,
  type GameData,
  type Monster,
  type NormalSpecies,
  type SpeciesRankDef
} from '../model'
import { highestTierIndex } from './thresholdTiers'

/** Tổng chỉ số gốc của loài. */
export function baseStatTotal(species: Pick<NormalSpecies, 'baseStats'>): number {
  return STAT_NAMES.reduce((sum, stat) => sum + species.baseStats[stat], 0)
}

/** Thứ hạng của bậc (0 = thấp nhất); −1 nếu id không phải phẩm cấp loài. */
export function speciesRankIndex(data: GameData, rankId: string): number {
  return Object.keys(data.speciesRanks).indexOf(rankId)
}

/**
 * Phẩm cấp của loài thường: ghi đè `rank` nếu có; không thì theo tổng chỉ số gốc, loài huyền thoại
 * (catchRate ≤ legendaryCatchRate) cộng legendaryBonus bậc, tối đa bậc cao nhất.
 */
export function speciesRankOf(data: GameData, species: NormalSpecies): SpeciesRankDef {
  if (species.rank !== undefined) return data.speciesRanks[species.rank]
  const ranks = Object.values(data.speciesRanks)
  const { legendaryCatchRate, legendaryBonus } = data.config.speciesRank
  const total = baseStatTotal(species)
  const bonus = species.catchRate <= legendaryCatchRate ? legendaryBonus : 0
  const index = Math.min(highestTierIndex(ranks, (from) => total >= from) + bonus, ranks.length - 1)
  return ranks[index]
}

/** Phẩm cấp loài của quái: theo loài cung cấp chỉ số gốc (quái fuse theo loài của quái gốc). */
export function monsterSpeciesRankOf(
  data: GameData,
  monster: Pick<Monster, 'baseSpeciesId'>
): SpeciesRankDef {
  // baseSpeciesId của quái hợp lệ luôn là loài thường (validateMonster).
  return speciesRankOf(data, data.species[monster.baseSpeciesId] as NormalSpecies)
}
