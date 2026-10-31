// Tỉ lệ fuse thành công (mục Fusing): một hàm duy nhất, kẹp [0, 100]:
//   raceChances[mức hợp race] × lineageFactor^(số loài trong lineage của quái gốc)
//   + điểm của trait quái gốc (hook modifyFuseChance) + điểm của bùa tăng tỉ lệ.
// Shiny và boss không ảnh hưởng. Hệ số lineage là phép nhân nên tỉ lệ giảm dần mà không về 0
// (lineage cực dài thì số thực có thể chạm 0, khi đó chỉ còn điểm cộng).

import { forEachTraitHook, fusionAidChanceBonus } from '../registries'
import type { FuseRaceMatch, FusionAidItem, GameData, Monster } from '../model'
import { areRacesCompatible } from './breeding'

/** Độ hợp race: quái fuse giữ race gốc, nên so race của quái gốc với race của quái phụ. */
export function fuseRaceMatch(data: GameData, base: Monster, sub: Monster): FuseRaceMatch {
  if (base.raceId === sub.raceId) return 'same'
  return areRacesCompatible(data, base.raceId, sub.raceId) ? 'breedable' : 'other'
}

/** Điểm % trait của quái gốc cộng vào tỉ lệ (hook modifyFuseChance, theo cấp trait). */
function traitFuseChanceBonus(data: GameData, base: Monster): number {
  let points = 0
  forEachTraitHook(data, base, (handler, params, scale) => {
    points += handler.modifyFuseChance?.(params, scale, { data, monster: base }) ?? 0
  })
  return points
}

/** Tỉ lệ % fuse thành công, đã cộng bùa tăng tỉ lệ (nếu có), kẹp [0, 100]. */
export function fuseSuccessChance(
  data: GameData,
  base: Monster,
  sub: Monster,
  boostItem: FusionAidItem | null = null
): number {
  const { raceChances, lineageFactor } = data.config.fuseChance
  const chance =
    raceChances[fuseRaceMatch(data, base, sub)] * lineageFactor ** base.lineage.length +
    traitFuseChanceBonus(data, base) +
    (boostItem ? fusionAidChanceBonus(boostItem) : 0)
  return Math.min(100, Math.max(0, chance))
}
