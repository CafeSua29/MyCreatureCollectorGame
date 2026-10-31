// Cân nặng (mục "Cân nặng" ở battle.md): loài ghi `weightKg` thì dùng số đó; không thì ước lượng từ
// cân nặng điển hình của race theo tổng chỉ số gốc. Điểm duy nhất hỏi cân nặng (Heavy Ball, UI).

import type { GameData, Monster, NormalSpecies } from '../model'
import { baseStatTotal } from './speciesRank'

/** Cân nặng (kg) của loài thường. */
export function speciesWeightKg(data: GameData, species: NormalSpecies): number {
  if (species.weightKg !== undefined) return species.weightKg
  const { defaultRaceKg, referenceStatTotal, statExponent } = data.config.weight
  const raceKg = data.races[species.raceId]?.weightKg ?? defaultRaceKg
  return raceKg * (baseStatTotal(species) / referenceStatTotal) ** statExponent
}

/** Cân nặng (kg) của quái: theo loài hiện tại nếu là loài thường, không thì loài gốc (quái fuse). */
export function monsterWeightKg(
  data: GameData,
  monster: Pick<Monster, 'speciesId' | 'baseSpeciesId'>
): number {
  const current = data.species[monster.speciesId]
  // baseSpeciesId của quái hợp lệ luôn là loài thường (validateMonster).
  const species =
    current?.kind === 'normal' ? current : (data.species[monster.baseSpeciesId] as NormalSpecies)
  return speciesWeightKg(data, species)
}
